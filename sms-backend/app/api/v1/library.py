from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity
from app.middleware.jwt_guard import jwt_required_custom
from app.middleware.rbac import require_permission
from app.utils.response import success, error
from app.db.connection import get_db
import psycopg2.extras

bp = Blueprint("library", __name__)


def get_cur():
    db = get_db()
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def clean(value):
    """Convert empty strings from form fields to None so numeric/optional
    stored procedure parameters don't choke on '' where NULL is expected."""
    return None if value == "" else value


# ── Dashboard ─────────────────────────────────────────────

@bp.get("/dashboard")
@jwt_required_custom
@require_permission("library.view")
def get_dashboard():
    cur = get_cur()
    cur.execute("SELECT * FROM vw_library_dashboard")
    return success(data=dict(cur.fetchone()))


# ── Inventory / Audits ────────────────────────────

@bp.get("/inventory/summary")
@jwt_required_custom
@require_permission("library.manage")
def get_inventory_summary():
    cur = get_cur()
    cur.execute("SELECT * FROM vw_inventory_summary")
    return success(data=dict(cur.fetchone()))


@bp.get("/inventory/active-audit")
@jwt_required_custom
@require_permission("library.manage")
def get_active_audit():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_active_audit()")
    row = cur.fetchone()
    return success(data=dict(row) if row else None)


@bp.post("/inventory/audits")
@jwt_required_custom
@require_permission("library.manage")
def start_audit():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_start_inventory_audit(%s, %s)", (user_id, body.get("notes")))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Inventory audit started.")


@bp.post("/inventory/audits/<int:audit_id>/verify")
@jwt_required_custom
@require_permission("library.manage")
def verify_audit_copy(audit_id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    identifier = body.get("identifier")
    if not identifier:
        return error("identifier (barcode or accession no.) is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_verify_audit_copy(%s, %s, %s)", (audit_id, identifier, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data=dict(result), message=("Already verified: " if result["already_verified"] else "Verified: ") + result["book_title"])


@bp.get("/inventory/audits/<int:audit_id>/items")
@jwt_required_custom
@require_permission("library.manage")
def get_audit_items(audit_id):
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_audit_verified_items(%s)", (audit_id,))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/inventory/audits/<int:audit_id>/complete")
@jwt_required_custom
@require_permission("library.manage")
def complete_audit(audit_id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_complete_inventory_audit(%s)", (audit_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"missing_count": result["missing_count"]}, message="Audit completed. " + str(result["missing_count"]) + " cop" + ("y" if result["missing_count"] == 1 else "ies") + " flagged missing.")


@bp.get("/copies/missing")
@jwt_required_custom
@require_permission("library.manage")
def list_missing_copies():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_missing_copies()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/copies/<int:id>/resolve-missing")
@jwt_required_custom
@require_permission("library.manage")
def resolve_missing_copy(id):
    body = request.get_json() or {}
    resolution = body.get("resolution")
    if resolution not in ("found", "remove"):
        return error("resolution must be found or remove.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_resolve_missing_copy(%s, %s)", (id, resolution))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Copy marked as " + ("found." if resolution == "found" else "removed."))


# ── Categories ─────────────────────────────────────────────

@bp.get("/settings/membership-rules")
@jwt_required_custom
@require_permission("library.manage")
def get_membership_rules():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_membership_rules()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.put("/settings/membership-rules/<string:member_type>")
@jwt_required_custom
@require_permission("library.manage")
def update_membership_rule(member_type):
    body = request.get_json() or {}
    for field in ("max_books", "borrow_days", "renewal_limit", "fine_per_day"):
        if body.get(field) in (None, ""):
            return error(field + " is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_membership_rule(%s, %s, %s, %s, %s)",
        (member_type, body["max_books"], body["borrow_days"], body["renewal_limit"], body["fine_per_day"])
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("No rule found for member type '" + member_type + "'.", 404)
    db.commit()
    return success(data=dict(row), message="Rule updated.")


@bp.get("/categories")
@jwt_required_custom
@require_permission("library.view")
def list_categories():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_categories()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/categories")
@jwt_required_custom
@require_permission("library.manage")
def create_category():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_create_category(%s, %s)", (body["name"], body.get("parent_id")))
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Category created.")


@bp.get("/categories/all")
@jwt_required_custom
@require_permission("library.manage")
def list_all_categories():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_all_categories()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.put("/categories/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def update_category(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_update_category(%s, %s, %s)", (id, body["name"], body.get("parent_id")))
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Category not found.", 404)
    db.commit()
    return success(data=dict(row), message="Category updated.")


@bp.delete("/categories/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def deactivate_category(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_category(%s)", (id,))
    db.commit()
    return success(message="Category deactivated.")


@bp.post("/categories/<int:id>/reactivate")
@jwt_required_custom
@require_permission("library.manage")
def reactivate_category(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_category(%s)", (id,))
    db.commit()
    return success(message="Category reactivated.")


# ── Authors ────────────────────────────────────────────────

@bp.get("/authors")
@jwt_required_custom
@require_permission("library.view")
def list_authors():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_authors()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/authors")
@jwt_required_custom
@require_permission("library.manage")
def create_author():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_author(%s, %s, %s, %s)",
        (body["name"], body.get("bio"), body.get("nationality"), body.get("date_of_birth"))
    )
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Author added.")


@bp.get("/authors/all")
@jwt_required_custom
@require_permission("library.manage")
def list_all_authors():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_all_authors()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.put("/authors/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def update_author(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_author(%s, %s, %s, %s, %s)",
        (id, body["name"], body.get("bio"), body.get("nationality"), body.get("date_of_birth"))
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Author not found.", 404)
    db.commit()
    return success(data=dict(row), message="Author updated.")


@bp.delete("/authors/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def deactivate_author(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_author(%s)", (id,))
    db.commit()
    return success(message="Author deactivated.")


@bp.post("/authors/<int:id>/reactivate")
@jwt_required_custom
@require_permission("library.manage")
def reactivate_author(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_author(%s)", (id,))
    db.commit()
    return success(message="Author reactivated.")


# ── Publishers ─────────────────────────────────────────────

@bp.get("/publishers")
@jwt_required_custom
@require_permission("library.view")
def list_publishers():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_publishers()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/publishers")
@jwt_required_custom
@require_permission("library.manage")
def create_publisher():
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_create_publisher(%s, %s, %s, %s, %s)",
        (body["name"], body.get("address"), body.get("contact_person"), body.get("phone"), body.get("email"))
    )
    row = cur.fetchone()
    db.commit()
    return success(data=dict(row), message="Publisher added.")


@bp.get("/publishers/all")
@jwt_required_custom
@require_permission("library.manage")
def list_all_publishers():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_all_publishers()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.put("/publishers/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def update_publisher(id):
    body = request.get_json() or {}
    if not body.get("name"):
        return error("name is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_update_publisher(%s, %s, %s, %s, %s, %s)",
        (id, body["name"], body.get("address"), body.get("contact_person"), body.get("phone"), body.get("email"))
    )
    row = cur.fetchone()
    if not row:
        db.rollback()
        return error("Publisher not found.", 404)
    db.commit()
    return success(data=dict(row), message="Publisher updated.")


@bp.delete("/publishers/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def deactivate_publisher(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_publisher(%s)", (id,))
    db.commit()
    return success(message="Publisher deactivated.")


@bp.post("/publishers/<int:id>/reactivate")
@jwt_required_custom
@require_permission("library.manage")
def reactivate_publisher(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_reactivate_publisher(%s)", (id,))
    db.commit()
    return success(message="Publisher reactivated.")


# ── Books ──────────────────────────────────────────────────

@bp.get("/books")
@jwt_required_custom
@require_permission("library.view")
def list_books():
    search = request.args.get("search")
    category_id = request.args.get("category_id")
    author_id = request.args.get("author_id")
    availability = request.args.get("availability")  # 'available' | 'unavailable'

    cur = get_cur()
    conditions, params = ["is_active"], []
    if search:
        conditions.append("(title ILIKE %s OR isbn ILIKE %s OR author_name ILIKE %s)")
        t = f"%{search}%"
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
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/books/<int:id>")
@jwt_required_custom
@require_permission("library.view")
def get_book(id):
    cur = get_cur()
    cur.execute("SELECT * FROM vw_library_books WHERE id = %s", (id,))
    row = cur.fetchone()
    if not row:
        return error("Book not found.", 404)
    cur.execute("SELECT * FROM library_book_copies WHERE book_id = %s ORDER BY id", (id,))
    copies = [dict(r) for r in cur.fetchall()]
    data = dict(row)
    data["copies"] = copies
    return success(data=data)


@bp.post("/books")
@jwt_required_custom
@require_permission("library.manage")
def create_book():
    body = request.get_json() or {}
    if not body.get("title"):
        return error("title is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT sp_create_book(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            clean(body.get("isbn")), body["title"], clean(body.get("subtitle")),
            clean(body.get("author_id")), clean(body.get("publisher_id")), clean(body.get("category_id")),
            clean(body.get("edition")), clean(body.get("publication_year")), body.get("language") or "English",
            clean(body.get("shelf")), clean(body.get("rack")), clean(body.get("description")), clean(body.get("cover_image")),
            body.get("num_copies") or 1,
        )
    )
    book_id = cur.fetchone()["sp_create_book"]
    db.commit()
    return success(data={"id": book_id}, message="Book added.")


@bp.put("/books/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def update_book(id):
    body = request.get_json() or {}
    if not body.get("title"):
        return error("title is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT sp_update_book(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            id, clean(body.get("isbn")), body["title"], clean(body.get("subtitle")),
            clean(body.get("author_id")), clean(body.get("publisher_id")), clean(body.get("category_id")),
            clean(body.get("edition")), clean(body.get("publication_year")), body.get("language") or "English",
            clean(body.get("shelf")), clean(body.get("rack")), clean(body.get("description")), clean(body.get("cover_image")),
        )
    )
    db.commit()
    return success(message="Book updated.")


@bp.post("/books/<int:id>/copies")
@jwt_required_custom
@require_permission("library.manage")
def add_copies(id):
    body = request.get_json() or {}
    num = int(body.get("num_copies", 1))
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_add_book_copies(%s, %s)", (id, num))
    db.commit()
    return success(message=f"{num} cop{'y' if num == 1 else 'ies'} added.")


@bp.get("/copies/damaged")
@jwt_required_custom
@require_permission("library.manage")
def list_damaged_copies():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_damaged_copies()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/copies/<int:id>/resolve-damage")
@jwt_required_custom
@require_permission("library.manage")
def resolve_damaged_copy(id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    resolution = body.get("resolution")
    if resolution not in ("repair", "replace", "remove"):
        return error("resolution must be repair, replace, or remove.", 400)
    charge_amount = body.get("charge_amount") or 0
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_resolve_damaged_copy(%s, %s, %s, %s)",
        (id, resolution, charge_amount, user_id)
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    msg = "Copy marked as " + ("repaired" if resolution == "repair" else "replaced" if resolution == "replace" else "removed") + "."
    if charge_amount:
        msg += " Rs. " + str(charge_amount) + " charged to the member."
    return success(data={"new_copy_id": result["new_copy_id"]}, message=msg)


@bp.post("/issues/<int:transaction_id>/report-lost")
@jwt_required_custom
@require_permission("library.issue")
def report_book_lost(transaction_id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_report_book_lost(%s)", (transaction_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"copy_id": result["copy_id"]}, message="Book reported lost.")


@bp.get("/copies/lost")
@jwt_required_custom
@require_permission("library.manage")
def list_lost_copies():
    cur = get_cur()
    cur.execute("SELECT * FROM sp_get_lost_copies()")
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/copies/<int:id>/resolve-lost")
@jwt_required_custom
@require_permission("library.manage")
def resolve_lost_copy(id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    resolution = body.get("resolution")
    if resolution not in ("found", "replace", "remove"):
        return error("resolution must be found, replace, or remove.", 400)
    charge_amount = body.get("charge_amount") or 0
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_resolve_lost_copy(%s, %s, %s, %s)",
        (id, resolution, charge_amount, user_id)
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    msg = "Copy marked as " + ("found" if resolution == "found" else "replaced" if resolution == "replace" else "removed") + "."
    if charge_amount:
        msg += " Rs. " + str(charge_amount) + " charged to the member."
    return success(data={"new_copy_id": result["new_copy_id"]}, message=msg)


@bp.delete("/books/<int:id>")
@jwt_required_custom
@require_permission("library.manage")
def deactivate_book(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT sp_deactivate_book(%s)", (id,))
    db.commit()
    return success(message="Book removed from catalog.")


# ── Members ───────────────────────────────────────────────

@bp.get("/members")
@jwt_required_custom
@require_permission("library.manage")
def list_members():
    search = request.args.get("search")
    member_type = request.args.get("member_type")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s)")
        t = f"%{search}%"
        params += [t, t, t]
    if member_type:
        conditions.append("member_type = %s")
        params.append(member_type)
    query = "SELECT * FROM vw_library_members WHERE " + " AND ".join(conditions) + " ORDER BY first_name"
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/search-users")
@jwt_required_custom
@require_permission("library.manage")
def search_enrollable_users():
    member_type = request.args.get("type")
    query = request.args.get("q", "")
    if member_type not in ("student", "teacher", "staff"):
        return error("type must be student, teacher, or staff.", 400)
    cur = get_cur()
    cur.execute("SELECT * FROM sp_search_enrollable_users(%s, %s)", (member_type, query))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/members")
@jwt_required_custom
@require_permission("library.manage")
def enroll_member():
    body = request.get_json() or {}
    if not body.get("user_id") or not body.get("member_type"):
        return error("user_id and member_type are required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_enroll_member(%s, %s)", (body["user_id"], body["member_type"]))
    result = cur.fetchone()
    if result["error_msg"]:
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Member enrolled.")


@bp.get("/members/me")
@jwt_required_custom
@require_permission("library.view")
def my_membership():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT * FROM vw_library_members WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return error("You are not a library member yet.", 404)
    return success(data=dict(row))


# ── Issue / Return / Fines ─────────────────────────────────

@bp.get("/issues")
@jwt_required_custom
@require_permission("library.issue")
def list_issues():
    status = request.args.get("status")  # 'issued' | 'overdue' | 'returned'
    member_id = request.args.get("member_id")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if status:
        conditions.append("current_status = %s")
        params.append(status)
    if member_id:
        conditions.append("member_id = %s")
        params.append(member_id)
    query = "SELECT * FROM vw_library_issues WHERE " + " AND ".join(conditions) + " ORDER BY issued_at DESC"
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/issues/my-history")
@jwt_required_custom
@require_permission("library.view")
def my_issue_history():
    user_id = int(get_jwt_identity())
    cur = get_cur()
    cur.execute("SELECT id FROM library_members WHERE user_id = %s", (user_id,))
    row = cur.fetchone()
    if not row:
        return success(data=[])
    cur.execute("SELECT * FROM vw_library_issues WHERE member_id = %s ORDER BY issued_at DESC", (row["id"],))
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/issue")
@jwt_required_custom
@require_permission("library.issue")
def issue_book():
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    if not body.get("copy_id") or not body.get("member_id"):
        return error("copy_id and member_id are required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_issue_book(%s, %s, %s)", (body["copy_id"], body["member_id"], user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"transaction_id": result["transaction_id"]}, message="Book issued.")


@bp.post("/return/<int:transaction_id>")
@jwt_required_custom
@require_permission("library.issue")
def return_book(transaction_id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    condition = body.get("return_condition", "good")
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_return_book(%s, %s, %s)", (transaction_id, condition, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    msg = "Book returned."
    if float(result["fine_amount"]) > 0:
        msg += f" Fine of Rs. {result['fine_amount']} applied ({result['days_overdue']} day(s) overdue)."

    # If someone is waiting for this book, hold the newly-freed copy for them and notify.
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
                        f"'{book_row['title']}' is now available for pickup. Please collect it soon.",
                        "info"
                    )
    except Exception:
        pass

    return success(data={"fine_amount": float(result["fine_amount"]), "days_overdue": result["days_overdue"]}, message=msg)


@bp.post("/issues/<int:transaction_id>/renew")
@jwt_required_custom
@require_permission("library.issue")
def renew_book(transaction_id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_renew_book(%s)", (transaction_id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"new_due_date": str(result["new_due_date"])}, message="Book renewed. New due date: " + str(result["new_due_date"]))


@bp.get("/fines/pending")
@jwt_required_custom
@require_permission("library.issue")
def list_pending_fines():
    search = request.args.get("search")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s OR book_title ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t, t]
    query = "SELECT * FROM vw_library_pending_fines WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.get("/fines/history")
@jwt_required_custom
@require_permission("library.issue")
def fine_history():
    search = request.args.get("search")
    cur = get_cur()
    conditions, params = ["1=1"], []
    if search:
        conditions.append("(first_name ILIKE %s OR last_name ILIKE %s OR library_card_no ILIKE %s OR book_title ILIKE %s)")
        t = "%" + search + "%"
        params += [t, t, t, t]
    query = "SELECT * FROM vw_library_fine_history WHERE " + " AND ".join(conditions)
    cur.execute(query, params)
    return success(data=[dict(r) for r in cur.fetchall()])



@bp.post("/fines/<int:transaction_id>/pay")
@jwt_required_custom
@require_permission("library.issue")
def pay_fine(transaction_id):
    user_id = int(get_jwt_identity())
    body = request.get_json() or {}
    if not body.get("amount"):
        return error("amount is required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute(
        "SELECT * FROM sp_pay_fine(%s, %s, %s, %s)",
        (transaction_id, body["amount"], body.get("method", "cash"), user_id)
    )
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Fine payment recorded.")


@bp.get("/reservations")
@jwt_required_custom
@require_permission("library.issue")
def list_reservations():
    status = request.args.get("status")
    cur = get_cur()
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
    return success(data=[dict(r) for r in cur.fetchall()])


@bp.post("/reservations")
@jwt_required_custom
@require_permission("library.issue")
def place_reservation():
    body = request.get_json() or {}
    if not body.get("book_id") or not body.get("member_id"):
        return error("book_id and member_id are required.", 400)
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_place_reservation(%s, %s)", (body["book_id"], body["member_id"]))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(data={"id": result["id"]}, message="Reservation placed.")


@bp.delete("/reservations/<int:id>")
@jwt_required_custom
@require_permission("library.issue")
def cancel_reservation(id):
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_cancel_reservation(%s)", (id,))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Reservation cancelled.")


@bp.post("/fines/<int:transaction_id>/waive")
@jwt_required_custom
@require_permission("library.manage")
def waive_fine(transaction_id):
    user_id = int(get_jwt_identity())
    db, cur = get_db(), get_cur()
    cur.execute("SELECT * FROM sp_waive_fine(%s, %s)", (transaction_id, user_id))
    result = cur.fetchone()
    if result["error_msg"]:
        db.rollback()
        return error(result["error_msg"], 400)
    db.commit()
    return success(message="Fine waived.")
