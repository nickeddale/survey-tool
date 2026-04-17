"""Service layer for participant profile management."""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.participant import Participant
from app.models.participant_profile import ParticipantProfile
from app.schemas.participant_profile import (
    ParticipantProfileCreate,
    ParticipantProfileUpdate,
    SurveyParticipationSummary,
)
from app.utils.errors import ConflictError, NotFoundError


async def create_profile(
    session: AsyncSession,
    payload: ParticipantProfileCreate,
) -> ParticipantProfile:
    """Create a new participant profile. Raises ConflictError on duplicate email."""
    profile = ParticipantProfile(
        id=uuid.uuid4(),
        email=payload.email.strip().lower(),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        organization=payload.organization,
        attributes=payload.attributes,
        tags=payload.tags,
    )
    session.add(profile)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError("A profile with this email already exists")
    await session.refresh(profile)
    return profile


async def batch_create_profiles(
    session: AsyncSession,
    items: list[ParticipantProfileCreate],
) -> list[ParticipantProfile]:
    """Batch-create profiles. Raises ConflictError if any email is already taken."""
    profiles = []
    for item in items:
        profile = ParticipantProfile(
            id=uuid.uuid4(),
            email=item.email.strip().lower(),
            first_name=item.first_name,
            last_name=item.last_name,
            phone=item.phone,
            organization=item.organization,
            attributes=item.attributes,
            tags=item.tags,
        )
        session.add(profile)
        profiles.append(profile)

    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError("One or more profiles have a duplicate email address")

    for p in profiles:
        await session.refresh(p)
    return profiles


async def list_profiles(
    session: AsyncSession,
    page: int = 1,
    per_page: int = 20,
    email: str | None = None,
    name: str | None = None,
    tag: str | None = None,
    organization: str | None = None,
) -> tuple[list[ParticipantProfile], int]:
    """List profiles with optional filters. Returns (items, total)."""
    conditions: list[Any] = []

    if email:
        conditions.append(ParticipantProfile.email.ilike(f"%{email}%"))

    if name:
        name_filter = or_(
            ParticipantProfile.first_name.ilike(f"%{name}%"),
            ParticipantProfile.last_name.ilike(f"%{name}%"),
        )
        conditions.append(name_filter)

    if organization:
        conditions.append(ParticipantProfile.organization.ilike(f"%{organization}%"))

    if tag:
        # PostgreSQL ARRAY contains operator: tags @> ARRAY[tag]
        conditions.append(ParticipantProfile.tags.contains([tag]))

    where_clause = and_(*conditions) if conditions else True

    count_result = await session.execute(
        select(func.count()).select_from(ParticipantProfile).where(where_clause)
    )
    total = count_result.scalar_one()

    offset = (page - 1) * per_page
    items_result = await session.execute(
        select(ParticipantProfile)
        .where(where_clause)
        .order_by(ParticipantProfile.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(items_result.scalars().all())
    return items, total


async def get_profile(
    session: AsyncSession,
    profile_id: uuid.UUID,
) -> ParticipantProfile:
    """Get a profile by ID. Raises NotFoundError if not found."""
    result = await session.execute(
        select(ParticipantProfile).where(ParticipantProfile.id == profile_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("Participant profile not found")
    return profile


async def get_profile_with_history(
    session: AsyncSession,
    profile_id: uuid.UUID,
) -> tuple[ParticipantProfile, list[SurveyParticipationSummary]]:
    """Get a profile plus its per-survey participation history."""
    profile = await get_profile(session, profile_id)

    parts_result = await session.execute(
        select(Participant)
        .where(Participant.profile_id == profile_id)
        .order_by(Participant.created_at.desc())
    )
    participants = list(parts_result.scalars().all())

    history = [
        SurveyParticipationSummary(
            survey_id=p.survey_id,
            participant_id=p.id,
            completed=p.completed,
            created_at=p.created_at,
        )
        for p in participants
    ]
    return profile, history


async def update_profile(
    session: AsyncSession,
    profile_id: uuid.UUID,
    payload: ParticipantProfileUpdate,
) -> ParticipantProfile:
    """Partially update a profile. Raises NotFoundError or ConflictError."""
    profile = await get_profile(session, profile_id)

    update_fields = payload.model_dump(exclude_unset=True)
    if "email" in update_fields and update_fields["email"] is not None:
        update_fields["email"] = update_fields["email"].strip().lower()
    for field, value in update_fields.items():
        setattr(profile, field, value)

    profile.updated_at = datetime.now(timezone.utc)

    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError("A profile with this email already exists")
    await session.refresh(profile)
    return profile


async def delete_profile(
    session: AsyncSession,
    profile_id: uuid.UUID,
) -> None:
    """Delete a profile. Linked participants have their profile_id set to NULL (ON DELETE SET NULL)."""
    profile = await get_profile(session, profile_id)
    await session.delete(profile)
    await session.flush()


async def get_or_create_profile_by_email(
    session: AsyncSession,
    email: str,
) -> ParticipantProfile:
    """Get an existing profile by email or create a new one (used for auto-population)."""
    normalized = email.strip().lower()
    result = await session.execute(
        select(ParticipantProfile).where(ParticipantProfile.email == normalized)
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        return profile

    profile = ParticipantProfile(
        id=uuid.uuid4(),
        email=normalized,
    )
    session.add(profile)
    try:
        await session.flush()
    except IntegrityError:
        # Another concurrent request created the profile — fetch it
        await session.rollback()
        result2 = await session.execute(
            select(ParticipantProfile).where(ParticipantProfile.email == normalized)
        )
        profile = result2.scalar_one_or_none()
        if profile is None:
            raise ConflictError("Failed to create or retrieve profile for email")
    await session.refresh(profile)
    return profile
