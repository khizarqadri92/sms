import os, shutil, uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur
from app.utils.processing_date import get_processing_datetime, get_processing_date
from app.fastapi_campus import get_current_campus_id
from app.fastapi_campus import catalog_campus_id, catalog_campus_id_for_write
from app.fastapi_campus import get_settings_campus_id
from app.fastapi_campus import governed_settings_campus_id, governed_settings_campus_id_for_write
from app.fastapi_campus import enforce_same_campus


def _check_staff_campus(cur, staff_id: int, caller_campus_id):
    cur.execute("SELECT campus_id FROM staff WHERE id = %s", (staff_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)

def _check_leave_policy_campus(cur, policy_id: int, caller_campus_id):
    cur.execute("SELECT campus_id FROM staff_leave_policies WHERE id = %s", (policy_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)

def _check_leave_balance_campus(cur, balance_id: int, caller_campus_id):
    cur.execute("SELECT u.campus_id FROM staff_leave_balances slb JOIN users u ON u.id = slb.user_id WHERE slb.id = %s", (balance_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)

def _check_leave_request_campus(cur, req_id: int, caller_campus_id):
    cur.execute("SELECT u.campus_id FROM staff_leave_requests slr JOIN users u ON u.id = slr.user_id WHERE slr.id = %s", (req_id,))
    row = cur.fetchone()
    enforce_same_campus(row["campus_id"] if row else None, caller_campus_id)

def get_cur(db):
    return _get_cur(db)

def ok(data=None, message=None):
    body = {"success": True}
    if data is not None: body["data"] = data
    if message: body["message"] = message
    return body

def fail(message: str, status_code: int = 400):
    from fastapi import HTTPException
    raise HTTPException(status_code=status_code, detail={"success": False, "message": message})


def _own_campus_id(cur, user_id):
    cur.execute("SELECT campus_id FROM users WHERE id=%s", (user_id,))
    row = cur.fetchone()
    return row["campus_id"] if row else None


def _check_department_write_access(cur, dept_id, raw_campus_id, own_campus_id):
    """Top-level departments (no parent_id) are always global by hard rule -
    only superadmin (own_campus_id is None) may edit/delete them. Sub-
    departments follow the "Sub Departments" Setting Governance mode:
    global (superadmin-only, same as top-level) or per-campus (enforce the
    caller's campus matches the record's own campus_id)."""
    cur.execute("SELECT parent_id, campus_id FROM departments WHERE id=%s", (dept_id,))
    row = cur.fetchone()
    if not row:
        fail("Department not found.", 404)
    if row["parent_id"] is None:
        if own_campus_id is not None:
            fail("Top-level departments are managed centrally by the superadmin.", 403)
        return
    cur.execute("SELECT mode FROM setting_governance WHERE entity_key='sub_departments'")
    gov = cur.fetchone()
    if gov and gov["mode"] == "global":
        if own_campus_id is not None:
            fail("Sub-departments are managed centrally by the superadmin (Global mode).", 403)
        return
    enforce_same_campus(row["campus_id"], raw_campus_id)

router = APIRouter(prefix="/hr", tags=["HR"])

DATE_KEYS = ["date_of_birth","joining_date","contract_end_date","uploaded_at","created_at"]

def fmt(row):
    if not row: return row
    d = dict(row)
    for k in DATE_KEYS:
        if k in d and d[k] is not None:
            d[k] = str(d[k])[:10]
    return d

class StaffIn(BaseModel):
    first_name: str
    last_name: str
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    cnic: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    designation_id: Optional[int] = None
    department_id: Optional[int] = None
    employment_type: Optional[str] = "full_time"
    joining_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    salary: Optional[float] = None
    employee_code: Optional[str] = None
    user_id: Optional[int] = None

class DesignationIn(BaseModel):
    name: str
    department_id: Optional[int] = None

class EmergencyContactIn(BaseModel):
    name: str
    relationship: Optional[str] = None
    phone: str
    address: Optional[str] = None

# ─── DEPARTMENTS ─────────────────────────────────────────────────
@router.get("/departments")
def list_departments(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("sub_departments"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_departments(%s)", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.get("/departments/{dept_id}/allowed-roles")
def get_allowed_roles(dept_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT parent_id, campus_id FROM departments WHERE id=%s", (dept_id,))
    row = cur.fetchone()
    if row: enforce_same_campus(row["campus_id"], campus_id)
    source_id = row["parent_id"] if row and row["parent_id"] else dept_id
    cur.execute("SELECT r.id, r.name FROM department_roles dr JOIN roles r ON r.id=dr.role_id WHERE dr.department_id=%s ORDER BY r.name", (source_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

class DepartmentIn(BaseModel):
    name: str
    parent_id: Optional[int] = None
    is_parent: Optional[bool] = False

@router.post("/departments")
def create_department(body: DepartmentIn, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    _own_cid = _own_campus_id(get_cur(db), user_id)
    if not body.parent_id and _own_cid is not None:
        fail("Top-level departments are managed centrally by the superadmin.", 403)
    # Top-level departments (no parent_id) are fixed to the shared/global
    # set - superadmin manages that list directly, campuses cannot fork it.
    # Sub-departments (parent_id set) follow the "Sub Departments" setting
    # in Setting Governance: global (shared by every campus) or per-campus
    # (each campus keeps its own, visible only there). A superadmin must
    # pick a specific campus before adding a per-campus sub-department -
    # otherwise every campus would end up seeing it.
    cur = get_cur(db)
    if body.parent_id:
        cur.execute("SELECT mode FROM setting_governance WHERE entity_key='sub_departments'")
        gov = cur.fetchone()
        sub_dept_campus_id = None if (gov and gov["mode"] == "global") else raw_campus_id
        if sub_dept_campus_id is None and not (gov and gov["mode"] == "global"):
            fail("Select a specific campus before adding a sub-department.", 400)
        campus_id = sub_dept_campus_id
    else:
        campus_id = None
    cur.execute("INSERT INTO departments(name, parent_id, is_parent, created_at, campus_id) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(name, campus_id) DO NOTHING RETURNING id",
        (body.name, body.parent_id, body.is_parent, get_processing_datetime(db), campus_id))
    row = cur.fetchone()
    if not row: fail("Department already exists.", 400)
    if body.parent_id:
        cur.execute("UPDATE departments SET is_parent=true WHERE id=%s", (body.parent_id,))
    db.commit()
    return ok(message="Department created.")

@router.put("/departments/{dept_id}")
def update_department(dept_id: int, body: DepartmentIn, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_department_write_access(cur, dept_id, raw_campus_id, _own_campus_id(cur, user_id))
    cur.execute("UPDATE departments SET name=%s WHERE id=%s", (body.name, dept_id))
    db.commit()
    return ok(message="Department updated.")

@router.delete("/departments/{dept_id}")
def delete_department(dept_id: int, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), raw_campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_department_write_access(cur, dept_id, raw_campus_id, _own_campus_id(cur, user_id))
    cur.execute("SELECT COUNT(*) AS cnt FROM departments WHERE parent_id=%s AND is_active=true", (dept_id,))
    if cur.fetchone()["cnt"] > 0: fail("Cannot delete: has active child departments.", 400)
    cur.execute("UPDATE departments SET is_active=false WHERE id=%s", (dept_id,))
    db.commit()
    return ok(message="Department deactivated.")

# ─── DESIGNATIONS ────────────────────────────────────────────────
@router.get("/designations")
def list_designations(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("designations"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_designations(%s)", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/designations")
def create_designation(body: DesignationIn, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("designations"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_designation(%s,%s,%s)", (body.name, body.department_id, campus_id))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Designation created.")

@router.put("/designations/{des_id}")
def update_designation(des_id: int, body: DesignationIn, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("designations"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM designations WHERE id=%s", (des_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE designations SET name=%s, department_id=%s WHERE id=%s", (body.name, body.department_id, des_id))
    db.commit()
    return ok(message="Designation updated.")

@router.delete("/designations/{des_id}")
def delete_designation(des_id: int, user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("designations"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM designations WHERE id=%s", (des_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE designations SET is_active=false WHERE id=%s", (des_id,))
    db.commit()
    return ok(message="Designation removed.")

# ─── STAFF ───────────────────────────────────────────────────────
@router.get("/staff")
def list_staff(
    department_id: Optional[int] = None,
    status: Optional[str] = None,
    employment_type: Optional[str] = None,
    search: Optional[str] = None,
    user_id: int = Depends(require_permission("hr.view")),
    db=Depends(get_db),
    campus_id: Optional[int] = Depends(get_current_campus_id),
):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff(%s,%s,%s,%s,%s)",
        (department_id, status, employment_type, search, campus_id))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.get("/staff/{staff_id}")
def get_staff(staff_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT * FROM sp_get_staff_detail(%s)", (staff_id,))
    row = cur.fetchone()
    if not row: fail("Staff not found", 404)
    result = fmt(row)
    cur.execute("SELECT * FROM sp_get_emergency_contacts(%s)", (staff_id,))
    result["emergency_contacts"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_staff_documents(%s)", (staff_id,))
    result["documents"] = [fmt(r) for r in cur.fetchall()]
    return ok(data=result)

@router.post("/staff")
def create_staff(body: StaffIn, user_id: int = Depends(require_permission("hr.create")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if campus_id is None:
        fail("No campus context - please select a campus before adding a staff record.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_staff(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (body.first_name, body.last_name, body.gender, body.date_of_birth or None,
         body.cnic, body.phone, body.address, body.designation_id, body.department_id,
         body.employment_type, body.joining_date or None, body.contract_end_date or None,
         body.salary, body.employee_code, body.user_id, user_id, campus_id))
    result = cur.fetchone()
    if result["error_msg"]: fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Staff record created.")

@router.put("/staff/{staff_id}")
def update_staff(staff_id: int, body: StaffIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT * FROM sp_update_staff(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (staff_id, body.first_name, body.last_name, body.gender, body.date_of_birth or None,
         body.cnic, body.phone, body.address, body.designation_id, body.department_id,
         body.employment_type, body.joining_date or None, body.contract_end_date or None,
         body.salary, body.employee_code, body.user_id))
    result = cur.fetchone()
    if result["error_msg"]: fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Staff record updated.")

@router.patch("/staff/{staff_id}/status")
def update_staff_status(staff_id: int, status: str, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT * FROM sp_update_staff_status(%s,%s)", (staff_id, status))
    result = cur.fetchone()
    if result["error_msg"]: fail(result["error_msg"], 400)
    db.commit()
    return ok(message=f"Status updated to {status}.")

@router.delete("/staff/{staff_id}")
def delete_staff(staff_id: int, user_id: int = Depends(require_permission("hr.delete")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("DELETE FROM staff WHERE id=%s", (staff_id,))
    db.commit()
    return ok(message="Staff record deleted.")

# ─── EMERGENCY CONTACTS ──────────────────────────────────────────
@router.post("/staff/{staff_id}/emergency-contacts")
def add_emergency_contact(staff_id: int, body: EmergencyContactIn,
    user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_add_emergency_contact(%s,%s,%s,%s,%s) AS id",
        (staff_id, body.name, body.relationship, body.phone, body.address))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Emergency contact added.")

@router.delete("/staff/{staff_id}/emergency-contacts/{contact_id}")
def delete_emergency_contact(staff_id: int, contact_id: int,
    user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("DELETE FROM staff_emergency_contacts WHERE id=%s AND staff_id=%s", (contact_id, staff_id))
    db.commit()
    return ok(message="Contact removed.")

# ─── DOCUMENTS ───────────────────────────────────────────────────
@router.post("/staff/{staff_id}/documents")
def upload_document(staff_id: int,
    doc_type: str = Form(...), doc_name: str = Form(...),
    file: UploadFile = File(...),
    user_id: int = Depends(require_permission("hr.documents")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _check_staff_campus(get_cur(db), staff_id, campus_id)
    upload_dir = f"uploads/hr/staff/{staff_id}"
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = f"{upload_dir}/{filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    cur = get_cur(db)
    cur.execute("""INSERT INTO staff_documents(staff_id,doc_type,doc_name,file_path,uploaded_by,uploaded_at)
        VALUES(%s,%s,%s,%s,%s,%s) RETURNING id""",
        (staff_id, doc_type, doc_name, file_path, user_id, get_processing_datetime(db)))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Document uploaded.")

@router.delete("/staff/{staff_id}/documents/{doc_id}")
def delete_document(staff_id: int, doc_id: int,
    user_id: int = Depends(require_permission("hr.documents")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT file_path FROM staff_documents WHERE id=%s AND staff_id=%s", (doc_id, staff_id))
    row = cur.fetchone()
    if row and row["file_path"] and os.path.exists(row["file_path"]):
        os.remove(row["file_path"])
    cur.execute("DELETE FROM staff_documents WHERE id=%s AND staff_id=%s", (doc_id, staff_id))
    db.commit()
    return ok(message="Document deleted.")

# ??? GENERATE EMPLOYEE CODE ??????????????????????????????????????
@router.get("/generate-employee-code")
def generate_employee_code(role_id: int, user_id: int = Depends(require_permission("hr.create")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT sp_generate_employee_code(%s, %s) AS code", (role_id, campus_id))
    row = cur.fetchone()
    # Don't commit ? counter increments only on actual staff creation
    db.rollback()
    return ok(data={"code": row["code"]})

# ??? DEPARTMENT ROLES (for cascading dropdowns) ??????????????????
@router.get("/departments/{dept_id}/roles")
def get_roles_by_dept(dept_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (dept_id,))
    _row = cur.fetchone()
    if _row: enforce_same_campus(_row["campus_id"], campus_id)
    cur.execute("SELECT * FROM sp_get_roles_by_department(%s)", (dept_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.get("/departments/{dept_id}/designations")
def get_designations_by_dept(dept_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (dept_id,))
    _row = cur.fetchone()
    if _row: enforce_same_campus(_row["campus_id"], campus_id)
    cur.execute("SELECT * FROM sp_get_designations_by_department(%s)", (dept_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

# ??? ALL STAFF (unified view) ?????????????????????????????????????
@router.get("/all-staff")
def get_all_staff(
    department_id: Optional[int] = None,
    role_id: Optional[int] = None,
    search: Optional[str] = None,
    user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db),
    campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_staff(%s,%s,%s,%s)", (department_id, role_id, search, campus_id))
    return ok(data=[fmt(r) for r in cur.fetchall()])

class CreateStaffIn(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: Optional[str] = "Staff@1234"
    role_id: int
    department_id: Optional[int] = None
    designation_id: Optional[int] = None
    employment_type: Optional[str] = "full_time"
    joining_date: Optional[str] = None
    salary: Optional[float] = None
    employee_code: Optional[str] = None
    phone: Optional[str] = None
    is_probationary: Optional[bool] = True
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None

@router.post("/all-staff")
def create_staff_full(body: CreateStaffIn, user_id: int = Depends(require_permission("hr.create")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if campus_id is None:
        fail("No campus context - please select a campus before creating a staff record.", 400)
    import bcrypt
    pwd_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(12)).decode()
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_staff_with_user(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (body.first_name, body.last_name, body.email, body.role_id,
         body.department_id, body.designation_id, body.employment_type,
         body.joining_date or None, body.salary, body.employee_code,
         body.phone, pwd_hash, user_id, body.is_probationary,
         body.gender, body.date_of_birth or None, campus_id))
    result = cur.fetchone()
    if result["error_msg"]: fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"user_id": result["user_id"], "staff_id": result["staff_id"], "employee_code": result["employee_code"]},
              message=f"Staff created. Employee code: {result['employee_code']}")

# ??? HR SETUP (department_roles management) ???????????????????????
@router.get("/setup/department-roles")
def get_dept_roles(user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("""SELECT dr.id, d.id AS department_id, d.name AS department_name,
        r.id AS role_id, r.name AS role_name
        FROM department_roles dr JOIN departments d ON d.id=dr.department_id
        JOIN roles r ON r.id=dr.role_id
        WHERE (%s IS NULL OR d.campus_id IS NULL OR d.campus_id = %s)
        ORDER BY d.name, r.name""", (campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/setup/department-roles")
def add_dept_role(department_id: int, role_id: int,
    user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (department_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("INSERT INTO department_roles(department_id,role_id) VALUES(%s,%s) ON CONFLICT DO NOTHING",
        (department_id, role_id))
    db.commit()
    return ok(message="Role mapped to department.")

@router.delete("/setup/department-roles/{dr_id}")
def remove_dept_role(dr_id: int,
    user_id: int = Depends(require_permission("hr.designations")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT d.campus_id FROM department_roles dr JOIN departments d ON d.id=dr.department_id WHERE dr.id=%s", (dr_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("DELETE FROM department_roles WHERE id=%s", (dr_id,))
    db.commit()
    return ok(message="Mapping removed.")

@router.get("/setup/all-roles")
def get_all_roles(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id, name FROM roles WHERE name NOT IN ('student','parent') ORDER BY name")
    return ok(data=[dict(r) for r in cur.fetchall()])

# ??? STAFF PROFILE (education, experience, employment history) ????

class PersonalIn(BaseModel):
    first_name: str
    last_name: str
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    cnic: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class EducationIn(BaseModel):
    degree: str
    institution: str
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    grade: Optional[str] = None
    is_current: Optional[bool] = False
    grade_type: Optional[str] = "marks"
    total_marks: Optional[float] = None
    awarded_marks: Optional[float] = None
    total_cgpa: Optional[float] = None
    awarded_cgpa: Optional[float] = None

class ExperienceIn(BaseModel):
    company: str
    designation: str
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    is_current: Optional[bool] = False
    description: Optional[str] = None

class EmploymentHistoryIn(BaseModel):
    organization: str
    role: str
    from_date: Optional[str] = None
    to_date: Optional[str] = None
    reason_leaving: Optional[str] = None
    reference_name: Optional[str] = None
    reference_phone: Optional[str] = None

def get_or_create_staff(db, user_id):
    cur = get_cur(db)
    cur.execute("SELECT sp_get_staff_by_user(%s) AS staff_id", (user_id,))
    return cur.fetchone()["staff_id"]

# Get or create staff from user_id and return full profile
@router.get("/profile/by-user/{p_user_id}")
def get_profile_by_user(p_user_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM users WHERE id=%s", (p_user_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("SELECT sp_get_staff_by_user(%s) AS staff_id", (p_user_id,))
    staff_id = cur.fetchone()["staff_id"]
    db.commit()
    cur2 = get_cur(db)
    cur2.execute("SELECT * FROM sp_get_staff_profile(%s)", (staff_id,))
    row = cur2.fetchone()
    result = fmt(row) if row else {"id": staff_id, "user_id": p_user_id}
    cur2.execute("SELECT * FROM sp_get_education(%s)", (staff_id,))
    result["education"] = [dict(r) for r in cur2.fetchall()]
    cur2.execute("SELECT * FROM sp_get_experience(%s)", (staff_id,))
    result["experience"] = [fmt(r) for r in cur2.fetchall()]
    cur2.execute("SELECT * FROM sp_get_employment_history(%s)", (staff_id,))
    result["employment_history"] = [fmt(r) for r in cur2.fetchall()]
    cur2.execute("SELECT * FROM sp_get_staff_documents(%s)", (staff_id,))
    result["documents"] = [fmt(r) for r in cur2.fetchall()]
    cur2.execute("SELECT * FROM sp_get_emergency_contacts(%s)", (staff_id,))
    result["emergency_contacts"] = [dict(r) for r in cur2.fetchall()]
    return ok(data=result)

# HR uploads photo for any staff
@router.post("/staff/{staff_id}/photo")
def upload_staff_photo(staff_id: int, file: UploadFile = File(...),
    user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    _check_staff_campus(get_cur(db), staff_id, campus_id)
    allowed = {".jpg",".jpeg",".png",".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed: fail("Only JPG, PNG, WEBP allowed.", 400)
    upload_dir = "uploads/hr/photos"
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"staff_{staff_id}{ext}"
    file_path = f"{upload_dir}/{filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    cur = get_cur(db)
    cur.execute("UPDATE staff SET profile_photo=%s WHERE id=%s", (file_path, staff_id))
    db.commit()
    return ok(data={"photo_url": f"/uploads/hr/photos/{filename}"}, message="Photo updated.")

# HR manages any staff education
@router.post("/staff/{staff_id}/education")
def add_staff_education(staff_id: int, body: EducationIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_add_education(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (staff_id, body.degree, body.institution, body.field_of_study,
         body.start_year, body.end_year, body.grade, body.is_current,
         body.grade_type, body.total_marks, body.awarded_marks, body.total_cgpa, body.awarded_cgpa))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Education added.")

@router.put("/staff/{staff_id}/education/{edu_id}")
def update_staff_education(staff_id: int, edu_id: int, body: EducationIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_update_education(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (edu_id, staff_id, body.degree, body.institution, body.field_of_study,
         body.start_year, body.end_year, body.grade, body.is_current,
         body.grade_type, body.total_marks, body.awarded_marks, body.total_cgpa, body.awarded_cgpa))
    db.commit()
    return ok(message="Education updated.")

@router.delete("/staff/{staff_id}/education/{edu_id}")
def delete_staff_education(staff_id: int, edu_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_delete_education(%s,%s)", (edu_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# HR manages any staff experience
@router.post("/staff/{staff_id}/experience")
def add_staff_experience(staff_id: int, body: ExperienceIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_add_experience(%s,%s,%s,%s,%s,%s,%s) AS id",
        (staff_id, body.company, body.designation,
         body.from_date or None, body.to_date or None, body.is_current, body.description))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Experience added.")

@router.put("/staff/{staff_id}/experience/{exp_id}")
def update_staff_experience(staff_id: int, exp_id: int, body: ExperienceIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_update_experience(%s,%s,%s,%s,%s,%s,%s,%s)",
        (exp_id, staff_id, body.company, body.designation,
         body.from_date or None, body.to_date or None, body.is_current, body.description))
    db.commit()
    return ok(message="Experience updated.")

@router.delete("/staff/{staff_id}/experience/{exp_id}")
def delete_staff_experience(staff_id: int, exp_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT sp_delete_experience(%s,%s)", (exp_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# Full profile
@router.get("/profile/{staff_id}")
def get_profile(staff_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT * FROM sp_get_staff_profile(%s)", (staff_id,))
    row = cur.fetchone()
    if not row: fail("Staff not found", 404)
    result = fmt(row)
    cur.execute("SELECT * FROM sp_get_education(%s)", (staff_id,))
    result["education"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_experience(%s)", (staff_id,))
    result["experience"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_employment_history(%s)", (staff_id,))
    result["employment_history"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_staff_documents(%s)", (staff_id,))
    result["documents"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_emergency_contacts(%s)", (staff_id,))
    result["emergency_contacts"] = [dict(r) for r in cur.fetchall()]
    return ok(data=result)

# My profile (teacher self-view)
@router.get("/my-profile")
def get_my_profile(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    db.commit()
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_profile(%s)", (staff_id,))
    row = cur.fetchone()
    result = fmt(row) if row else {"id": staff_id}
    cur.execute("SELECT * FROM sp_get_education(%s)", (staff_id,))
    result["education"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_experience(%s)", (staff_id,))
    result["experience"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_employment_history(%s)", (staff_id,))
    result["employment_history"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_staff_documents(%s)", (staff_id,))
    result["documents"] = [fmt(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM sp_get_emergency_contacts(%s)", (staff_id,))
    result["emergency_contacts"] = [dict(r) for r in cur.fetchall()]
    return ok(data=result)

# Update personal info (own)
@router.put("/my-profile/personal")
def update_my_personal(body: PersonalIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_staff_personal(%s,%s,%s,%s,%s,%s,%s,%s)",
        (staff_id, body.first_name, body.last_name, body.gender,
         body.date_of_birth or None, body.cnic, body.phone, body.address))
    db.commit()
    return ok(message="Personal info updated.")

# Education endpoints
@router.get("/my-profile/education")
def get_my_education(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_education(%s)", (staff_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/my-profile/education")
def add_my_education(body: EducationIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_add_education(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (staff_id, body.degree, body.institution, body.field_of_study,
         body.start_year, body.end_year, body.grade, body.is_current,
         body.grade_type, body.total_marks, body.awarded_marks, body.total_cgpa, body.awarded_cgpa))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Education added.")

@router.put("/my-profile/education/{edu_id}")
def update_my_education(edu_id: int, body: EducationIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_education(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (edu_id, staff_id, body.degree, body.institution, body.field_of_study,
         body.start_year, body.end_year, body.grade, body.is_current,
         body.grade_type, body.total_marks, body.awarded_marks, body.total_cgpa, body.awarded_cgpa))
    db.commit()
    return ok(message="Education updated.")

@router.delete("/my-profile/education/{edu_id}")
def delete_my_education(edu_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_education(%s,%s)", (edu_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# Experience endpoints
@router.get("/my-profile/experience")
def get_my_experience(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_experience(%s)", (staff_id,))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.post("/my-profile/experience")
def add_my_experience(body: ExperienceIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_add_experience(%s,%s,%s,%s,%s,%s,%s) AS id",
        (staff_id, body.company, body.designation,
         body.from_date or None, body.to_date or None,
         body.is_current, body.description))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Experience added.")

@router.put("/my-profile/experience/{exp_id}")
def update_my_experience(exp_id: int, body: ExperienceIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_update_experience(%s,%s,%s,%s,%s,%s,%s,%s)",
        (exp_id, staff_id, body.company, body.designation,
         body.from_date or None, body.to_date or None,
         body.is_current, body.description))
    db.commit()
    return ok(message="Experience updated.")

@router.delete("/my-profile/experience/{exp_id}")
def delete_my_experience(exp_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_experience(%s,%s)", (exp_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# Employment history endpoints
@router.get("/my-profile/employment-history")
def get_my_employment_history(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_employment_history(%s)", (staff_id,))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.post("/my-profile/employment-history")
def add_my_employment_history(body: EmploymentHistoryIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_add_employment_history(%s,%s,%s,%s,%s,%s,%s,%s) AS id",
        (staff_id, body.organization, body.role,
         body.from_date or None, body.to_date or None,
         body.reason_leaving, body.reference_name, body.reference_phone))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Employment history added.")

@router.delete("/my-profile/employment-history/{hist_id}")
def delete_my_employment_history(hist_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_delete_employment_history(%s,%s)", (hist_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# Profile photo upload (self)
@router.post("/my-profile/photo")
def upload_my_photo(file: UploadFile = File(...), user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    allowed = {".jpg",".jpeg",".png",".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed: fail("Only JPG, PNG, WEBP allowed.", 400)
    staff_id = get_or_create_staff(db, user_id)
    upload_dir = f"uploads/hr/photos"
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"staff_{staff_id}{ext}"
    file_path = f"{upload_dir}/{filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    cur = get_cur(db)
    cur.execute("UPDATE staff SET profile_photo=%s WHERE id=%s", (file_path, staff_id))
    db.commit()
    return ok(data={"photo_url": f"/uploads/hr/photos/{filename}"}, message="Photo uploaded.")

@router.get("/my-profile/photo")
def get_my_photo(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT profile_photo FROM staff WHERE user_id=%s", (user_id,))
    row = cur.fetchone()
    if not row or not row["profile_photo"]: return ok(data={"photo_url": None})
    fname = os.path.basename(row["profile_photo"])
    return ok(data={"photo_url": f"/uploads/hr/photos/{fname}"})

# Emergency contacts (self)
@router.post("/my-profile/emergency-contacts")
def add_my_emergency_contact(body: EmergencyContactIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT sp_add_emergency_contact(%s,%s,%s,%s,%s) AS id",
        (staff_id, body.name, body.relationship, body.phone, body.address))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Emergency contact added.")

@router.delete("/my-profile/emergency-contacts/{contact_id}")
def delete_my_emergency_contact(contact_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("DELETE FROM staff_emergency_contacts WHERE id=%s AND staff_id=%s", (contact_id, staff_id))
    db.commit()
    return ok(message="Contact removed.")

# Document upload (self)
@router.post("/my-profile/documents")
def upload_my_document(
    doc_type: str = Form(...), doc_name: str = Form(...),
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    upload_dir = f"uploads/hr/staff/{staff_id}"
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = f"{upload_dir}/{filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    cur = get_cur(db)
    cur.execute("INSERT INTO staff_documents(staff_id,doc_type,doc_name,file_path,uploaded_by,uploaded_at) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
        (staff_id, doc_type, doc_name, file_path, user_id, get_processing_datetime(db)))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Document uploaded.")

@router.delete("/my-profile/documents/{doc_id}")
def delete_my_document(doc_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    staff_id = get_or_create_staff(db, user_id)
    cur = get_cur(db)
    cur.execute("SELECT file_path FROM staff_documents WHERE id=%s AND staff_id=%s", (doc_id, staff_id))
    row = cur.fetchone()
    if row and row["file_path"] and os.path.exists(row["file_path"]):
        os.remove(row["file_path"])
    cur.execute("DELETE FROM staff_documents WHERE id=%s AND staff_id=%s", (doc_id, staff_id))
    db.commit()
    return ok(message="Deleted.")

# ??? STAFF LEAVE SETUP ???????????????????????????????????????????

class LeavePolicyIn(BaseModel):
    leave_type_id: int
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    days_per_year: int
    carry_forward: Optional[int] = 0
    is_paid: Optional[bool] = True
    applies_to: Optional[str] = "role"
    gender: Optional[str] = "all"

class LeaveTypeIn(BaseModel):
    name: str
    max_days_per_year: Optional[int] = None
    certificate_required: Optional[bool] = False
    is_active: Optional[bool] = True
    is_encashable: Optional[bool] = False

class LeaveReviewIn(BaseModel):
    status: str
    review_note: Optional[str] = None

@router.get("/leave/types")
def get_staff_leave_types(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("staff_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_leave_types(%s)", (campus_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/leave/types")
def create_leave_type(body: LeaveTypeIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("staff_leave_types"))):
    cur = get_cur(db)
    cur.execute("INSERT INTO leave_types(name, max_days_per_year, certificate_required, is_active, is_encashable, created_at, campus_id) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (body.name, body.max_days_per_year, body.certificate_required, body.is_active, body.is_encashable, get_processing_datetime(db), campus_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Leave type created.")

@router.put("/leave/types/{lt_id}")
def update_leave_type(lt_id: int, body: LeaveTypeIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("staff_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM leave_types WHERE id=%s", (lt_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE leave_types SET name=%s, max_days_per_year=%s, certificate_required=%s, is_active=%s, is_encashable=%s WHERE id=%s",
        (body.name, body.max_days_per_year, body.certificate_required, body.is_active, body.is_encashable, lt_id))
    db.commit()
    return ok(message="Leave type updated.")

@router.delete("/leave/types/{lt_id}")
def delete_leave_type(lt_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("staff_leave_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM leave_types WHERE id=%s", (lt_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE leave_types SET is_active=false WHERE id=%s", (lt_id,))
    db.commit()
    return ok(message="Leave type deactivated.")

@router.get("/leave/policies")
def get_leave_policies(leave_type_id: Optional[int] = None, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("staff_leave_policies"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_leave_policies(%s, %s)", (leave_type_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/leave/policies")
def create_leave_policy(body: LeavePolicyIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("staff_leave_policies"))):
    cur = get_cur(db)
    cur.execute("""INSERT INTO staff_leave_policies(leave_type_id, role_id, department_id,
        days_per_year, carry_forward, is_paid, applies_to, gender, effective_from, created_at, campus_id)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(leave_type_id, role_id, campus_id) DO UPDATE
        SET days_per_year=%s, carry_forward=%s, is_paid=%s, gender=%s RETURNING id""",
        (body.leave_type_id, body.role_id, body.department_id,
         body.days_per_year, body.carry_forward, body.is_paid, body.applies_to, body.gender or "all",
         get_processing_date(db), get_processing_datetime(db), campus_id,
         body.days_per_year, body.carry_forward, body.is_paid, body.gender or "all"))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Leave policy saved.")

@router.delete("/leave/policies/{policy_id}")
def delete_leave_policy(policy_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("staff_leave_policies"))):
    cur = get_cur(db)
    _check_leave_policy_campus(cur, policy_id, campus_id)
    cur.execute("DELETE FROM staff_leave_policies WHERE id=%s", (policy_id,))
    db.commit()
    return ok(message="Policy removed.")

@router.get("/leave/balances")
def get_leave_balances(year: Optional[int] = None, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_leave_balances(%s, %s)", (year, campus_id))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.post("/leave/balances/init")
def init_leave_balances(year: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_init_staff_leave_balances(%s)", (year,))
    result = cur.fetchone()
    db.commit()
    return ok(data=dict(result), message=f"Initialized {result['initialized']} leave balances for {year}.")

@router.patch("/leave/balances/{balance_id}")
def adjust_leave_balance(balance_id: int, total_days: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_leave_balance_campus(cur, balance_id, campus_id)
    cur.execute("UPDATE staff_leave_balances SET total_days=%s, updated_at=%s WHERE id=%s", (total_days, get_processing_datetime(db), balance_id))
    db.commit()
    return ok(message="Balance adjusted.")

@router.get("/leave/requests")
def get_leave_requests(status: Optional[str] = None, year: Optional[int] = None,
    user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_leave_requests(%s,%s,%s)", (status, year, campus_id))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.patch("/leave/requests/{req_id}/review")
def review_leave_request(req_id: int, body: LeaveReviewIn,
    user_id: int = Depends(require_permission("hr.approve")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    if body.status not in ("approved","rejected"):
        fail("Status must be approved or rejected", 400)
    cur = get_cur(db)
    _check_leave_request_campus(cur, req_id, campus_id)
    cur.execute("""UPDATE staff_leave_requests SET status=%s, reviewed_by=%s,
        reviewed_at=%s, review_note=%s WHERE id=%s""",
        (body.status, user_id, get_processing_datetime(db), body.review_note, req_id))
    # Update balance if approved
    if body.status == "approved":
        cur.execute("""UPDATE staff_leave_balances slb SET used_days=used_days+slr.total_days
            FROM staff_leave_requests slr
            WHERE slr.id=%s AND slb.user_id=slr.user_id AND slb.leave_type_id=slr.leave_type_id
            AND slb.year=EXTRACT(YEAR FROM slr.from_date)::INT""", (req_id,))
    db.commit()
    # Advance workflow engine so WQ item is updated
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        wf_action = "approve" if body.status == "approved" else "reject"
        wf.advance(db, "hr", "staff_leave", req_id, action=wf_action,
            actioned_by=user_id, note=body.review_note or body.status)
        db.commit()
    except Exception as we:
        print(f"[staff_leave wf advance] {we}")
    return ok(message=f"Leave request {body.status}.")

# ??? LEAVE CERTIFICATE TYPES ?????????????????????????????????????
class CertificateTypeIn(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True

@router.get("/leave/certificate-types")
def list_certificate_types(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("leave_certificate_types"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM leave_certificate_types WHERE is_active=true AND (%s IS NULL OR campus_id IS NULL OR campus_id = %s) ORDER BY name", (campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/leave/certificate-types")
def create_certificate_type(body: CertificateTypeIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("leave_certificate_types"))):
    cur = get_cur(db)
    cur.execute("""INSERT INTO leave_certificate_types(name, description, is_active, campus_id)
        VALUES(%s,%s,%s,%s)
        ON CONFLICT(name, campus_id) DO UPDATE SET is_active=true, description=EXCLUDED.description
        RETURNING id""",
        (body.name, body.description, body.is_active, campus_id))
    row = cur.fetchone()
    db.commit()
    return ok(data={"id": row["id"]}, message="Certificate type saved.")

@router.delete("/leave/certificate-types/{ct_id}")
def delete_certificate_type(ct_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("leave_certificate_types"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM leave_certificate_types WHERE id=%s", (ct_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE leave_certificate_types SET is_active=false WHERE id=%s", (ct_id,))
    db.commit()
    return ok(message="Certificate type removed.")

# ??? LEAVE RULES (generic, extensible validation engine) ?????????
RULE_TYPES = ("certificate_required", "cannot_combine_with", "leave_balance", "leave_overlap", "advance_notice", "max_consecutive_days", "blackout_dates", "employment_status_restriction")

class HRPolicySettingsIn(BaseModel):
    probation_duration_days: int
    notice_period_duration_days: int
    resignation_withdrawal_allowed: bool = True
    resignation_withdrawal_max_step: int = 3

@router.get("/policy-settings")
def get_policy_settings(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id("hr_policy_settings"))):
    cur = get_cur(db)
    cur.execute("SELECT * FROM hr_policy_settings WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
    return ok(data=dict(cur.fetchone()))

@router.put("/policy-settings")
def update_policy_settings(body: HRPolicySettingsIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(governed_settings_campus_id_for_write("hr_policy_settings"))):
    cur = get_cur(db)
    cur.execute("""INSERT INTO hr_policy_settings (probation_duration_days, notice_period_duration_days,
        resignation_withdrawal_allowed, resignation_withdrawal_max_step, campus_id)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (COALESCE(campus_id, 0)) DO UPDATE SET
        probation_duration_days=%s, notice_period_duration_days=%s,
        resignation_withdrawal_allowed=%s, resignation_withdrawal_max_step=%s""",
        (body.probation_duration_days, body.notice_period_duration_days,
         body.resignation_withdrawal_allowed, body.resignation_withdrawal_max_step, campus_id,
         body.probation_duration_days, body.notice_period_duration_days,
         body.resignation_withdrawal_allowed, body.resignation_withdrawal_max_step))
    db.commit()
    return ok(message="Policy settings updated.")

class ValidationRuleIn(BaseModel):
    name: str
    leave_type_id: Optional[int] = None
    rule_type: str
    config: dict = {}
    is_active: Optional[bool] = True

@router.get("/leave/validation-rules")
def list_validation_rules(user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id("leave_validation_rules"))):
    cur = get_cur(db)
    cur.execute("""SELECT vr.*, lt.name AS leave_type_name
        FROM leave_validation_rules vr
        LEFT JOIN leave_types lt ON lt.id=vr.leave_type_id
        WHERE (%s IS NULL OR vr.campus_id IS NULL OR vr.campus_id = %s)
        ORDER BY vr.id DESC""", (campus_id, campus_id))
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.post("/leave/validation-rules")
def create_validation_rule(body: ValidationRuleIn, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("leave_validation_rules"))):
    if body.rule_type not in RULE_TYPES:
        allowed = ", ".join(RULE_TYPES)
        fail(f"Unknown rule type. Must be one of: {allowed}", 400)
    import json as _json
    cur = get_cur(db)
    cur.execute("""INSERT INTO leave_validation_rules(name, leave_type_id, rule_type, config, is_active, created_at, campus_id)
        VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (body.name, body.leave_type_id, body.rule_type, _json.dumps(body.config), body.is_active, get_processing_datetime(db), campus_id))
    new_id = cur.fetchone()["id"]
    db.commit()
    return ok(data={"id": new_id}, message="Rule created.")

@router.delete("/leave/validation-rules/{rule_id}")
def delete_validation_rule(rule_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(catalog_campus_id_for_write("leave_validation_rules"))):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM leave_validation_rules WHERE id=%s", (rule_id,))
    _row = cur.fetchone()
    enforce_same_campus(_row["campus_id"] if _row else None, campus_id)
    cur.execute("UPDATE leave_validation_rules SET is_active=false WHERE id=%s", (rule_id,))
    db.commit()
    return ok(message="Rule removed.")

def validate_leave_rules(db, user_id, leave_type_id, from_date, to_date, total_days, certificate_type_id=None, remaining_balance=None, from_date_obj=None):
    """Runs every active rule that applies to this leave type (or to all leave types).
    Raises via fail() on the first violated rule - extend this with more elif branches
    as new rule_types are added, no schema change needed."""
    import json as _json
    cur = get_cur(db)
    cur.execute("""SELECT * FROM leave_validation_rules
        WHERE is_active=true AND (leave_type_id=%s OR leave_type_id IS NULL)""", (leave_type_id,))
    for r in cur.fetchall():
        row = dict(r)
        cfg = row["config"]
        if isinstance(cfg, str):
            cfg = _json.loads(cfg or "{}")
        rule_type = row["rule_type"]
        rule_name = row["name"]

        if rule_type == "certificate_required":
            min_days = cfg.get("min_days", 1)
            if total_days >= min_days and not certificate_type_id:
                cert_name = cfg.get("certificate_type_name", "A certificate")
                rule_name = row["name"]
                fail(f"{cert_name} is required for {rule_name} (leave of {min_days}+ day(s)).", 400)

        elif rule_type == "cannot_combine_with":
            excluded_ids = cfg.get("excluded_leave_type_ids") or []
            if excluded_ids:
                cur2 = get_cur(db)
                cur2.execute("""SELECT id FROM staff_leave_requests
                    WHERE user_id=%s AND leave_type_id = ANY(%s)
                    AND status NOT IN (\'rejected\',\'cancelled\')
                    AND NOT (to_date < %s OR from_date > %s)""",
                    (user_id, excluded_ids, from_date, to_date))
                if cur2.fetchone():
                    rule_name = row["name"]
                    fail(cfg.get("message") or f"{rule_name}: cannot be combined with an overlapping leave of the excluded type(s).", 400)

        elif rule_type == "leave_balance":
            if remaining_balance is not None and remaining_balance < total_days:
                fail(cfg.get("message") or f"Insufficient leave balance. Available: {int(remaining_balance)} day(s).", 400)

        elif rule_type == "leave_overlap":
            cur3 = get_cur(db)
            cur3.execute("""SELECT id FROM staff_leave_requests WHERE user_id=%s
                AND status NOT IN (\'rejected\',\'cancelled\')
                AND NOT (to_date < %s OR from_date > %s)""",
                (user_id, from_date, to_date))
            if cur3.fetchone():
                fail(cfg.get("message") or "You already have a leave request for overlapping dates.", 400)

        elif rule_type == "advance_notice":
            from app.utils.processing_date import get_processing_date as _get_proc_date
            min_notice = cfg.get("min_days_notice", 0)
            if from_date_obj is not None:
                notice_days = (from_date_obj - _get_proc_date(db)).days
                if notice_days < min_notice:
                    fail(cfg.get("message") or f"{rule_name}: leave must be requested at least {min_notice} day(s) in advance.", 400)

        elif rule_type == "max_consecutive_days":
            max_days = cfg.get("max_days")
            if max_days and total_days > max_days:
                fail(cfg.get("message") or f"{rule_name}: cannot exceed {max_days} consecutive day(s).", 400)

        elif rule_type == "blackout_dates":
            ranges = cfg.get("date_ranges") or []
            for rng in ranges:
                try:
                    bstart, bend = rng[0], rng[1]
                except Exception:
                    continue
                if not (to_date < bstart or from_date > bend):
                    fail(cfg.get("message") or f"{rule_name}: leave dates fall within a blackout period ({bstart} to {bend}).", 400)

        elif rule_type == "employment_status_restriction":
            from datetime import date as _date2, timedelta as _timedelta
            restrict_status = cfg.get("status")
            max_allowed = cfg.get("max_days_allowed", 0)
            cur4 = get_cur(db)
            cur4.execute("""SELECT s.joining_date, s.resignation_accepted_date, s.is_probationary,
                (SELECT probation_duration_days FROM hr_policy_settings hps WHERE hps.campus_id = s.campus_id OR hps.campus_id IS NULL ORDER BY hps.campus_id NULLS LAST LIMIT 1) AS probation_duration_days,
                (SELECT notice_period_duration_days FROM hr_policy_settings hps WHERE hps.campus_id = s.campus_id OR hps.campus_id IS NULL ORDER BY hps.campus_id NULLS LAST LIMIT 1) AS notice_period_duration_days
                FROM staff s
                WHERE s.user_id=%s""", (user_id,))
            srow = cur4.fetchone()
            if srow:
                window_start, window_end, period_label = None, None, None
                if restrict_status == "probation" and srow["joining_date"] and srow["is_probationary"]:
                    window_start = srow["joining_date"]
                    window_end = window_start + _timedelta(days=srow["probation_duration_days"] or 90)
                    period_label = "probation"
                elif restrict_status == "notice_period" and srow["resignation_accepted_date"]:
                    window_start = srow["resignation_accepted_date"]
                    # Use the actual accepted last working day (which HR may have
                    # set to the employee's requested date, not necessarily
                    # accepted_date + the default notice duration) instead of
                    # recalculating it mathematically.
                    cur4b = get_cur(db)
                    cur4b.execute("""SELECT COALESCE(final_last_working_day, system_calculated_last_working_day) AS last_day
                        FROM resignation_requests WHERE staff_id=(SELECT id FROM staff WHERE user_id=%s)
                        AND status NOT IN ('submitted','manager_approved','rejected','withdrawn')
                        ORDER BY id DESC LIMIT 1""", (user_id,))
                    lwd_row = cur4b.fetchone()
                    window_end = lwd_row["last_day"] if (lwd_row and lwd_row["last_day"]) else (window_start + _timedelta(days=srow["notice_period_duration_days"] or 30))
                    period_label = "notice"

                if window_start and get_processing_date(db) <= window_end:
                    cur5 = get_cur(db)
                    cur5.execute("""SELECT COALESCE(SUM(total_days),0) AS used
                        FROM staff_leave_requests
                        WHERE user_id=%s AND leave_type_id=%s
                        AND status NOT IN ('rejected','cancelled')
                        AND from_date >= %s AND from_date <= %s""",
                        (user_id, leave_type_id, window_start, window_end))
                    used = cur5.fetchone()["used"] or 0
                    if used + total_days > max_allowed:
                        fail(cfg.get("message") or f"{rule_name}: only {max_allowed} day(s) of this leave type are allowed during the {period_label} period (already used/requested: {int(used)}).", 400)

# ??? STAFF SELF-SERVICE LEAVE ????????????????????????????????????

class LeaveApplyIn(BaseModel):
    leave_type_id: int
    from_date: str
    to_date: str
    reason: str
    certificate_type_id: Optional[int] = None
    duration_type: Optional[str] = "full"
    half_day_from_time: Optional[str] = None
    half_day_to_time: Optional[str] = None

@router.get("/my-leave/employment-status")
def get_my_employment_status(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    from datetime import date as _d, timedelta as _td
    import json as _json
    cur = get_cur(db)
    cur.execute("""SELECT s.joining_date, s.resignation_accepted_date, s.is_probationary,
        (SELECT probation_duration_days FROM hr_policy_settings hps WHERE hps.campus_id = s.campus_id OR hps.campus_id IS NULL ORDER BY hps.campus_id NULLS LAST LIMIT 1) AS probation_duration_days,
        (SELECT notice_period_duration_days FROM hr_policy_settings hps WHERE hps.campus_id = s.campus_id OR hps.campus_id IS NULL ORDER BY hps.campus_id NULLS LAST LIMIT 1) AS notice_period_duration_days
        FROM staff s
        WHERE s.user_id=%s""", (user_id,))
    srow = cur.fetchone()
    if not srow:
        return ok(data={"is_probation": False, "is_notice_period": False, "restrictions": []})

    today = get_processing_date(db)
    probation_end = (srow["joining_date"] + _td(days=srow["probation_duration_days"] or 90)) if (srow["joining_date"] and srow["is_probationary"]) else None
    notice_end = None
    if srow["resignation_accepted_date"]:
        cur_lwd = get_cur(db)
        cur_lwd.execute("""SELECT COALESCE(final_last_working_day, system_calculated_last_working_day) AS last_day
            FROM resignation_requests WHERE staff_id=(SELECT id FROM staff WHERE user_id=%s)
            AND status NOT IN ('submitted','manager_approved','rejected','withdrawn')
            ORDER BY id DESC LIMIT 1""", (user_id,))
        lwd_row = cur_lwd.fetchone()
        notice_end = lwd_row["last_day"] if (lwd_row and lwd_row["last_day"]) else (srow["resignation_accepted_date"] + _td(days=srow["notice_period_duration_days"] or 30))
    is_probation = bool(probation_end and today <= probation_end)
    is_notice = bool(notice_end and today <= notice_end)
    current_status = "notice_period" if is_notice else ("probation" if is_probation else None)

    restrictions = []
    if current_status:
        cur.execute("""SELECT vr.*, lt.name AS leave_type_name FROM leave_validation_rules vr
            LEFT JOIN leave_types lt ON lt.id=vr.leave_type_id
            WHERE vr.is_active=true AND vr.rule_type='employment_status_restriction'""")
        window_start = srow["resignation_accepted_date"] if current_status=="notice_period" else srow["joining_date"]
        window_end = notice_end if current_status=="notice_period" else probation_end
        for r in cur.fetchall():
            row = dict(r)
            cfg = row["config"]
            if isinstance(cfg, str): cfg = _json.loads(cfg or "{}")
            if cfg.get("status") != current_status: continue
            max_allowed = cfg.get("max_days_allowed", 0)
            used = 0
            if row["leave_type_id"]:
                cur2 = get_cur(db)
                cur2.execute("""SELECT COALESCE(SUM(total_days),0) AS used FROM staff_leave_requests
                    WHERE user_id=%s AND leave_type_id=%s AND status NOT IN ('rejected','cancelled')
                    AND from_date>=%s AND from_date<=%s""", (user_id, row["leave_type_id"], window_start, window_end))
                used = cur2.fetchone()["used"] or 0
            restrictions.append({
                "leave_type_id": row["leave_type_id"],
                "leave_type_name": row["leave_type_name"] or "All Leave Types",
                "max_days_allowed": max_allowed,
                "used_days": int(used),
                "remaining": max_allowed - int(used)
            })

    return ok(data={
        "is_probation": is_probation,
        "probation_end_date": probation_end.isoformat() if probation_end else None,
        "is_notice_period": is_notice,
        "notice_period_end_date": notice_end.isoformat() if notice_end else None,
        "restrictions": restrictions
    })

@router.get("/my-leave/types")
def get_my_leave_types(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_staff_leave_types()")
    return ok(data=[dict(r) for r in cur.fetchall()])

@router.get("/my-leave/balances")
def get_my_leave_balances(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    from app.utils.processing_date import get_processing_date
    year = get_processing_date(db).year
    cur = get_cur(db)
    # Get user role
    cur.execute("SELECT role_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name NOT IN ('student','parent') LIMIT 1", (user_id,))
    role_row = cur.fetchone()
    role_id = role_row["role_id"] if role_row else None
    # Get policies for this role + applied/pending days from requests
    cur.execute("""
        SELECT lt.id AS leave_type_id, lt.name AS leave_type_name,
            COALESCE(slb.total_days, slp.days_per_year, 0) AS total_days,
            COALESCE(slb.used_days, 0) AS used_days,
            COALESCE(slb.carried_days, 0) AS carried_days,
            COALESCE(slb.id, 0) AS id,
            COALESCE(slp.days_per_year, 0) AS entitled_days,
            COALESCE(slp.is_paid, true) AS is_paid,
            (SELECT COALESCE(SUM(total_days),0) FROM staff_leave_requests
             WHERE user_id=%s AND leave_type_id=lt.id AND status='pending'
             AND EXTRACT(YEAR FROM from_date)=%s) AS pending_days,
            (SELECT COALESCE(SUM(total_days),0) FROM staff_leave_requests
             WHERE user_id=%s AND leave_type_id=lt.id AND status='approved'
             AND EXTRACT(YEAR FROM from_date)=%s) AS approved_days
        FROM leave_types lt
        LEFT JOIN staff s ON s.user_id=%s
        LEFT JOIN staff_leave_policies slp ON slp.leave_type_id=lt.id AND slp.is_active=true
            AND (slp.role_id=%s OR slp.applies_to='all' OR (slp.department_id IS NULL AND slp.role_id IS NULL))
            AND (slp.gender='all' OR slp.gender=s.gender)
        LEFT JOIN staff_leave_balances slb ON slb.leave_type_id=lt.id AND slb.user_id=%s AND slb.year=%s
        WHERE lt.is_active=true AND (slp.id IS NOT NULL OR slb.id IS NOT NULL)
        ORDER BY lt.name
    """, (user_id, year, user_id, year, user_id, role_id, user_id, year))
    rows = cur.fetchall()
    result = []
    for r in rows:
        d = dict(r)
        total = d["total_days"]
        used  = d["used_days"]
        carried = d["carried_days"]
        pending = d.get("pending_days") or 0
        d["remaining_days"] = max(0, total + carried - used - pending)
        d["year"] = year
        result.append(d)
    return ok(data=result)

@router.get("/my-leave/requests")
def get_my_leave_requests(user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("""SELECT slr.id, slr.leave_type_id, lt.name AS leave_type_name,
        slr.from_date, slr.to_date, slr.total_days, slr.reason, slr.status,
        slr.applied_at, slr.review_note, slr.duration_type, slr.half_day_from_time, slr.half_day_to_time,
        (u.first_name||' '||u.last_name) AS reviewed_by_name
        FROM staff_leave_requests slr
        JOIN leave_types lt ON lt.id=slr.leave_type_id
        LEFT JOIN users u ON u.id=slr.reviewed_by
        WHERE slr.user_id=%s
        ORDER BY slr.applied_at DESC""", (user_id,))
    return ok(data=[fmt(r) for r in cur.fetchall()])

@router.post("/my-leave/apply")
def apply_leave(body: LeaveApplyIn, user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    from datetime import datetime
    try:
        d1 = datetime.strptime(body.from_date, "%Y-%m-%d").date()
        d2 = datetime.strptime(body.to_date, "%Y-%m-%d").date()
    except:
        fail("Invalid date format.", 400)
    if d2 < d1: fail("To date must be after from date.", 400)
    total_days = (d2 - d1).days + 1
    cur = get_cur(db)

    if body.duration_type == "half":
        if body.from_date != body.to_date:
            fail("Half Leave can only be applied for a single day.", 400)
        if not body.half_day_from_time or not body.half_day_to_time:
            fail("Half Leave requires both From Time and To Time.", 400)
        try:
            t1 = datetime.strptime(body.half_day_from_time, "%H:%M").time()
            t2 = datetime.strptime(body.half_day_to_time, "%H:%M").time()
        except ValueError:
            fail("Invalid time format.", 400)
        if t2 <= t1:
            fail("To Time must be after From Time.", 400)
        requested_hours = (datetime.combine(d1, t2) - datetime.combine(d1, t1)).total_seconds() / 3600.0

        cur.execute("SELECT department_id FROM staff WHERE user_id=%s", (user_id,))
        srow = cur.fetchone()
        dept_id = srow["department_id"] if srow else None
        cur.execute("SELECT * FROM attendance_schedule_settings WHERE campus_id = %s OR campus_id IS NULL ORDER BY campus_id NULLS LAST LIMIT 1", (campus_id,))
        sched = cur.fetchone()
        sched_start, sched_end = sched["default_start_time"], sched["default_end_time"]
        if sched["mode"] == "per_department" and dept_id:
            cur.execute("SELECT start_time, end_time FROM department_attendance_schedules WHERE department_id=%s", (dept_id,))
            drow = cur.fetchone()
            if drow:
                sched_start, sched_end = drow["start_time"], drow["end_time"]
        full_day_hours = (datetime.combine(d1, sched_end) - datetime.combine(d1, sched_start)).total_seconds() / 3600.0

        if requested_hours >= full_day_hours:
            fail(f"Your selected time range ({requested_hours:.1f}h) covers a full working day ({full_day_hours:.1f}h) - please select Full Leave instead.", 400)

        total_days = 0.5

    # Check balance (from initialized record OR from policy entitlement)
    cur.execute("""SELECT total_days+carried_days-used_days AS remaining
        FROM staff_leave_balances WHERE user_id=%s AND leave_type_id=%s AND year=%s""",
        (user_id, body.leave_type_id, d1.year))
    bal = cur.fetchone()
    if not bal:
        # Fallback: check policy entitlement minus already approved leaves
        cur.execute("""SELECT COALESCE(slp.days_per_year,0) -
            COALESCE((SELECT SUM(total_days) FROM staff_leave_requests
                WHERE user_id=%s AND leave_type_id=%s AND status='approved'
                AND EXTRACT(YEAR FROM from_date)::INT=%s),0) AS remaining
            FROM user_roles ur JOIN roles r ON r.id=ur.role_id
            LEFT JOIN staff_leave_policies slp ON slp.leave_type_id=%s
                AND (slp.role_id=ur.role_id OR slp.applies_to='all')
            WHERE ur.user_id=%s AND r.name NOT IN ('student','parent')
            ORDER BY slp.days_per_year DESC NULLS LAST LIMIT 1""",
            (user_id, body.leave_type_id, d1.year, body.leave_type_id, user_id))
        bal = cur.fetchone()
        if not bal or bal["remaining"] is None:
            fail("No leave policy configured for this leave type. Contact HR.", 400)
    validate_leave_rules(db, user_id, body.leave_type_id, body.from_date, body.to_date, total_days,
        body.certificate_type_id, bal["remaining"], d1)
    cur.execute("""INSERT INTO staff_leave_requests(user_id, leave_type_id, from_date, to_date, total_days, reason, duration_type, half_day_from_time, half_day_to_time, applied_at)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, body.leave_type_id, body.from_date, body.to_date, total_days, body.reason,
         body.duration_type,
         body.half_day_from_time if body.duration_type == "half" else None,
         body.half_day_to_time if body.duration_type == "half" else None,
         get_processing_datetime(db)))
    new_id = cur.fetchone()["id"]
    db.commit()
    # Trigger workflow engine
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        # Get submitter department
        dc = get_cur(db)
        dc.execute("SELECT department_id FROM staff WHERE user_id=%s LIMIT 1", (user_id,))
        dept_row = dc.fetchone()
        dept_id = dept_row["department_id"] if dept_row else None
        # Get submitter role and HOD status for workflow routing
        _rc = get_cur(db)
        _rc.execute("""SELECT r.name AS role_name,
            EXISTS(SELECT 1 FROM departments WHERE head_user_id=%s) AS is_hod
            FROM user_roles ur JOIN roles r ON r.id=ur.role_id
            WHERE ur.user_id=%s AND r.name NOT IN ('student','parent') LIMIT 1""",
            (user_id, user_id))
        _rr = _rc.fetchone()
        submitter_role = _rr["role_name"] if _rr else ""
        is_hod = bool(_rr["is_hod"]) if _rr else False
        wf.trigger(db, module="hr", entity_type="staff_leave",
            entity_id=new_id, initiated_by=user_id, submitter_id=user_id,
            context={"leave_type_id": body.leave_type_id, "total_days": total_days,
                     "department_id": dept_id, "user_id": user_id,
                     "submitter_role": submitter_role, "is_hod": is_hod})
        db.commit()
    except Exception as we:
        import traceback
        print(f"[staff_leave workflow] {we}")
        traceback.print_exc()
    return ok(data={"id": new_id}, message=f"Leave request submitted for {total_days} day(s).")

@router.delete("/my-leave/requests/{req_id}")
def cancel_leave_request(req_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT status FROM staff_leave_requests WHERE id=%s AND user_id=%s", (req_id, user_id))
    row = cur.fetchone()
    if not row: fail("Request not found.", 404)
    if row["status"] not in ("pending",): fail("Only pending requests can be cancelled.", 400)
    cur.execute("UPDATE staff_leave_requests SET status='cancelled' WHERE id=%s", (req_id,))
    db.commit()
    return ok(message="Leave request cancelled.")

# ??? CHECK HOD STATUS ???????????????????????????????????????????
@router.get("/staff/{staff_id}/is-head")
def check_is_head(staff_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT user_id FROM staff WHERE id=%s", (staff_id,))
    staff_row = cur.fetchone()
    if not staff_row: fail("Staff not found", 404)
    is_self = staff_row["user_id"] == user_id
    if not is_self:
        cur.execute("""SELECT 1 FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id=ur.role_id
            JOIN permissions p ON p.id=rp.permission_id
            WHERE ur.user_id=%s AND p.code=\'hr.view\' LIMIT 1""", (user_id,))
        if not cur.fetchone():
            fail("You do not have permission to view this.", 403)
    cur.execute("""SELECT d.id AS department_id, d.name AS department_name
        FROM staff s JOIN departments d ON d.head_user_id=s.user_id
        WHERE s.id=%s""", (staff_id,))
    row = cur.fetchone()
    return ok(data={"is_head": row is not None, "department": dict(row) if row else None})

# ??? UPDATE STAFF ROLE ???????????????????????????????????????????
@router.patch("/staff/{staff_id}/role")
def update_staff_role(staff_id: int, role_id: int,
    user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT user_id FROM staff WHERE id=%s", (staff_id,))
    staff = cur.fetchone()
    if not staff: fail("Staff not found.", 404)
    uid = staff["user_id"]
    # Remove old non-student/parent roles
    cur.execute("""DELETE FROM user_roles WHERE user_id=%s AND role_id IN
        (SELECT id FROM roles WHERE name NOT IN ('student','parent'))""", (uid,))
    # Assign new role
    cur.execute("INSERT INTO user_roles(user_id, role_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (uid, role_id))
    db.commit()
    return ok(message="Role updated.")

# ??? CHECK HOD STATUS ???????????????????????????????????????????
@router.get("/staff/{staff_id}/is-head")
def check_is_head(staff_id: int, user_id: int = Depends(get_current_user_id), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT user_id FROM staff WHERE id=%s", (staff_id,))
    staff_row = cur.fetchone()
    if not staff_row: fail("Staff not found", 404)
    is_self = staff_row["user_id"] == user_id
    if not is_self:
        cur.execute("""SELECT 1 FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id=ur.role_id
            JOIN permissions p ON p.id=rp.permission_id
            WHERE ur.user_id=%s AND p.code=\'hr.view\' LIMIT 1""", (user_id,))
        if not cur.fetchone():
            fail("You do not have permission to view this.", 403)
    cur.execute("""SELECT d.id AS department_id, d.name AS department_name
        FROM staff s JOIN departments d ON d.head_user_id=s.user_id
        WHERE s.id=%s""", (staff_id,))
    row = cur.fetchone()
    return ok(data={"is_head": row is not None, "department": dict(row) if row else None})

# ??? UPDATE STAFF ROLE ???????????????????????????????????????????
@router.patch("/staff/{staff_id}/role")
def update_staff_role(staff_id: int, role_id: int,
    user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT user_id FROM staff WHERE id=%s", (staff_id,))
    staff = cur.fetchone()
    if not staff: fail("Staff not found.", 404)
    uid = staff["user_id"]
    # Remove old non-student/parent roles
    cur.execute("""DELETE FROM user_roles WHERE user_id=%s AND role_id IN
        (SELECT id FROM roles WHERE name NOT IN ('student','parent'))""", (uid,))
    # Assign new role
    cur.execute("INSERT INTO user_roles(user_id, role_id) VALUES(%s,%s) ON CONFLICT DO NOTHING", (uid, role_id))
    db.commit()
    return ok(message="Role updated.")

# ??? GENERATE EMPLOYEE CODE FOR EXISTING STAFF ??????????????????
@router.post("/staff/{staff_id}/generate-code")
def generate_staff_code(staff_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    # Get user_id for this staff
    cur.execute("SELECT user_id, employee_code, campus_id FROM staff WHERE id=%s", (staff_id,))
    staff = cur.fetchone()
    if not staff: fail("Staff not found.", 404)
    if staff["employee_code"]: fail("Employee code already assigned.", 400)
    # Get role_id for code generation
    cur.execute("SELECT role_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s AND r.name NOT IN ('student','parent') LIMIT 1", (staff["user_id"],))
    role_row = cur.fetchone()
    if not role_row: fail("No role found for this staff.", 400)
    try:
        cur.execute("SELECT sp_generate_employee_code(%s, %s) AS code", (role_row["role_id"], staff["campus_id"]))
        row = cur.fetchone()
        if not row or not row["code"]: fail("Could not generate code - check ID format settings.", 400)
        code = row["code"]
    except Exception as ge:
        print(f"[generate_code] {ge}")
        fail(f"Code generation failed: {str(ge)}", 400)
    cur2 = get_cur(db)
    cur2.execute("UPDATE staff SET employee_code=%s WHERE id=%s", (code, staff_id))
    db.commit()
    return ok(data={"employee_code": code}, message=f"Employee code {code} generated.")

# ??? DEPARTMENT HEAD ?????????????????????????????????????????????

@router.post("/staff/{staff_id}/set-head")
def set_department_head(staff_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    # Get user_id and department_id from staff record
    cur.execute("SELECT user_id, department_id FROM staff WHERE id=%s", (staff_id,))
    staff = cur.fetchone()
    if not staff: fail("Staff not found.", 404)
    dept_id = staff["department_id"]
    if not dept_id:
        # Try to find department from department_roles via user role
        cur.execute("""SELECT dr.department_id FROM user_roles ur
            JOIN department_roles dr ON dr.role_id=ur.role_id
            WHERE ur.user_id=%s LIMIT 1""", (staff["user_id"],))
        dr = cur.fetchone()
        if dr: dept_id = dr["department_id"]
    if not dept_id: fail("Staff has no department assigned. Update staff profile with a department first.", 400)
    cur.execute("SELECT * FROM sp_set_department_head(%s,%s)", (dept_id, staff["user_id"]))
    result = cur.fetchone()
    if result["error_msg"]: fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Department Head assigned successfully.")

@router.delete("/staff/{staff_id}/remove-head")
def remove_department_head(staff_id: int, user_id: int = Depends(require_permission("hr.edit")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    _check_staff_campus(cur, staff_id, campus_id)
    cur.execute("SELECT user_id, department_id FROM staff WHERE id=%s", (staff_id,))
    staff = cur.fetchone()
    if not staff: fail("Staff not found.", 404)
    cur.execute("SELECT sp_remove_department_head(%s,%s)", (staff["department_id"], staff["user_id"]))
    db.commit()
    return ok(message="Department Head removed.")

@router.get("/departments/{dept_id}/head")
def get_department_head(dept_id: int, user_id: int = Depends(require_permission("hr.view")), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    cur = get_cur(db)
    cur.execute("SELECT campus_id FROM departments WHERE id=%s", (dept_id,))
    _drow = cur.fetchone()
    enforce_same_campus(_drow["campus_id"] if _drow else None, campus_id)
    cur.execute("""SELECT u.id, u.first_name, u.last_name, u.email, s.employee_code, des.name AS designation
        FROM departments d JOIN users u ON u.id=d.head_user_id
        LEFT JOIN staff s ON s.user_id=u.id
        LEFT JOIN designations des ON des.id=s.designation_id
        WHERE d.id=%s AND d.head_user_id IS NOT NULL""", (dept_id,))
    row = cur.fetchone()
    return ok(data=dict(row) if row else None)

# ??? ADVANCE STAFF LEAVE WORKFLOW (for WQ actions) ???????????????

class LeaveAdvanceIn(BaseModel):
    action: str
    note: Optional[str] = None

@router.post("/leave/requests/{req_id}/advance")
def advance_leave_workflow(req_id: int, body: LeaveAdvanceIn,
    user_id: int = Depends(get_current_user_id), db=Depends(get_db), campus_id: Optional[int] = Depends(get_current_campus_id)):
    """Advance the leave workflow - works for any step (HOD, HR, etc.)"""
    _check_leave_request_campus(get_cur(db), req_id, campus_id)
    if body.action not in ("approve","reject"):
        fail("Action must be approve or reject.", 400)
    try:
        from app.utils.workflow_engine import WorkflowEngine
        wf = WorkflowEngine()
        result = wf.advance(db, "hr", "staff_leave", req_id,
            action=body.action, actioned_by=user_id, note=body.note or body.action)
        db.commit()
        # If workflow completed or rejected, update leave request status
        if result:
            wf_status = result.get("status","")
            if wf_status in ("completed","approved"):
                _c = get_cur(db)
                _c.execute("UPDATE staff_leave_requests SET status='approved', reviewed_by=%s, reviewed_at=%s, review_note=%s WHERE id=%s",
                    (user_id, get_processing_datetime(db), body.note, req_id))
                # Get leave details for balance deduction
                _c.execute("""SELECT user_id, leave_type_id, total_days, EXTRACT(YEAR FROM from_date)::INT AS yr
                    FROM staff_leave_requests WHERE id=%s""", (req_id,))
                lr = _c.fetchone()
                if lr:
                    # Get policy entitlement for this user's role
                    _c.execute("""SELECT COALESCE(MAX(slp.days_per_year),0) AS entitled
                        FROM user_roles ur JOIN roles r ON r.id=ur.role_id
                        LEFT JOIN staff_leave_policies slp ON slp.leave_type_id=%s
                            AND (slp.role_id=ur.role_id OR slp.applies_to='all')
                        WHERE ur.user_id=%s AND r.name NOT IN ('student','parent')""",
                        (lr["leave_type_id"], lr["user_id"]))
                    pol = _c.fetchone()
                    entitled = pol["entitled"] if pol else 0
                    # Upsert balance with correct total_days
                    _c.execute("""INSERT INTO staff_leave_balances(user_id,leave_type_id,year,total_days,used_days,created_at,updated_at)
                        VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,leave_type_id,year)
                        DO UPDATE SET used_days=staff_leave_balances.used_days+%s, updated_at=%s""",
                        (lr["user_id"],lr["leave_type_id"],lr["yr"],entitled,lr["total_days"],get_processing_datetime(db),get_processing_datetime(db),lr["total_days"],get_processing_datetime(db)))
                db.commit()
            elif wf_status in ("rejected",):
                _c2 = get_cur(db)
                _c2.execute("UPDATE staff_leave_requests SET status='rejected', reviewed_by=%s, reviewed_at=%s, review_note=%s WHERE id=%s",
                    (user_id, get_processing_datetime(db), body.note, req_id))
                db.commit()
        return ok(message=f"Leave {body.action}d successfully.")
    except Exception as e:
        print(f"[leave advance] {e}")
        import traceback; traceback.print_exc()
        fail(str(e), 400)
