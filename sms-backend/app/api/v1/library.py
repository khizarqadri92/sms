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


# ── Categories ─────────────────────────────────────────────

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
    return success(data={"fine_amount": float(result["fine_amount"]), "days_overdue": result["days_overdue"]}, message=msg)


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
