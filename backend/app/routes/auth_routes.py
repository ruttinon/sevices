from pydantic import BaseModel
from fastapi import APIRouter

from ..utils.auth import build_mock_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    role: str


@router.get("/roles")
def read_roles():
    return {
        "roles": [
            {"id": "admin", "label": "Admin"},
            {"id": "engineer", "label": "Engineer"},
            {"id": "customer", "label": "Customer"},
        ]
    }


@router.post("/login")
def mock_login(payload: LoginRequest):
    return {
        "access_token": build_mock_token(payload.role, payload.username),
        "token_type": "bearer",
        "role": payload.role,
        "username": payload.username,
    }
