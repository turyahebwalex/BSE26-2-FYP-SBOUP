"""Tests for services/progress_tracker.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from services import progress_tracker


def _build_db_mocks(profile_doc, skill_doc, existing_profileskill=None):
    """Construct a fake Mongo DB exposing only the methods we need."""
    profiles = MagicMock()
    profiles.find_one = AsyncMock(return_value=profile_doc)

    skills = MagicMock()
    skills.find_one = AsyncMock(return_value=skill_doc)

    profileskills = MagicMock()
    profileskills.find_one = AsyncMock(return_value=existing_profileskill)
    profileskills.insert_one = AsyncMock()

    learningprogress = MagicMock()
    learningprogress.update_one = AsyncMock()

    db = MagicMock()
    db.profiles = profiles
    db.skills = skills
    db.profileskills = profileskills
    db.learningprogress = learningprogress
    return db


@pytest.mark.asyncio
async def test_completion_inserts_new_profileskill(monkeypatch):
    user_id = "507f1f77bcf86cd799439011"
    profile_doc = {"_id": ObjectId(), "userId": ObjectId(user_id)}
    skill_doc = {"_id": ObjectId(), "skillName": "Pandas"}
    db = _build_db_mocks(profile_doc, skill_doc, existing_profileskill=None)
    monkeypatch.setattr(progress_tracker, "get_db", lambda: db)

    notify = AsyncMock()
    monkeypatch.setattr(progress_tracker, "notify_profile_skill_change", notify)

    result = await progress_tracker.mark_resource_completed(
        user_id=user_id,
        learning_path_id=None,
        resource_url="https://x/lesson",
        bridges_skill="Pandas",
        is_completed=True,
    )
    assert result["profileSkillsUpdated"] == 1
    assert result["learningProgressLogged"] is True
    db.profileskills.insert_one.assert_awaited_once()
    db.learningprogress.update_one.assert_awaited_once()
    notify.assert_awaited_once()


@pytest.mark.asyncio
async def test_completion_idempotent_when_profileskill_exists(monkeypatch):
    user_id = "507f1f77bcf86cd799439011"
    profile_doc = {"_id": ObjectId(), "userId": ObjectId(user_id)}
    skill_doc = {"_id": ObjectId(), "skillName": "Pandas"}
    existing = {"_id": ObjectId(), "skillId": skill_doc["_id"]}
    db = _build_db_mocks(profile_doc, skill_doc, existing_profileskill=existing)
    monkeypatch.setattr(progress_tracker, "get_db", lambda: db)
    monkeypatch.setattr(
        progress_tracker, "notify_profile_skill_change", AsyncMock()
    )

    result = await progress_tracker.mark_resource_completed(
        user_id=user_id,
        learning_path_id=None,
        resource_url="https://x/lesson",
        bridges_skill="Pandas",
        is_completed=True,
    )
    assert result["profileSkillsUpdated"] == 0
    db.profileskills.insert_one.assert_not_awaited()


@pytest.mark.asyncio
async def test_unresolvable_skill_is_silently_skipped(monkeypatch):
    user_id = "507f1f77bcf86cd799439011"
    profile_doc = {"_id": ObjectId(), "userId": ObjectId(user_id)}
    db = _build_db_mocks(profile_doc, skill_doc=None)
    monkeypatch.setattr(progress_tracker, "get_db", lambda: db)
    monkeypatch.setattr(
        progress_tracker, "notify_profile_skill_change", AsyncMock()
    )

    result = await progress_tracker.mark_resource_completed(
        user_id=user_id,
        learning_path_id=None,
        resource_url="https://x/lesson",
        bridges_skill="UnknownSkill",
        is_completed=True,
    )
    assert result["profileSkillsUpdated"] == 0
    assert result["learningProgressLogged"] is True


@pytest.mark.asyncio
async def test_invalid_user_id_returns_zero(monkeypatch):
    db = _build_db_mocks({"_id": ObjectId(), "userId": ObjectId()}, None)
    monkeypatch.setattr(progress_tracker, "get_db", lambda: db)
    result = await progress_tracker.mark_resource_completed(
        user_id="not-an-objectid",
        learning_path_id=None,
        resource_url="https://x",
        bridges_skill="Pandas",
        is_completed=True,
    )
    assert result["profileSkillsUpdated"] == 0
    assert result["learningProgressLogged"] is False
