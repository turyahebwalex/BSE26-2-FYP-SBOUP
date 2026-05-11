"""Reads MongoDB and assembles the typed shapes consumed by every
downstream stage. All field names match the Mongoose schemas under
server/src/models/.
"""
from __future__ import annotations

from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId

from database.mongo_client import get_db
from models.db_models import (
    OpportunitySummary,
    ProfileSummary,
    SkillRef,
    WorkerSkillState,
)


def _safe_oid(value: str) -> Optional[ObjectId]:
    try:
        return value if isinstance(value, ObjectId) else ObjectId(value)
    except (InvalidId, TypeError):
        return None


async def fetch_profile_by_user(user_id: str) -> Optional[ProfileSummary]:
    """The Node.js call shape sends `userId`, but most queries need
    `profileId`. Resolve once here.
    """
    db = get_db()
    uid = _safe_oid(user_id)
    if uid is None:
        return None
    profile = await db.profiles.find_one({"userId": uid})
    if not profile:
        return None
    return await _hydrate(profile)


async def fetch_profile_by_id(profile_id: str) -> Optional[ProfileSummary]:
    db = get_db()
    pid = _safe_oid(profile_id)
    if pid is None:
        return None
    profile = await db.profiles.find_one({"_id": pid})
    if not profile:
        return None
    return await _hydrate(profile)


async def _hydrate(profile_doc: dict) -> ProfileSummary:
    db = get_db()
    pid = profile_doc["_id"]

    declared: list[SkillRef] = []
    cursor = db.profileskills.aggregate([
        {"$match": {"profileId": pid}},
        {
            "$lookup": {
                "from": "skills",
                "localField": "skillId",
                "foreignField": "_id",
                "as": "skill",
            }
        },
        {"$unwind": "$skill"},
    ])
    async for ps in cursor:
        sk = ps.get("skill") or {}
        declared.append(
            SkillRef(
                skill_id=str(sk.get("_id")),
                name=sk.get("skillName", ""),
                category=sk.get("category", "Other"),
                classification=ps.get("classification", "primary"),
                proficiency=ps.get("proficiencyLevel", "intermediate"),
            )
        )

    return ProfileSummary(
        profile_id=str(pid),
        user_id=str(profile_doc.get("userId", "")),
        title=profile_doc.get("title", "") or "",
        bio=profile_doc.get("bio", "") or "",
        location=profile_doc.get("location", "") or "",
        skill_state=WorkerSkillState(declared=declared),
    )


async def fetch_opportunity(opportunity_id: str) -> Optional[OpportunitySummary]:
    db = get_db()
    oid = _safe_oid(opportunity_id)
    if oid is None:
        return None
    pipeline_stages = [
        {"$match": {"_id": oid}},
        {
            "$lookup": {
                "from": "skills",
                "localField": "requiredSkills",
                "foreignField": "_id",
                "as": "_skills",
            }
        },
    ]
    cursor = db.opportunities.aggregate(pipeline_stages)
    async for opp in cursor:
        return OpportunitySummary(
            opportunity_id=str(opp["_id"]),
            title=opp.get("title", ""),
            description=opp.get("description", ""),
            category=opp.get("category", ""),
            experience_level=opp.get("experienceLevel", "any") or "any",
            required_skill_names=[
                s.get("skillName", "") for s in (opp.get("_skills") or [])
            ],
        )
    return None


async def fetch_opportunities_by_ids(opportunity_ids: list[str]) -> dict[str, dict]:
    """Batch read for dashboard-fit. Returns {idStr: {category, ...}}."""
    db = get_db()
    oids = [oid for oid in (_safe_oid(x) for x in opportunity_ids) if oid is not None]
    if not oids:
        return {}
    out: dict[str, dict] = {}
    async for opp in db.opportunities.find(
        {"_id": {"$in": oids}},
        {"category": 1, "title": 1},
    ):
        out[str(opp["_id"])] = {
            "category": opp.get("category", "Other"),
            "title": opp.get("title", ""),
        }
    return out
