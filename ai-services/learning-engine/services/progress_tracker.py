"""§3.2.5 Progress Tracker — CAL004.

Records `learningprogress` audit docs and upserts `profileskills` so
the worker's next match score reflects the new skill state.

This is the only place the learning engine writes to `profileskills`,
and it ONLY upserts skills the worker already implicitly bridged via a
completed resource. The bio-mining path (§6.7) deliberately does NOT
persist; that boundary is the user's consent gate.
"""
from __future__ import annotations

import datetime as _dt
import logging
import re
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId

from database.mongo_client import get_db
from services.matching_feedback import notify_profile_skill_change

logger = logging.getLogger(__name__)


def _safe_oid(value: str) -> Optional[ObjectId]:
    try:
        return value if isinstance(value, ObjectId) else ObjectId(value)
    except (InvalidId, TypeError):
        return None


async def _resolve_skill(skill_name: str) -> Optional[dict]:
    db = get_db()
    regex = re.compile(f"^{re.escape(skill_name)}$", re.IGNORECASE)
    return await db.skills.find_one({"skillName": regex})


async def mark_resource_completed(
    user_id: str,
    learning_path_id: Optional[str],
    resource_url: str,
    bridges_skill: Optional[str],
    is_completed: bool,
) -> dict:
    """Upserts the worker's ProfileSkill for the resource's bridgesSkill
    and writes a `learningprogress` audit doc. Returns a summary dict
    suitable for the API response.
    """
    db = get_db()
    uid = _safe_oid(user_id)
    if uid is None:
        return {"profileSkillsUpdated": 0, "learningProgressLogged": False}

    profile = await db.profiles.find_one({"userId": uid})
    pid = profile["_id"] if profile else None

    skills_updated = 0
    if is_completed and bridges_skill and pid is not None:
        skill_doc = await _resolve_skill(bridges_skill)
        if skill_doc is not None:
            existing = await db.profileskills.find_one(
                {"profileId": pid, "skillId": skill_doc["_id"]}
            )
            if existing is None:
                # Worker did not have this skill at all — register it at
                # `intermediate`, the level we assume a completed
                # tutorial brings them to. Match's recompute on the next
                # /score call will pick it up.
                await db.profileskills.insert_one(
                    {
                        "profileId": pid,
                        "skillId": skill_doc["_id"],
                        "proficiencyLevel": "intermediate",
                        "classification": "secondary",
                        "numberOfYears": 0,
                    }
                )
                skills_updated = 1
            await notify_profile_skill_change(
                user_id=user_id,
                skill_name=skill_doc["skillName"],
                upserted=skills_updated == 1,
            )

    progress_doc = {
        "userId": uid,
        "learningPathId": _safe_oid(learning_path_id) if learning_path_id else None,
        "resourceUrl": resource_url,
        "bridgesSkill": bridges_skill,
        "isCompleted": bool(is_completed),
        "occurredAt": _dt.datetime.now(_dt.timezone.utc),
    }
    try:
        await db.learningprogress.update_one(
            {"userId": uid, "resourceUrl": resource_url},
            {"$set": progress_doc},
            upsert=True,
        )
        progress_logged = True
    except Exception as exc:  # noqa: BLE001
        logger.warning("learningprogress upsert failed: %s", exc)
        progress_logged = False

    return {
        "profileSkillsUpdated": skills_updated,
        "learningProgressLogged": progress_logged,
    }
