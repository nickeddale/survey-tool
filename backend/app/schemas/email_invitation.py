import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Optional


class EmailInvitationCreate(BaseModel):
    recipient_email: EmailStr = Field(description="Email address of the recipient.")
    recipient_name: str | None = Field(default=None, description="Optional display name of the recipient.")
    subject: str | None = Field(default=None, description="Email subject line. Defaults to a standard invitation subject if not provided.")
    invitation_type: str | None = Field(default="invite", description="Type of invitation: 'invite' or 'reminder'.")
    custom_message: str | None = Field(default=None, description="Optional custom message to include in the invitation email body.")


class EmailInvitationBatchCreate(BaseModel):
    items: list[EmailInvitationCreate]
    subject: str | None = Field(default=None, description="Optional custom subject to apply to all invitations in this batch.")


class EmailInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    survey_id: uuid.UUID
    participant_id: uuid.UUID | None
    recipient_email: str
    recipient_name: str | None
    subject: str
    status: str
    sent_at: datetime | None
    opened_at: datetime | None
    clicked_at: datetime | None
    error_message: str | None
    attempt_count: int
    reminder_count: int
    invitation_type: str
    created_at: datetime
    updated_at: datetime


class EmailInvitationListResponse(BaseModel):
    items: list[EmailInvitationResponse]
    total: int
    page: int
    per_page: int
    pages: int


class EmailInvitationUpdate(BaseModel):
    subject: str | None = None
    status: str | None = None


class SendRemindersRequest(BaseModel):
    days_since_invite: Optional[int] = Field(
        default=None,
        ge=1,
        description="Only remind participants whose original invite was sent at least this many days ago.",
    )
    max_reminders: Optional[int] = Field(
        default=None,
        ge=1,
        description="Skip participants who have already received this many or more reminders.",
    )


class SendRemindersResponse(BaseModel):
    sent: int
    skipped: int
    failed: int
