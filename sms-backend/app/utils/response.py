"""Standard API response helpers — ensures consistent JSON envelope."""
from flask import jsonify

def success(data=None, message="Success", status=200):
    return jsonify({"status": "success", "message": message, "data": data}), status

def error(message="Error", status=400, details=None):
    return jsonify({"status": "error", "message": message, "details": details}), status

def paginated(data, total, page, per_page, status=200):
    return jsonify({
        "status": "success",
        "data": data,
        "pagination": {"total": total, "page": page, "per_page": per_page}
    }), status
