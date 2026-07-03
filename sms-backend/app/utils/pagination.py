"""Pagination helpers for list endpoints."""
from flask import request

def get_page_args():
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))
    return page, per_page
