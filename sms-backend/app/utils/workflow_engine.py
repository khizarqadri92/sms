"""
WorkflowEngine — Universal, module-agnostic workflow engine for SMS.

Any module triggers and advances workflows through this single interface.
All routing, step resolution, notifications, and WQ item management
are handled here. Modules contain zero approval logic.

Usage:
    from app.utils.workflow_engine import WorkflowEngine
    engine = WorkflowEngine()

    # Start a workflow
    instance = engine.trigger(db, module="leaves", entity_type="leave_application",
        entity_id=34, initiated_by=user_id, submitter_id=student_user_id,
        context={"leave_type_id": 2, "duration": 3})

    # Advance a step
    result = engine.advance(db, module="leaves", entity_type="leave_application",
        entity_id=34, action="approve", actioned_by=user_id, note="")

    # Cancel a workflow
    engine.cancel(db, module="leaves", entity_type="leave_application", entity_id=34)

    # Get current status
    status = engine.get_status(db, module="leaves", entity_type="leave_application", entity_id=34)
"""

import json
from typing import Optional, Dict, Any
import psycopg2.extras
from app.utils.processing_date import get_processing_datetime


OPERATOR_MAP = {
    '>':      lambda a, b: float(a) > float(b),
    '<':      lambda a, b: float(a) < float(b),
    '>=':     lambda a, b: float(a) >= float(b),
    '<=':     lambda a, b: float(a) <= float(b),
    '=':      lambda a, b: str(a) == str(b),
    '!=':     lambda a, b: str(a) != str(b),
    'in':     lambda a, b: str(a) in [x.strip() for x in b.split(',')],
    'not_in': lambda a, b: str(a) not in [x.strip() for x in b.split(',')],
}


class WorkflowEngine:

    # ─── Core API ─────────────────────────────────────────────────────────────

    def trigger(self, db, module: str, entity_type: str, entity_id: int,
                initiated_by: int, submitter_id: Optional[int] = None,
                context: Optional[Dict] = None) -> Optional[Dict]:
        """
        Start a workflow for an entity.
        Finds the best matching workflow via workflow_assignments,
        creates a workflow_instance, resolves which steps to run
        (evaluating conditions), creates step_instances, and
        activates the first step (notification + WQ item).
        Returns the instance dict or None if no workflow matched.
        """
        context = context or {}
        cur = self._cur(db)
        proc_time = get_processing_datetime(db)

        # 1. Find matching workflow
        workflow = self._find_workflow(cur, module, entity_type, context)
        if not workflow:
            return None

        # 2. Prevent duplicate instances
        cur.execute(
            "SELECT id, status FROM workflow_instances WHERE module=%s AND entity_type=%s AND entity_id=%s",
            (module, entity_type, entity_id)
        )
        existing = cur.fetchone()
        if existing and existing['status'] == 'active':
            return dict(existing)
        if existing:
            cur.execute("DELETE FROM workflow_instances WHERE id=%s", (existing['id'],))

        # 3. Create instance
        cur.execute("""
            INSERT INTO workflow_instances
                (workflow_id, module, entity_type, entity_id, status, current_step_order,
                 context, initiated_by, submitter_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s, 'active', 1, %s::jsonb, %s, %s, %s, %s)
            RETURNING id
        """, (workflow['id'], module, entity_type, entity_id,
              json.dumps(context), initiated_by, submitter_id or initiated_by, proc_time, proc_time))
        instance_id = cur.fetchone()['id']

        # 4. Load steps and evaluate conditions
        cur.execute("""
            SELECT s.*, array_agg(row_to_json(c.*)) FILTER (WHERE c.id IS NOT NULL) AS conditions
            FROM workflow_steps s
            LEFT JOIN workflow_conditions c ON c.step_id = s.id
            WHERE s.workflow_id = %s
            GROUP BY s.id ORDER BY s.step_order
        """, (workflow['id'],))
        all_steps = cur.fetchall()

        active_steps = []
        for step in all_steps:
            conditions = step['conditions'] or []
            if isinstance(conditions[0], str) if conditions else False:
                conditions = [json.loads(c) for c in conditions]
            if self._step_should_run(step, conditions, context):
                active_steps.append(step)

        if not active_steps:
            # No steps — complete immediately
            cur.execute(
                "UPDATE workflow_instances SET status='completed', completed_at=%s WHERE id=%s",
                (proc_time, instance_id)
            )
            return {'id': instance_id, 'status': 'completed', 'workflow_id': workflow['id']}

        # 5. Create step instances
        for i, step in enumerate(active_steps):
            assigned_to_id, assigned_role = self._resolve_approver(cur, step, context)
            cur.execute("""
                INSERT INTO workflow_step_instances
                    (instance_id, step_id, step_order, step_name, step_type,
                     status, assigned_to_id, assigned_role, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (instance_id, step['id'], i + 1, step['step_name'], step['step_type'],
                  'pending' if i == 0 else 'pending',
                  assigned_to_id, assigned_role, proc_time))

        # 6. Activate first step
        cur.execute("""
            UPDATE workflow_instances SET current_step_order=1 WHERE id=%s
        """, (instance_id,))

        first_step = active_steps[0]
        assigned_to_id, assigned_role = self._resolve_approver(cur, first_step, context)
        self._activate_step(db, cur, instance_id, first_step, assigned_to_id,
                            assigned_role, module, entity_type, entity_id,
                            initiated_by, submitter_id or initiated_by)

        return {'id': instance_id, 'status': 'active', 'workflow_id': workflow['id'],
                'current_step': first_step['step_name']}

    def advance(self, db, module: str, entity_type: str, entity_id: int,
                action: str, actioned_by: int, note: str = "") -> Optional[Dict]:
        """
        Advance a workflow by actioning the current pending step.
        action: 'approve' | 'reject' | 'recommend' | 'verify' | 'clear' | 'publish'
        Returns dict with next_step info or completion status.
        """
        cur = self._cur(db)
        proc_time = get_processing_datetime(db)

        # Get active instance
        cur.execute("""
            SELECT wi.*, wd.name AS workflow_name
            FROM workflow_instances wi
            JOIN workflow_definitions wd ON wd.id = wi.workflow_id
            WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s AND wi.status='active'
        """, (module, entity_type, entity_id))
        instance = cur.fetchone()
        if not instance:
            return None

        # Get current pending step
        cur.execute("""
            SELECT wsi.*, ws.entity_status_on_approve, ws.entity_status_on_reject,
                   ws.notify_title, ws.notify_body, ws.wq_link_template,
                   ws.step_name, ws.step_type, ws.can_reject
            FROM workflow_step_instances wsi
            JOIN workflow_steps ws ON ws.id = wsi.step_id
            WHERE wsi.instance_id=%s AND wsi.status='pending'
            ORDER BY wsi.step_order LIMIT 1
        """, (instance['id'],))
        current_step_inst = cur.fetchone()
        if not current_step_inst:
            return {'status': 'no_pending_step'}

        # Validate action
        is_rejection = action in ('reject', 'rejected')
        if is_rejection and not current_step_inst['can_reject']:
            return {'error': 'This step cannot be rejected.'}

        # Mark current step
        new_status = 'rejected' if is_rejection else 'approved'
        cur.execute("""
            UPDATE workflow_step_instances
            SET status=%s, actioned_by=%s, actioned_at=%s, note=%s
            WHERE id=%s
        """, (new_status, actioned_by, proc_time, note, current_step_inst['id']))

        # Complete WQ item if linked
        if current_step_inst.get('wq_item_id'):
            cur.execute("""
                UPDATE work_queue_items
                SET status='completed', completed_by=%s, completed_at=%s, updated_at=%s
                WHERE id=%s
            """, (actioned_by, proc_time, proc_time, current_step_inst['wq_item_id']))

        if is_rejection:
            # Reject: skip remaining steps, complete instance as rejected
            cur.execute("""
                UPDATE workflow_step_instances SET status='skipped'
                WHERE instance_id=%s AND status='pending' AND id != %s
            """, (instance['id'], current_step_inst['id']))
            cur.execute("""
                UPDATE workflow_instances
                SET status='rejected', completed_at=%s, updated_at=%s
                WHERE id=%s
            """, (proc_time, proc_time, instance['id']))

            # Update WQ items for this entity
            entity_status = current_step_inst.get('entity_status_on_reject') or 'rejected'
            self._update_entity_wq(cur, module, entity_id, entity_type,
                                   entity_status, actioned_by, proc_time=proc_time)
            return {'status': 'rejected', 'entity_status': entity_status}

        # Approval: find next pending step
        cur.execute("""
            SELECT wsi.*, ws.step_name, ws.step_type, ws.approver_type,
                   ws.approver_role, ws.approver_user_id, ws.approver_lookup,
                   ws.entity_status_on_approve, ws.notify_on_assign,
                   ws.notify_title, ws.notify_body, ws.wq_link_template,
                   ws.wq_priority, ws.action_label
            FROM workflow_step_instances wsi
            JOIN workflow_steps ws ON ws.id = wsi.step_id
            WHERE wsi.instance_id=%s AND wsi.status='pending'
            ORDER BY wsi.step_order LIMIT 1
        """, (instance['id'],))
        next_step_inst = cur.fetchone()

        entity_status_on_approve = current_step_inst.get('entity_status_on_approve')

        if not next_step_inst:
            # All steps done — complete workflow
            cur.execute("""
                UPDATE workflow_instances
                SET status='completed', completed_at=%s, updated_at=%s
                WHERE id=%s
            """, (proc_time, proc_time, instance['id']))
            final_status = (entity_status_on_approve or 'approved').lower()
            self._update_entity_wq(cur, module, entity_id, entity_type,
                                   final_status, actioned_by, proc_time=proc_time)
            return {'status': 'completed', 'entity_status': final_status}

        # Activate next step
        context = instance.get('context') or {}
        if isinstance(context, str):
            context = json.loads(context)

        assigned_to_id, assigned_role = self._resolve_approver(cur, next_step_inst, context)

        # Update assignment on step instance
        cur.execute("""
            UPDATE workflow_step_instances
            SET assigned_to_id=%s, assigned_role=%s
            WHERE id=%s
        """, (assigned_to_id, assigned_role, next_step_inst['id']))

        cur.execute("""
            UPDATE workflow_instances SET current_step_order=%s, updated_at=%s
            WHERE id=%s
        """, (next_step_inst['step_order'], proc_time, instance['id']))

        # Intermediate entity status
        if entity_status_on_approve:
            self._update_entity_wq(cur, module, entity_id, entity_type,
                                   entity_status_on_approve, actioned_by,
                                   next_assignee_id=assigned_to_id,
                                   next_assignee_role=assigned_role, proc_time=proc_time)

        self._activate_step(db, cur, instance['id'], next_step_inst,
                            assigned_to_id, assigned_role,
                            module, entity_type, entity_id,
                            actioned_by, instance.get('submitter_id'))

        return {
            'status': 'advanced',
            'next_step': next_step_inst['step_name'],
            'next_step_type': next_step_inst['step_type'],
            'assigned_to_id': assigned_to_id,
            'assigned_role': assigned_role,
            'entity_status': entity_status_on_approve,
        }

    def cancel(self, db, module: str, entity_type: str, entity_id: int) -> bool:
        cur = self._cur(db)
        proc_time = get_processing_datetime(db)
        cur.execute("""
            UPDATE workflow_instances SET status='cancelled', updated_at=%s
            WHERE module=%s AND entity_type=%s AND entity_id=%s AND status='active'
            RETURNING id
        """, (proc_time, module, entity_type, entity_id))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE workflow_step_instances SET status='skipped' WHERE instance_id=%s AND status='pending'", (row['id'],))
            cur.execute("UPDATE work_queue_items SET status='cancelled', updated_at=%s WHERE module=%s AND entity_id=%s AND status='pending'", (proc_time, module, entity_id))
        return bool(row)

    def get_status(self, db, module: str, entity_type: str, entity_id: int) -> Optional[Dict]:
        cur = self._cur(db)
        cur.execute("""
            SELECT wi.*, wd.name AS workflow_name,
                   json_agg(json_build_object(
                       'id', wsi.id, 'step_order', wsi.step_order,
                       'step_name', wsi.step_name, 'step_type', wsi.step_type,
                       'status', wsi.status, 'assigned_role', wsi.assigned_role,
                       'assigned_to_id', wsi.assigned_to_id,
                       'actioned_at', wsi.actioned_at, 'note', wsi.note,
                       'action_label', ws.action_label,
                       'reject_label', ws.reject_label,
                       'can_reject', ws.can_reject
                   ) ORDER BY wsi.step_order) AS steps
            FROM workflow_instances wi
            JOIN workflow_definitions wd ON wd.id = wi.workflow_id
            LEFT JOIN workflow_step_instances wsi ON wsi.instance_id = wi.id
            LEFT JOIN workflow_steps ws ON ws.id = wsi.step_id
            WHERE wi.module=%s AND wi.entity_type=%s AND wi.entity_id=%s
            GROUP BY wi.id, wd.name
            ORDER BY wi.created_at DESC LIMIT 1
        """, (module, entity_type, entity_id))
        row = cur.fetchone()
        if not row:
            return None
        result = dict(row)
        for k in ('created_at', 'updated_at', 'completed_at'):
            if result.get(k): result[k] = str(result[k])
        return result

    def get_pending_for_user(self, db, user_id: int, roles: list) -> list:
        """Get all pending step instances assigned to a user or their roles."""
        cur = self._cur(db)
        cur.execute("""
            SELECT wsi.id AS step_instance_id, wsi.step_name, wsi.step_type,
                   wsi.assigned_role, wsi.assigned_to_id,
                   wi.module, wi.entity_type, wi.entity_id,
                   wi.context, wd.name AS workflow_name, wd.code AS workflow_code
            FROM workflow_step_instances wsi
            JOIN workflow_instances wi ON wi.id = wsi.instance_id
            JOIN workflow_definitions wd ON wd.id = wi.workflow_id
            WHERE wsi.status = 'pending'
              AND (wsi.assigned_to_id = %s OR wsi.assigned_role = ANY(%s::varchar[]))
        """, (user_id, roles))
        return [dict(r) for r in cur.fetchall()]

    # ─── Internal helpers ──────────────────────────────────────────────────────

    def _cur(self, db):
        return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def _find_workflow(self, cur, module: str, entity_type: str, context: dict) -> Optional[Dict]:
        """Find best matching workflow via assignments + multi-condition table."""
        cur.execute("""
            SELECT wa.*
            FROM workflow_assignments wa
            JOIN workflow_definitions wd ON wd.id = wa.workflow_id
            WHERE wa.module = %s AND wa.entity_type = %s
              AND wa.is_active = TRUE AND wd.is_active = TRUE
            ORDER BY wa.is_default ASC, wa.priority DESC
        """, (module, entity_type))
        assignments = cur.fetchall()

        best = None
        for a in assignments:
            # Load all conditions for this assignment
            cur.execute(
                "SELECT * FROM workflow_assignment_conditions WHERE assignment_id=%s",
                (a['id'],)
            )
            conditions = cur.fetchall()

            if conditions:
                # ALL conditions must match (AND logic)
                all_match = True
                for cond in conditions:
                    val = context.get(cond['field'])
                    if val is None:
                        all_match = False
                        break
                    op_fn = OPERATOR_MAP.get(cond['operator'])
                    if not op_fn:
                        all_match = False
                        break
                    try:
                        _r=op_fn(str(val).lower(), str(cond['value']).strip().lower())
                        if not _r:
                            all_match = False
                            break
                    except Exception:
                        all_match = False
                        break
                if not all_match:
                    continue

            best = a
            if not a['is_default']:
                break

        if not best:
            return None

        cur.execute("SELECT * FROM workflow_definitions WHERE id=%s", (best['workflow_id'],))
        return cur.fetchone()

    def _step_should_run(self, step, conditions, context: dict) -> bool:
        """Evaluate step conditions — default to include unless 'skip_step' condition matches."""
        if not conditions:
            return True
        for cond in conditions:
            if isinstance(cond, str):
                cond = json.loads(cond)
            field = cond.get('field')
            val = context.get(field)
            if val is None:
                continue
            op_fn = OPERATOR_MAP.get(cond.get('operator', '='))
            if not op_fn:
                continue
            try:
                match = op_fn(val, cond.get('value', ''))
            except Exception:
                continue
            if match and cond.get('effect') == 'skip_step':
                return False
            if match and cond.get('effect') == 'include_step':
                return True
        return True

    def _resolve_approver(self, cur, step, context: dict):
        """Resolve the actual user_id and role for a step's approver."""
        approver_type = step.get('approver_type', 'role')
        assigned_to_id = None
        assigned_role = step.get('approver_role')

        if approver_type == 'specific_user':
            assigned_to_id = step.get('approver_user_id')
        elif approver_type == 'role':
            assigned_role = step.get('approver_role')
            # Optionally pick first user with that role
            if assigned_role:
                cur.execute("""
                    SELECT u.id FROM users u
                    JOIN user_roles ur ON ur.user_id = u.id
                    JOIN roles r ON r.id = ur.role_id
                    WHERE r.name = %s AND u.is_active = TRUE LIMIT 1
                """, (assigned_role,))
                row = cur.fetchone()
                if row:
                    assigned_to_id = row['id']
        elif approver_type == 'class_teacher':
            entity_id = context.get('entity_id')
            student_id = context.get('student_id')
            if student_id:
                cur.execute("""
                    SELECT t.user_id FROM students s
                    JOIN class_teachers ct ON ct.class_id = s.class_id AND ct.is_primary = TRUE
                    JOIN teachers t ON t.id = ct.teacher_id
                    WHERE s.id = %s LIMIT 1
                """, (student_id,))
                row = cur.fetchone()
                if row:
                    assigned_to_id = row['user_id']
            assigned_role = 'teacher'
        elif approver_type == 'dept_head':
            dept_id = context.get('department_id')
            if dept_id:
                cur.execute("""
                    SELECT head_user_id FROM departments WHERE id=%s
                """, (dept_id,))
                row = cur.fetchone()
                if row:
                    assigned_to_id = row['head_user_id']
            assigned_role = 'department_head'
        elif approver_type == 'designation':
            # approver_lookup holds the exact designation name (e.g. "Finance Manager").
            # Lets a step target a specific job title rather than a whole shared role,
            # since multiple designations (Accountant, Finance Officer, Finance Manager)
            # can share one broad permission role.
            designation_name = step.get('approver_lookup')
            if designation_name:
                cur.execute("""
                    SELECT s.user_id FROM staff s
                    JOIN designations d ON d.id = s.designation_id
                    WHERE d.name = %s AND s.status = 'active'
                    LIMIT 1
                """, (designation_name,))
                row = cur.fetchone()
                if row:
                    assigned_to_id = row['user_id']
            assigned_role = step.get('approver_role')

        return assigned_to_id, assigned_role

    def _activate_step(self, db, cur, instance_id: int, step, assigned_to_id,
                       assigned_role, module: str, entity_type: str,
                       entity_id: int, triggered_by: int, submitter_id: int):
        """Create WQ item and send notification for the step."""
        proc_time = get_processing_datetime(db)
        # Build WQ link
        link = step.get('wq_link_template')
        if not link:
            try:
                _ml_cur = db.cursor()
                _ml_cur.execute('SELECT page_link FROM workflow_module_links WHERE module=%s AND entity_type=%s', (module, entity_type))
                _ml = _ml_cur.fetchone()
                link = (_ml[0] + '?id={entity_id}') if _ml else f'/{module}'
            except Exception as _ml_e:
                print('[engine link error]', _ml_e)
                link = f'/{module}'
        link = link.replace('{entity_id}', str(entity_id))

        # Create WQ item
        priority = step.get('wq_priority') or 'normal'
        action_label = step.get('action_label') or step.get('step_type') or 'approve'

        try:
            cur.execute("""
                INSERT INTO work_queue_items
                    (module, entity_type, entity_id, title, description, action_required,
                     priority, assigned_role, assigned_user_id, link, metadata,
                     entity_status, created_by, submitter_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{}'::jsonb, %s, %s, %s, %s, %s)
                RETURNING id
            """, (module, entity_type, entity_id,
                  step.get('step_name', 'Pending Action'),
                  f"Action required: {action_label}",
                  action_label.lower(),
                  priority, assigned_role, assigned_to_id,
                  link, 'pending', triggered_by, submitter_id, proc_time, proc_time))
            wq_row = cur.fetchone()
            wq_id = wq_row['id'] if wq_row else None

            if wq_id:
                # Link WQ item to step instance
                cur.execute("""
                    UPDATE workflow_step_instances SET wq_item_id=%s
                    WHERE instance_id=%s AND step_order=(
                        SELECT step_order FROM workflow_step_instances
                        WHERE instance_id=%s AND status='pending'
                        ORDER BY step_order LIMIT 1
                    )
                """, (wq_id, instance_id, instance_id))
        except Exception as e:
            print('[workflow] WQ insert error:', e)

        # Send notification
        if step.get('notify_on_assign', True):
            try:
                from app.utils.notify import send_notification
                import main as _main
                title = step.get('notify_title') or 'Action Required'
                body  = step.get('notify_body') or f'You have a pending {action_label} action.'
                with _main.flask_app.app_context():
                    if assigned_to_id:
                        send_notification(assigned_to_id, title, body, 'info', link)
                    elif assigned_role:
                        cur.execute("""
                            SELECT u.id FROM users u
                            JOIN user_roles ur ON ur.user_id=u.id
                            JOIN roles r ON r.id=ur.role_id
                            WHERE r.name=%s AND u.is_active=TRUE
                        """, (assigned_role,))
                        for row in cur.fetchall():
                            send_notification(row['id'], title, body, 'info', link)
            except Exception as e:
                print('[workflow] notify error:', e)

    def _update_entity_wq(self, cur, module: str, entity_id: int, entity_type: str,
                          entity_status: str, actioned_by: int,
                          next_assignee_id=None, next_assignee_role=None, proc_time=None):
        """Update all WQ items for an entity to reflect new status."""
        from datetime import datetime as _dt, timezone as _tz
        ts = proc_time or _dt.now(_tz.utc)
        # IMPORTANT: must also filter by entity_type, not just (module, entity_id).
        # Different workflows on the same underlying record (e.g. a resignation's
        # main approval flow, its clearance checklist, and its experience letter
        # review) all share the same entity_id since they key off the same
        # resignation row - without this filter, updating one workflow's status
        # would incorrectly overwrite WQ items belonging to a completely
        # different, unrelated workflow on that same entity_id.
        try:
            if next_assignee_id or next_assignee_role:
                cur.execute("""
                    UPDATE work_queue_items SET
                        entity_status=%s, assigned_user_id=%s, assigned_role=%s, updated_at=%s
                    WHERE module=%s AND entity_id=%s AND entity_type=%s AND status='pending'
                      AND (action_required IS NULL OR (action_required != 'submit_remarks' AND action_required != 'view'))
                """, (entity_status, next_assignee_id, next_assignee_role, ts, module, entity_id, entity_type))
            else:
                cur.execute("""
                    UPDATE work_queue_items
                SET entity_status=%s, updated_at=%s
                WHERE module=%s AND entity_id=%s AND entity_type=%s
                  AND (action_required IS NULL OR (action_required != 'submit_remarks' AND action_required != 'view'))
                """, (entity_status, ts, module, entity_id, entity_type))
        except Exception as e:
            print('[workflow] entity WQ update error:', e)


# Singleton instance — import and use everywhere
engine = WorkflowEngine()
