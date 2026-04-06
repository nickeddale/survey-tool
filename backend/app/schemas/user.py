import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr = Field(description="User's email address. Must be unique.", example="alice@example.com")
    password: str = Field(min_length=8, description="Account password (minimum 8 characters).", example="s3cr3tP@ss")
    name: str | None = Field(default=None, description="Optional display name for the user.", example="Alice Smith")

    @field_validator("email")
    @classmethod
    def email_must_be_lowercase(cls, v: str) -> str:
        return v.lower()


class UserResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: str
    name: str | None
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr = Field(description="Registered email address.", example="alice@example.com")
    password: str = Field(description="Account password.", example="s3cr3tP@ss")

    @field_validator("email")
    @classmethod
    def email_must_be_lowercase(cls, v: str) -> str:
        return v.lower()


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserUpdateRequest(BaseModel):
    name: str | None = None
    password: str | None = Field(default=None, min_length=8)
