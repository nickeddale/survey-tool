import uuid
from datetime import datetime

from pydantic import BaseModel


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] | None = None
    expires_at: datetime | None = None


class ApiKeyCreateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    key: str  # full key — only returned on creation
    key_prefix: str
    scopes: list | None
    is_active: bool
    expires_at: datetime | None
    created_at: datetime


class ApiKeyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    key_prefix: str
    scopes: list | None
    is_active: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
