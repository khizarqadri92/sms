"""
Native FastAPI router for Library - migrated from app/api/v1/library.py.
Every path, method, permission requirement, and response shape matches the
original Flask blueprint exactly, so the existing frontend (libraryApi.js)
needs zero changes. Registered in main.py BEFORE the Flask WSGI mount.
"""

from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel

from app.fastapi_auth import get_current_user_id
from app.fastapi_permissions import require_permission
from app.fastapi_db import get_db, get_cur as _get_cur

router = APIRouter()


def get_cur(db):
    return _get_cur(db)


def clean(value):
    return None if value == "" else value


def fail(message: str, status_code: int = 400, details=None):
    raise HTTPException(status_code=status_code, detail={"status": "error", "message": message, "details": details})


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


# ── Pydantic request models ──────────────────────────────────

class NotesIn(BaseModel):
    notes: Optional[Any] = None


class VerifyAuditIn(BaseModel):
    identifier: str


class ResolutionIn(BaseModel):
    resolution: str


class MembershipRuleIn(BaseModel):
    max_books: Any
    borrow_days: Any
    renewal_limit: Any
    fine_per_day: Any


class CategoryIn(BaseModel):
    name: str
    parent_id: Optional[Any] = None


class AuthorIn(BaseModel):
    name: str
    bio: Optional[Any] = None
    nationality: Optional[Any] = None
    date_of_birth: Optional[Any] = None


class PublisherIn(BaseModel):
    name: str
    address: Optional[Any] = None
    contact_person: Optional[Any] = None
    phone: Optional[Any] = None
    email: Optional[Any] = None


class BookIn(BaseModel):
    title: str
    isbn: Optional[Any] = None
    subtitle: Optional[Any] = None
    author_id: Optional[Any] = None
    publisher_id: Optional[Any] = None
    category_id: Optional[Any] = None
    edition: Optional[Any] = None
    publication_year: Optional[Any] = None
    language: Optional[str] = "English"
    shelf: Optional[Any] = None
    rack: Optional[Any] = None
    description: Optional[Any] = None
    cover_image: Optional[Any] = None
    num_copies: Optional[Any] = 1


class AddCopiesIn(BaseModel):
    num_copies: Optional[Any] = 1


class ResolveChargeIn(BaseModel):
    resolution: str
    charge_amount: Optional[Any] = 0


class EnrollMemberIn(BaseModel):
    user_id: Any
    member_type: str


class IssueBookIn(BaseModel):
    copy_id: Any
    member_id: Any


class ReturnBookIn(BaseModel):
    return_condition: Optional[str] = "good"


class PayFineIn(BaseModel):
    amount: Any
    method: Optional[str] = "cash"


class PlaceReservationIn(BaseModel):
    book_id: Any
    member_id: Any


# ── Dashboard ─────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_library_dashboard")
    return ok(data=dict(cur.fetchone()))


# ── Inventory / Audits ────────────────────────────

@router.get("/inventory/summary")
def get_inventory_summary(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_inventory_summary")
    return ok(data=dict(cur.fetchone()))


@router.get("/inventory/active-audit")
def get_active_audit(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_active_audit()")
    row = cur.fetchone()
    return ok(data=dict(row) if row else None)


@router.post("/inventory/audits")
def start_audit(body: NotesIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_start_inventory_audit(%s, %s)", (user_id, body.notes))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Inventory audit started.")


@router.post("/inventory/audits/{audit_id}/verify")
def verify_audit_copy(audit_id: int, body: VerifyAuditIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_verify_audit_copy(%s, %s, %s)", (audit_id, body.identifier, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data=dict(result), message=("Already verified: " if result["already_verified"] else "Verified: ") + result["book_title"])


@router.get("/inventory/audits/{audit_id}/items")
def get_audit_items(audit_id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_audit_verified_items(%s)", (audit_id,))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/inventory/audits/{audit_id}/complete")
def complete_audit(audit_id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_complete_inventory_audit(%s)", (audit_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"missing_count": result["missing_count"]}, message="Audit completed. " + str(result["missing_count"]) + " cop" + ("y" if result["missing_count"] == 1 else "ies") + " flagged missing.")


@router.get("/copies/missing")
def list_missing_copies(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_missing_copies()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/copies/{id}/resolve-missing")
def resolve_missing_copy(id: int, body: ResolutionIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    if body.resolution not in ("found", "remove"):
        fail("resolution must be found or remove.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_resolve_missing_copy(%s, %s)", (id, body.resolution))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Copy marked as " + ("found." if body.resolution == "found" else "removed."))


# ── Categories ─────────────────────────────────────────────

@router.get("/settings/membership-rules")
def get_membership_rules(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_membership_rules()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/settings/membership-rules/{member_type}")
def update_membership_rule(member_type: str, body: MembershipRuleIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    for field in ("max_books", "borrow_days", "renewal_limit", "fine_per_day"):
        if getattr(body, field) in (None, ""):
            fail(field + " is required.", 400)
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_membership_rule(%s, %s, %s, %s, %s)",
        (member_type, body.max_books, body.borrow_days, body.renewal_limit, body.fine_per_day)
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("No rule found for member type '" + member_type + "'.", 404)
    db.commit()
    return ok(data=dict(row), message="Rule updated.")


@router.get("/categories")
def list_categories(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_categories()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/categories")
def create_category(body: CategoryIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_create_category(%s, %s)", (body.name, body.parent_id))
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Category created.")


@router.get("/categories/all")
def list_all_categories(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_categories()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/categories/{id}")
def update_category(id: int, body: CategoryIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_update_category(%s, %s, %s)", (id, body.name, body.parent_id))
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Category not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Category updated.")


@router.delete("/categories/{id}")
def deactivate_category(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_category(%s)", (id,))
    db.commit()
    return ok(message="Category deactivated.")


@router.post("/categories/{id}/reactivate")
def reactivate_category(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_category(%s)", (id,))
    db.commit()
    return ok(message="Category reactivated.")


# ── Authors ────────────────────────────────────────────────

@router.get("/authors")
def list_authors(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_authors()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/authors")
def create_author(body: AuthorIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_author(%s, %s, %s, %s)",
        (body.name, clean(body.bio), clean(body.nationality), clean(body.date_of_birth))
    )
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Author added.")


@router.get("/authors/all")
def list_all_authors(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_authors()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/authors/{id}")
def update_author(id: int, body: AuthorIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_author(%s, %s, %s, %s, %s)",
        (id, body.name, clean(body.bio), clean(body.nationality), clean(body.date_of_birth))
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Author not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Author updated.")


@router.delete("/authors/{id}")
def deactivate_author(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_author(%s)", (id,))
    db.commit()
    return ok(message="Author deactivated.")


@router.post("/authors/{id}/reactivate")
def reactivate_author(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_author(%s)", (id,))
    db.commit()
    return ok(message="Author reactivated.")


# ── Publishers ─────────────────────────────────────────────

@router.get("/publishers")
def list_publishers(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_publishers()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/publishers")
def create_publisher(body: PublisherIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_create_publisher(%s, %s, %s, %s, %s)",
        (body.name, body.address, body.contact_person, body.phone, body.email)
    )
    row = cur.fetchone()
    db.commit()
    return ok(data=dict(row), message="Publisher added.")


@router.get("/publishers/all")
def list_all_publishers(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_all_publishers()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.put("/publishers/{id}")
def update_publisher(id: int, body: PublisherIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_update_publisher(%s, %s, %s, %s, %s, %s)",
        (id, body.name, body.address, body.contact_person, body.phone, body.email)
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        fail("Publisher not found.", 404)
    db.commit()
    return ok(data=dict(row), message="Publisher updated.")


@router.delete("/publishers/{id}")
def deactivate_publisher(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_publisher(%s)", (id,))
    db.commit()
    return ok(message="Publisher deactivated.")


@router.post("/publishers/{id}/reactivate")
def reactivate_publisher(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_reactivate_publisher(%s)", (id,))
    db.commit()
    return ok(message="Publisher reactivated.")


# ── Books ──────────────────────────────────────────────────

@router.get("/books")
def list_books(
    search: Optional[str] = Query(None), category_id: Optional[str] = Query(None),
    author_id: Optional[str] = Query(None), availability: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)
):
    cur = get_cur(db)
    conditions, params = ["is_active"], []
    if search:
        conditions.append("(title ILIKE %s OR isbn ILIKE %s OR author_name ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t]
    if category_id:
        conditions.append("category_id = %s")
        params.append(category_id)
    if author_id:
        conditions.append("author_id = %s")
        params.append(author_id)
    if availability == "available":
        conditions.append("available_copies > 0")
    elif availability == "unavailable":
        conditions.append("available_copies = 0")

    query = "SELECT * FROM vw_library_books WHERE " + " AND ".join(conditions) + " ORDER BY title"
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/books/{id}")
def get_book(id: int, user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_library_books WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        fail("Book not found.", 404)
    cur.execute("SELECT * FROM library_book_copies WHERE book_id = %s ORDER BY id", (id,))
    copies = [dict(r) for r in cur.fetchall()]
    data = dict(row)
    data["copies"] = copies
    return ok(data=data)


@router.post("/books")
def create_book(body: BookIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_create_book(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            clean(body.isbn), body.title, clean(body.subtitle),
            clean(body.author_id), clean(body.publisher_id), clean(body.category_id),
            clean(body.edition), clean(body.publication_year), body.language or "English",
            clean(body.shelf), clean(body.rack), clean(body.description), clean(body.cover_image),
            body.num_copies or 1,
        )
    )
    book_id = cur.fetchone()["sp_create_book"]
    db.commit()
    return ok(data={"id": book_id}, message="Book added.")


@router.put("/books/{id}")
def update_book(id: int, body: BookIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT sp_update_book(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, clean(body.isbn), body.title, clean(body.subtitle),
            clean(body.author_id), clean(body.publisher_id), clean(body.category_id),
            clean(body.edition), clean(body.publication_year), body.language or "English",
            clean(body.shelf), clean(body.rack), clean(body.description), clean(body.cover_image),
        )
    )
    db.commit()
    return ok(message="Book updated.")


@router.post("/books/{id}/copies")
def add_copies(id: int, body: AddCopiesIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    num = int(body.num_copies or 1)
    cur = get_cur(db)
    cur.execute("SELECT sp_add_book_copies(%s, %s)", (id, num))
    db.commit()
    return ok(message=str(num) + " cop" + ("y" if num == 1 else "ies") + " added.")


@router.get("/copies/damaged")
def list_damaged_copies(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_damaged_copies()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/copies/{id}/resolve-damage")
def resolve_damaged_copy(id: int, body: ResolveChargeIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    if body.resolution not in ("repair", "replace", "remove"):
        fail("resolution must be repair, replace, or remove.", 400)
    charge_amount = body.charge_amount or 0
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_resolve_damaged_copy(%s, %s, %s, %s)", (id, body.resolution, charge_amount, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    msg = "Copy marked as " + ("repaired" if body.resolution == "repair" else "replaced" if body.resolution == "replace" else "removed") + "."
    if charge_amount:
        msg += " Rs. " + str(charge_amount) + " charged to the member."
    return ok(data={"new_copy_id": result["new_copy_id"]}, message=msg)


@router.post("/issues/{transaction_id}/report-lost")
def report_book_lost(transaction_id: int, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_report_book_lost(%s)", (transaction_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"copy_id": result["copy_id"]}, message="Book reported lost.")


@router.get("/copies/lost")
def list_lost_copies(user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_get_lost_copies()")
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/copies/{id}/resolve-lost")
def resolve_lost_copy(id: int, body: ResolveChargeIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    if body.resolution not in ("found", "replace", "remove"):
        fail("resolution must be found, replace, or remove.", 400)
    charge_amount = body.charge_amount or 0
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_resolve_lost_copy(%s, %s, %s, %s)", (id, body.resolution, charge_amount, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    msg = "Copy marked as " + ("found" if body.resolution == "found" else "replaced" if body.resolution == "replace" else "removed") + "."
    if charge_amount:
        msg += " Rs. " + str(charge_amount) + " charged to the member."
    return ok(data={"new_copy_id": result["new_copy_id"]}, message=msg)


@router.delete("/books/{id}")
def deactivate_book(id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT sp_deactivate_book(%s)", (id,))
    db.commit()
    return ok(message="Book removed from catalog.")


# ── Members ───────────────────────────────────────────────

@router.get("/members")
def list_members(
    search: Optional[str] = Query(None), member_type: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)
):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t]
    if member_type:
        conditions.append("member_type = %s")
        params.append(member_type)
    query = "SELECT * FROM vw_library_members WHERE " + " AND ".join(conditions) + " ORDER BY first_name"
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/search-users")
def search_enrollable_users(
    type: Optional[str] = Query(None, alias="type"), q: Optional[str] = Query(""),
    user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)
):
    if type not in ("student", "teacher", "staff"):
        fail("type must be student, teacher, or staff.", 400)
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_search_enrollable_users(%s, %s)", (type, q))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/members")
def enroll_member(body: EnrollMemberIn, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_enroll_member(%s, %s)", (body.user_id, body.member_type))
    result = cur.fetchone()
    if result["error_msg"]:
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Member enrolled.")


@router.get("/members/me")
def my_membership(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM vw_library_members WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        fail("You are not a library member yet.", 404)
    return ok(data=dict(row))


# ── Issue / Return / Fines ─────────────────────────────────

@router.get("/issues")
def list_issues(
    status: Optional[str] = Query(None), member_id: Optional[str] = Query(None),
    user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)
):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if status:
        conditions.append("current_status = %s")
        params.append(status)
    if member_id:
        conditions.append("member_id = %s")
        params.append(member_id)
    query = "SELECT * FROM vw_library_issues WHERE " + " AND ".join(conditions) + " ORDER BY issued_at DESC"
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/issues/my-history")
def my_issue_history(user_id: int = Depends(require_permission("library.view")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT id FROM library_members WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return ok(data=[])
    cur.execute("SELECT * FROM vw_library_issues WHERE member_id = %s ORDER BY issued_at DESC", (row["id"],))
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/issue")
def issue_book(body: IssueBookIn, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_issue_book(%s, %s, %s)", (body.copy_id, body.member_id, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"transaction_id": result["transaction_id"]}, message="Book issued.")


@router.post("/return/{transaction_id}")
def return_book(transaction_id: int, body: ReturnBookIn, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    condition = body.return_condition or "good"
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_return_book(%s, %s, %s)", (transaction_id, condition, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    msg = "Book returned."
    if float(result["fine_amount"]) > 0:
        msg += " Fine of Rs. " + str(result["fine_amount"]) + " applied (" + str(result["days_overdue"]) + " day(s) overdue)."

    try:
        cur.execute("""
            SELECT bc.book_id, b.title
            FROM library_issue_transactions it
            JOIN library_book_copies bc ON bc.id = it.copy_id
            JOIN library_books b ON b.id = bc.book_id
            WHERE it.id = %s
        """, (transaction_id,))
        book_row = cur.fetchone()
        if book_row:
            cur.execute("SELECT * FROM sp_try_fulfill_reservation(%s)", (book_row["book_id"],))
            fulfill = cur.fetchone()
            if fulfill and fulfill["reservation_id"]:
                db.commit()
                from app.utils.notify import send_notification
                cur.execute("SELECT user_id FROM library_members WHERE id = %s", (fulfill["member_id"],))
                mrow = cur.fetchone()
                if mrow:
                    send_notification(
                        mrow["user_id"], "Reserved Book Available",
                        "'" + book_row["title"] + "' is now available for pickup. Please collect it soon.",
                        "info"
                    )
    except Exception:
        pass

    return ok(data={"fine_amount": float(result["fine_amount"]), "days_overdue": result["days_overdue"]}, message=msg)


@router.post("/issues/{transaction_id}/renew")
def renew_book(transaction_id: int, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_renew_book(%s)", (transaction_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"new_due_date": str(result["new_due_date"])}, message="Book renewed. New due date: " + str(result["new_due_date"]))


@router.get("/fines/pending")
def list_pending_fines(search: Optional[str] = Query(None), user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s OR book_title ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t, t]
    query = "SELECT * FROM vw_library_pending_fines WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.get("/fines/history")
def fine_history(search: Optional[str] = Query(None), user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s OR book_title ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t, t]
    query = "SELECT * FROM vw_library_fine_history WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/fines/{transaction_id}/pay")
def pay_fine(transaction_id: int, body: PayFineIn, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute(
        "SELECT * FROM sp_pay_fine(%s, %s, %s, %s)",
        (transaction_id, body.amount, body.method or "cash", user_id)
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Fine payment recorded.")


@router.get("/reservations")
def list_reservations(status: Optional[str] = Query(None), user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    conditions, params = ["1=1"], []
    if status:
        status_list = [s.strip() for s in status.split(",") if s.strip()]
        conditions.append("r.status = ANY(%s)")
        params.append(status_list)
    query = """
        SELECT r.id, r.book_id, b.title AS book_title, r.member_id,
               u.first_name, u.last_name, lm.library_card_no, lm.member_type,
               r.requested_at, r.status, r.notified_at,
               (SELECT bc.id FROM library_book_copies bc WHERE bc.book_id = r.book_id AND bc.status = 'reserved' LIMIT 1) AS held_copy_id
        FROM library_reservations r
        JOIN library_books b ON b.id = r.book_id
        JOIN library_members lm ON lm.id = r.member_id
        JOIN users u ON u.id = lm.user_id
        WHERE """ + " AND ".join(conditions) + """
        ORDER BY r.requested_at DESC
    """
    cur.execute(query, params)
    return ok(data=[dict(r) for r in cur.fetchall()])


@router.post("/reservations")
def place_reservation(body: PlaceReservationIn, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_place_reservation(%s, %s)", (body.book_id, body.member_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(data={"id": result["id"]}, message="Reservation placed.")


@router.delete("/reservations/{id}")
def cancel_reservation(id: int, user_id: int = Depends(require_permission("library.issue")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_cancel_reservation(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Reservation cancelled.")


@router.post("/fines/{transaction_id}/waive")
def waive_fine(transaction_id: int, user_id: int = Depends(require_permission("library.manage")), db=Depends(get_db)):
    cur = get_cur(db)
    cur.execute("SELECT * FROM sp_waive_fine(%s, %s)", (transaction_id, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        fail(result["error_msg"], 400)
    db.commit()
    return ok(message="Fine waived.")
