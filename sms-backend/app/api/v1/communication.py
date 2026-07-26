"""
Native FastAPI router for Communication - migrated from app/api/v1/communication.py.
The original was an unimplemented stub (all routes returned hardcoded
placeholder responses with TODO comments, no real logic or DB access).
This preserves that exact behavior - there was nothing functional to migrate.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.fastapi_permissions import require_permission

router = APIRouter()


def ok(data=None, message="Success"):
    return {"status": "success", "message": message, "data": data}


class CommunicationIn(BaseModel):
    class Config:
        extra = "allow"


@router.get("/")
def list_all(user_id: int = Depends(require_permission("communication.view"))):
    # TODO: call service
    return ok(data=[], message="communication list")


@router.get("/{id}")
def get_one(id: int, user_id: int = Depends(require_permission("communication.view"))):
    # TODO: call service
    return ok(data={}, message="communication detail")


@router.post("/")
def create(body: CommunicationIn, user_id: int = Depends(require_permission("communication.create"))):
    # TODO: validate with schema, call service
    return ok(data={}, message="communication created")


@router.put("/{id}")
def update(id: int, body: CommunicationIn, user_id: int = Depends(require_permission("communication.edit"))):
    # TODO: validate, call service
    return ok(data={}, message="communication updated")


@router.delete("/{id}")
def delete(id: int, user_id: int = Depends(require_permission("communication.delete"))):
    # TODO: call service
    return ok(message="communication deleted")
