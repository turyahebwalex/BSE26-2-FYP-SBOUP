"""Reads MongoDB and assembles the ProfileAggregate consumed by every
downstream stage. All field names match the Mongoose schemas under
server/src/models/.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from bson import ObjectId

from database.mongo_client import get_db
from models.db_models import (
    EducationRef,
    ExperienceRef,
    OpportunityRef,
    PortfolioItem,
    PreferenceRef,
    ProfileAggregate,
    SkillRef,
    UserRef,
)


def _oid(value: str) -> ObjectId:
    return value if isinstance(value, ObjectId) else ObjectId(value)


def _parse_dt(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    return None


async def fetch_profile_aggregate(profile_id: str) -> Optional[ProfileAggregate]:
    db = get_db()
    pid = _oid(profile_id)

    profile = await db.profiles.find_one({"_id": pid})
    if not profile:
        return None

    user_doc = await db.users.find_one({"_id": profile["userId"]}) or {}
    user = UserRef(
        user_id=str(profile["userId"]),
        full_name=user_doc.get("fullName", ""),
        email=user_doc.get("email", ""),
        phone=user_doc.get("phoneNumber", ""),
    )

    # ProfileSkill joined with Skill catalog
    skills: list[SkillRef] = []
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
        skills.append(
            SkillRef(
                skill_id=str(sk.get("_id")),
                name=sk.get("skillName", ""),
                category=sk.get("category", "Other"),
                classification=ps.get("classification", "secondary"),
                proficiency=ps.get("proficiencyLevel", "intermediate"),
            )
        )

    experiences: list[ExperienceRef] = []
    async for exp in db.experiences.find({"profileId": pid}).sort("startDate", -1):
        experiences.append(
            ExperienceRef(
                experience_id=str(exp["_id"]),
                job_title=exp.get("jobTitle", ""),
                company=exp.get("companyName", ""),
                category=exp.get("category", ""),
                start_date=_parse_dt(exp.get("startDate")),
                end_date=_parse_dt(exp.get("endDate")),
                duration_months=int(exp.get("durationMonths") or 0),
                description=exp.get("description", ""),
            )
        )

    education: list[EducationRef] = []
    async for edu in db.educations.find({"profileId": pid}).sort("startYear", -1):
        education.append(
            EducationRef(
                education_id=str(edu["_id"]),
                institution=edu.get("institution", ""),
                qualification=edu.get("qualification", ""),
                field_of_study=edu.get("fieldOfStudy", ""),
                start_year=edu.get("startYear"),
                end_year=edu.get("endYear"),
            )
        )

    pref_doc = await db.preferences.find_one({"profileId": pid}) or {}
    preference = PreferenceRef(
        work_style=pref_doc.get("workStyle", ""),
        remote_preference=pref_doc.get("remotePreference", ""),
        learning_willingness=pref_doc.get("learningWillingness", ""),
        personality_traits=pref_doc.get("personalityTraits", []) or [],
    )

    portfolio = [
        PortfolioItem(
            title=item.get("title", ""),
            description=item.get("description", ""),
            file_url=item.get("fileUrl", ""),
            file_type=item.get("fileType", ""),
        )
        for item in (profile.get("portfolioItems") or [])
    ]

    return ProfileAggregate(
        profile_id=str(profile["_id"]),
        user=user,
        title=profile.get("title", ""),
        bio=profile.get("bio", "") or "",
        location=profile.get("location", "") or "",
        portfolio=portfolio,
        skills=skills,
        experiences=experiences,
        education=education,
        preference=preference,
    )


async def fetch_opportunity(opportunity_id: str) -> Optional[OpportunityRef]:
    """Used by the tailored flow. Resolves required-skill ObjectIds back
    to skillName strings via a single $lookup.
    """
    db = get_db()
    oid = _oid(opportunity_id)
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
        return OpportunityRef(
            opportunity_id=str(opp["_id"]),
            title=opp.get("title", ""),
            description=opp.get("description", ""),
            required_skill_names=[
                s.get("skillName", "") for s in (opp.get("_skills") or [])
            ],
        )
    return None
