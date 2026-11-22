"""
Activity middleware (app/activity_middleware.py) - records every SUCCESSFUL change made by a signed-in user.

* create / update / delete / action requests (POST, PUT, PATCH, DELETE) on the FastAPI routes
* who: from the verified token (never from the browser); name, role and department are snapshotted
* what: the endpoint's own name ("record_fee_payment" -> "Record fee payment") and the module of the
  permission it requires (e.g. Finance); new modules are covered automatically
* which record: path id + name for the main records (students, staff, users, classes, invoices ...);
  for UPDATES of those, the fields that changed (before -> after)
* never: failed requests (4xx/5xx), read-only requests, sign-in, notifications, private messages, passwords
* a failure here never affects the user's request
Registered in main.py:   app.add_middleware(ActivityMiddleware, fastapi_app=app)
"""
import inspect
import json
import re
import time

from anyio import to_thread
from fastapi.routing import APIRoute
from starlette.routing import Match

WRITE = {"POST", "PUT", "PATCH", "DELETE"}
SKIP = re.compile(r"^/api/v1/(auth/|notifications/|messages/|activities|access/me|admission-portal/public/|users/profile/(theme|color-mode)|attendance-capture/(gate-scan|device/))"
                  r"|/(read|read-all|mark-read|dismiss|heartbeat|ping)$")
MAX_BODY = 64 * 1024

# main records, recognised from the request address: (address pattern, entity type, table, display name SQL)
ENTITIES = [
    (r"^/api/v1/students/(\d+)(?:/|$)", "student", "students", "first_name || ' ' || last_name"),
    (r"^/api/v1/teachers/(\d+)(?:/|$)", "teacher", "teachers", "first_name || ' ' || last_name"),
    (r"^/api/v1/staff/(\d+)(?:/|$)", "employee", "staff", "first_name || ' ' || last_name"),
    (r"^/api/v1/users/(\d+)(?:/|$)", "user", "users", "first_name || ' ' || last_name"),
    (r"^/api/v1/departments/(\d+)(?:/|$)", "department", "departments", "name"),
    (r"^/api/v1/designations/(\d+)(?:/|$)", "designation", "designations", "name"),
    (r"^/api/v1/academics/classes/(\d+)(?:/|$)", "class", "classes", "name || COALESCE(' (' || section || ')', '')"),
    (r"^/api/v1/academics/subjects/(\d+)(?:/|$)", "subject", "subjects", "name"),
    (r"^/api/v1/finance/invoices/(\d+)(?:/|$)", "invoice", "fee_invoices", "invoice_no"),
    (r"^/api/v1/admissions/applications/(\d+)(?:/|$)", "admission application", "admission_applications",
     "application_no || ' - ' || student_first_name || ' ' || student_last_name"),
    (r"^/api/v1/exams/(\d+)(?:/|$)", "exam", "exams", "name"),
    (r"^/api/v1/laboratory/labs/(\d+)(?:/|$)", "lab", "labs", "name || ' (' || code || ')'"),
    (r"^/api/v1/laboratory/equipment/(\d+)(?:/|$)", "lab equipment", "lab_equipment", "name || ' (' || code || ')'"),
    (r"^/api/v1/laboratory/consumables/(\d+)(?:/|$)", "lab consumable", "lab_consumables", "name || ' (' || code || ')'"),
    (r"^/api/v1/laboratory/issues/(\d+)(?:/|$)", "equipment request", "lab_equipment_issues", "number"),
]
ENTITIES = [(re.compile(p), t, tbl, n) for p, t, tbl, n in ENTITIES]
MODULE_BY_SEGMENT = {"hr": "HR", "staff": "HR", "departments": "HR", "designations": "HR", "leave": "HR", "my-leave": "HR",
                     "payroll": "Payroll", "finance": "Finance", "discounts": "Finance", "students": "Students", "teachers": "HR",
                     "admissions": "Admissions", "academics": "Academics", "attendance": "Attendance", "staff-attendance": "HR",
                     "exams": "Exams & Results", "promotions": "Exams & Results", "procurement": "Procurement & Inventory",
                     "library": "Library", "withdrawal": "Withdrawal", "discipline": "HR", "users": "Users & Access", "access": "Users & Access",
                     "settings": "Settings", "campuses": "Settings", "calendar": "Communication", "announcements": "Communication",
                     "syllabus": "Academics", "diary": "Academics", "assignments": "Academics", "quizzes": "Academics", "materials": "Academics",
                     "workflow": "Workflows", "laboratory": "Laboratory", "work-queue": "Workflows", "resignation": "HR", "leaves": "HR"}
VERBS_ACTION = re.compile(r"approve|reject|publish|verify|review|decide|submit|advance|close|reopen|escalate|resolve|assign|unlock|waive|"
                          r"register|promote|send|remind|activate|deactivate|reactivate|lock|cancel|refund|restore|return|withdraw", re.I)
VERBS_CREATE = re.compile(r"^(create|add|new|upload|apply|generate|record|issue|start|import|bulk)", re.I)


STATS = {"installed": False, "started_at": None, "changes_seen": 0, "recorded": 0, "skipped": {}, "last_skip": None, "last_error": None, "last_recorded": None}


def _skip(reason, path):
    STATS["skipped"][reason] = STATS["skipped"].get(reason, 0) + 1
    STATS["last_skip"] = {"reason": reason, "path": path, "at": time.strftime("%Y-%m-%d %H:%M:%S")}


def _perm_codes(dependant):
    out = []
    for d in getattr(dependant, "dependencies", []):
        try:
            nl = inspect.getclosurevars(d.call).nonlocals
            if isinstance(nl.get("code"), str): out.append(nl["code"])
            if isinstance(nl.get("codes"), (tuple, list)): out += [c for c in nl["codes"] if isinstance(c, str)]
        except Exception:
            pass
        out += _perm_codes(d)
    return out


def _humanize(name):
    words = re.sub(r"_+", " ", name or "").strip()
    return (words[:1].upper() + words[1:]) if words else "Change"


class ActivityMiddleware:
    def __init__(self, app, fastapi_app=None):
        self.app = app
        self.fastapi_app = fastapi_app
        STATS["installed"] = True; STATS["started_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        print("[activity] recorder active - every successful change by a signed-in user is recorded")
        self._routes = None
        self._labels, self._labels_at = {}, 0

    # ------------------------------------------------------------------ helpers (run in a worker thread)
    def _pool(self):
        from app.db import connection as flask_db_module
        return flask_db_module._pool

    def _with_cur(self, fn):
        import psycopg2.extras
        pool = self._pool(); conn = pool.getconn()
        try:
            conn.autocommit = True
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            return fn(cur)
        finally:
            try: pool.putconn(conn)
            except Exception: pass

    def _route_after(self, scope):
        """The FastAPI route that handled this request (set by the router while it ran). None = Flask / not found."""
        route, endpoint = scope.get("route"), scope.get("endpoint")
        if route is not None and hasattr(route, "dependant"):
            return route, getattr(route, "endpoint", endpoint)
        if callable(endpoint) and inspect.isfunction(endpoint) and self.fastapi_app is not None:   # older FastAPI: look it up
            for r in self.fastapi_app.routes:
                if isinstance(r, APIRoute) and r.endpoint is endpoint:
                    return r, endpoint
        return None, None

    def _labels_for(self, cur):
        if time.time() - self._labels_at > 300:
            cur.execute("SELECT code, label, module_label FROM permissions WHERE NOT COALESCE(is_legacy, FALSE)")
            self._labels = {r["code"]: (r["label"], r["module_label"]) for r in cur.fetchall()}
            self._labels_at = time.time()
        return self._labels

    @staticmethod
    def _entity_for(path):
        for rx, etype, table, name_sql in ENTITIES:
            m = rx.match(path)
            if m:
                return etype, table, name_sql, m.group(1)
        return None, None, None, None

    def _snapshot(self, table, name_sql, eid):
        def q(cur):
            cur.execute(f"SELECT t.*, ({name_sql}) AS __name FROM {table} t WHERE t.id = %s", (int(eid),))
            r = cur.fetchone()
            return dict(r) if r else None
        try:
            return self._with_cur(q)
        except Exception:
            return None

    # ------------------------------------------------------------------ ASGI
    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") not in WRITE:
            return await self.app(scope, receive, send)
        path = scope.get("path") or ""
        if not path.startswith("/api/v1/"):
            _skip("not an /api/v1 address", path); return await self.app(scope, receive, send)
        if SKIP.search(path):
            return await self.app(scope, receive, send)            # sign-in, notifications, messages ... (by design)
        STATS["changes_seen"] += 1
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        try:
            from app.fastapi_auth import _decode_token
            claims = _decode_token(headers.get("authorization"))
            if claims.get("type") not in (None, "access") or claims.get("2fa_pending"):
                _skip("not a normal sign-in token", path); return await self.app(scope, receive, send)
            user_id = int(claims["sub"])
        except Exception as e:
            _skip("not signed in / token not accepted" + ("" if headers.get("authorization") else " (no Authorization header)"), path)
            return await self.app(scope, receive, send)              # not signed in: nothing to record

        etype, table, name_sql, eid = self._entity_for(path)
        before = None
        if table and eid is not None and str(eid).isdigit() and scope["method"] in ("PUT", "PATCH", "DELETE"):
            before = await to_thread.run_sync(self._snapshot, table, name_sql, eid)

        body = bytearray(); is_json = "json" in headers.get("content-type", "")
        async def recv():
            msg = await receive()
            if msg.get("type") == "http.request" and is_json and len(body) < MAX_BODY:
                body.extend(msg.get("body") or b"")
            return msg
        status = {"code": 500}; resp = bytearray(); resp_json = {"on": False}
        async def snd(msg):
            if msg["type"] == "http.response.start":
                status["code"] = msg["status"]
                resp_json["on"] = any(k.lower() == b"content-type" and b"json" in v for k, v in msg.get("headers") or [])
            elif msg["type"] == "http.response.body" and resp_json["on"] and len(resp) < MAX_BODY:
                resp.extend(msg.get("body") or b"")
            await send(msg)

        await self.app(scope, recv, snd)
        route, endpoint = self._route_after(scope)
        if route is None:                                           # handled by the Flask fall-through
            _skip("handled by the older Flask part (not recorded yet)", path); return
        codes = _perm_codes(route.dependant); params = scope.get("path_params") or {}
        if not (200 <= status["code"] < 300):
            _skip(f"the request failed ({status['code']})", path); return   # failed operations are never recorded as done
        try:
            await to_thread.run_sync(self._record, scope, headers, user_id, endpoint, codes, params, etype, table, name_sql, eid, before,
                                     bytes(body), bytes(resp))
        except Exception as e:                                      # never affects the user's request
            STATS["last_error"] = f"{type(e).__name__}: {e} ({path})"
            print("[activity] not recorded:", STATS["last_error"])

    # ------------------------------------------------------------------ the record
    def _record(self, scope, headers, user_id, endpoint, codes, params, etype, table, name_sql, eid, before, body, resp):
        from app.utils.activity import log_activity, changed_fields, sanitize
        method, fname = scope["method"], getattr(endpoint, "__name__", "change")
        req = None
        try: req = json.loads(body.decode("utf-8")) if body else None
        except Exception: req = None
        res = None
        try: res = json.loads(resp.decode("utf-8")) if resp else None
        except Exception: res = None
        created_id = (res or {}).get("data", {}).get("id") if isinstance((res or {}).get("data"), dict) else None

        def write(cur):
            labels = self._labels_for(cur)
            lab = next((labels[c] for c in codes if c in labels), None)
            seg = (scope.get("path") or "")[len("/api/v1/"):].split("/")[0]
            module = (lab[1] if lab else None) or MODULE_BY_SEGMENT.get(seg) or seg.replace("-", " ").title() or "General"
            action = _humanize(fname)
            if method == "DELETE" or re.match(r"^(delete|remove)", fname): atype = "delete"
            elif VERBS_ACTION.search(fname): atype = "action"
            elif method == "POST" and (VERBS_CREATE.match(fname) or eid is None): atype = "create"
            else: atype = "update"
            after = self._snapshot(table, name_sql, eid) if (table and eid is not None and str(eid).isdigit() and method in ("PUT", "PATCH", "POST")) else None
            name = (after or before or {}).get("__name")
            old_v = new_v = None
            if before and after:
                old_v, new_v = changed_fields(before, after)
            elif before and atype == "delete":
                old_v = {k: v for k, v in before.items() if k != "__name"}
            elif isinstance(req, dict):
                new_v = req
            if not name and isinstance(req, dict):
                name = req.get("name") or req.get("title") or (" ".join(x for x in (req.get("first_name"), req.get("last_name")) if x) or None)
            ent_id = eid if eid is not None else created_id
            desc = action + (f": {name}" if name else "")
            if old_v and new_v:
                desc += " (" + ", ".join(sorted(new_v.keys())[:6]).replace("_", " ") + (" ..." if len(new_v) > 6 else "") + ")"
            ip = (headers.get("x-forwarded-for") or "").split(",")[0].strip() or ((scope.get("client") or [None])[0])
            campus = headers.get("x-campus-id")
            log_activity(cur, user_id=user_id, module=module, activity_type=atype, action=action, description=desc,
                         entity_type=etype or (seg.rstrip("s") if eid is not None else None), entity_id=ent_id, entity_name=name,
                         old_values=old_v, new_values=new_v if new_v else None,
                         metadata={"permission": codes[0] if codes else None, "params": {k: str(v) for k, v in params.items()}},
                         ip_address=ip, user_agent=headers.get("user-agent"), request_method=method, request_path=scope.get("path"),
                         campus_id=int(campus) if campus and campus.isdigit() else None)
        self._with_cur(write)
        STATS["recorded"] += 1
        STATS["last_recorded"] = {"path": scope.get("path"), "at": time.strftime("%Y-%m-%d %H:%M:%S")}
