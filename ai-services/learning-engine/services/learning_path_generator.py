"""Top-level orchestrator. Implements SDD §5.4 GenerateLearningPath
plus the §6.0 consistency contract that defers `missingSkills` to the
matching-engine for opportunity-driven requests.

CAL001..CAL004 — every requirement from the SDD §7 matrix surfaces here
via the modules this orchestrator wires together.

Stateless w.r.t. `LearningPath` — Node.js owns that collection. We
write to `skillgaplogs` (audit, per SDD §5.4 step 5) and read all other
state from Mongo via `services/profile_service.py`.
"""
from __future__ import annotations

import datetime as _dt
import logging
from typing import Any, Optional

from bson import ObjectId

from database.mongo_client import get_db
from models.db_models import (
    LearningPathDraft,
    OpportunitySummary,
    ProfileSummary,
    ResourceCandidate,
    SkillGap,
)
from services.ai_model_manager import ai_models
from services.explanation_generator import explain_pathway, explain_resource
from services.match_consumer import (
    fetch_match_breakdown,
    matchbreakdown_to_response,
)
from services.profile_service import fetch_opportunity, fetch_profile_by_user
from services.resource_aggregator import aggregate_resources
from services.skill_gap_analyser import (
    compute_skill_deficit,
    required_skills_from_opportunity,
    required_skills_from_target,
)

logger = logging.getLogger(__name__)


class LearningEngineError(Exception):
    """Raised with an error code matching the API contract."""

    def __init__(self, code: str, message: str, status: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


async def _log_skill_gap(
    user_id: str,
    profile: ProfileSummary,
    target_skill: str,
    missing_skills: list[str],
    consistency_mode: str,
    opportunity_id: Optional[str],
) -> Optional[str]:
    """SDD §5.4 step 5 — append to `skillgaplogs`. The Node.js layer
    doesn't own this collection; we write it for analytics + retraining.
    """
    if not missing_skills:
        return None
    db = get_db()
    doc = {
        "userId": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
        "profileId": ObjectId(profile.profile_id),
        "opportunityId": ObjectId(opportunity_id) if opportunity_id and ObjectId.is_valid(opportunity_id) else None,
        "targetSkill": target_skill,
        "missingSkills": missing_skills,
        "consistencyMode": consistency_mode,
        "createdAt": _dt.datetime.now(_dt.timezone.utc),
    }
    try:
        result = await db.skillgaplogs.insert_one(doc)
        return str(result.inserted_id)
    except Exception as exc:  # noqa: BLE001 — non-fatal
        logger.warning("skillgaplogs insert failed: %s", exc)
        return None


def _critical_gap_count(missing: list[str]) -> int:
    """A "critical" gap is any required skill the worker cannot point
    to — counting all missing skills is the right answer for the
    §6.2.4 dashboard's "X critical gaps" badge.
    """
    return len(missing)


def _analysis_summary(
    target_skill: str,
    missing: list[str],
    required_count: int,
) -> str:
    if not missing:
        return f"No missing skills detected for {target_skill or 'this opportunity'}."
    if required_count <= 0:
        return f"{len(missing)} skill gap(s) to bridge."
    return (
        f"{len(missing)} of {required_count} required skill(s) missing. "
        f"Bridge {missing[0]} to lift the breakdown card's overall match."
    )


async def generate_learning_path(request: dict[str, Any]) -> dict[str, Any]:
    """Main entry point. Raises LearningEngineError on validation /
    not-found failure. Always returns a populated `data.resources`
    array when no fatal error — even in the worst case the curated
    fallback ensures something is offered.
    """
    user_id = request.get("userId")
    target_skill = (request.get("targetSkill") or "").strip()
    opportunity_id = request.get("opportunityId") or None

    # ── SDD §5.4 Step 1 — validate input ──────────────────────────────
    if not user_id:
        raise LearningEngineError("INVALID_REQUEST", "userId is required", 422)
    if not target_skill and not opportunity_id:
        raise LearningEngineError(
            "INVALID_REQUEST",
            "Provide either targetSkill or opportunityId",
            422,
        )

    profile = await fetch_profile_by_user(user_id)
    if profile is None:
        raise LearningEngineError(
            "PROFILE_NOT_FOUND", f"no profile found for user {user_id}", 404
        )

    opportunity: Optional[OpportunitySummary] = None
    if opportunity_id:
        opportunity = await fetch_opportunity(opportunity_id)
        if opportunity is None:
            raise LearningEngineError(
                "OPPORTUNITY_NOT_FOUND",
                f"no opportunity found for {opportunity_id}",
                404,
            )

    # ── §6.0 Step 0 — call matching-engine first when opportunity-driven.
    #   Its missingSkills is authoritative. Failure → fallback to local.
    consistency_mode = "standalone"
    match_breakdown = None
    authoritative_missing: Optional[list[str]] = None
    if opportunity is not None:
        mb = await fetch_match_breakdown(profile.profile_id, opportunity.opportunity_id)
        if mb is not None:
            consistency_mode = "matching-engine"
            match_breakdown = matchbreakdown_to_response(mb)
            authoritative_missing = list(mb.missing_skills)
        else:
            consistency_mode = "fallback"

    # ── SDD §5.4 Step 2 — identify missing skills (CAL001 / CAL002) ───
    #   Always runs: enrichment fields (aliasHints, proficiencyShortfalls,
    #   bioInferredSkills) survive into the response even in
    #   matching-engine mode.
    if opportunity is not None:
        required = required_skills_from_opportunity(opportunity)
    else:
        required = required_skills_from_target(target_skill)
    deficit: SkillGap = await compute_skill_deficit(profile, required)

    if authoritative_missing is not None:
        missing_skills = authoritative_missing
    else:
        missing_skills = list(deficit.missing)

    # ── SDD §5.4 Step 3 — retrieve top-N learning resources per skill
    #   (CAL003 — prioritise free resources via aggregator scoring). ──
    semantic_model = ai_models.semantic_model
    resources: list[ResourceCandidate] = []
    for skill in missing_skills:
        per_skill = await aggregate_resources(skill, semantic_model)
        resources.extend(per_skill)

    # ── SDD §5.4 Step 4 — rank ────────────────────────────────────────
    #   Per-skill ranking and foundational-first ordering already happened
    #   inside aggregate_resources (see services/resource_aggregator/base.py).
    #   Concatenation here preserves the order of missing skills.

    # ── SDD §5.4 Step 5 — store skill gap log ─────────────────────────
    target_for_response = target_skill or (
        opportunity.title if opportunity is not None else "Multiple"
    )
    skill_gap_log_id = await _log_skill_gap(
        user_id=user_id,
        profile=profile,
        target_skill=target_for_response,
        missing_skills=missing_skills,
        consistency_mode=consistency_mode,
        opportunity_id=opportunity_id,
    )

    # ── §6.6 — per-resource + pathway rationales (always non-empty) ───
    enriched: list[dict[str, Any]] = []
    for resource in resources:
        bridges = resource.bridgesSkill or (missing_skills[0] if missing_skills else target_for_response)
        resource.bridgesSkill = bridges
        why = explain_resource(resource, bridges, profile, opportunity)
        item = resource.to_response_dict()
        item["whyThisCourse"] = why
        enriched.append(item)

    pathway_rationale = explain_pathway(
        deficit,
        resources,
        profile,
        opportunity,
        missing_skills_override=missing_skills,
    )

    # ── SDD §5.4 Step 6 — return the assembled pathway ────────────────
    return {
        "consistencyMode": consistency_mode,
        "targetSkill": target_for_response,
        "missingSkills": missing_skills,
        "criticalGapCount": _critical_gap_count(missing_skills),
        "matchBreakdown": match_breakdown,
        "aliasHints": deficit.aliasHints,
        "proficiencyShortfalls": deficit.proficiencyShortfalls,
        "bioInferredSkills": deficit.bioInferredSkills,
        "analysisSummary": _analysis_summary(
            target_for_response, missing_skills, len(required)
        ),
        "pathwayRationale": pathway_rationale,
        "resources": enriched,
        "skillGapLogId": skill_gap_log_id,
    }


async def analyse_skill_gaps(request: dict[str, Any]) -> dict[str, Any]:
    """Pure analysis path for `/api/learning/skill-gaps` — no resource
    fetch, no DB write. Same consistency contract as generate.
    """
    profile_id = request.get("profileId")
    opportunity_id = request.get("opportunityId")
    if not profile_id or not opportunity_id:
        raise LearningEngineError(
            "INVALID_REQUEST",
            "profileId and opportunityId are required",
            422,
        )

    from services.profile_service import fetch_profile_by_id

    profile = await fetch_profile_by_id(profile_id)
    if profile is None:
        raise LearningEngineError(
            "PROFILE_NOT_FOUND", f"no profile found for {profile_id}", 404
        )
    opportunity = await fetch_opportunity(opportunity_id)
    if opportunity is None:
        raise LearningEngineError(
            "OPPORTUNITY_NOT_FOUND",
            f"no opportunity found for {opportunity_id}",
            404,
        )

    mb = await fetch_match_breakdown(profile_id, opportunity_id)
    consistency_mode = "matching-engine" if mb is not None else "fallback"
    required = required_skills_from_opportunity(opportunity)
    deficit = await compute_skill_deficit(profile, required)
    if mb is not None:
        missing_skills = list(mb.missing_skills)
        match_breakdown = matchbreakdown_to_response(mb)
    else:
        missing_skills = list(deficit.missing)
        match_breakdown = None

    return {
        "consistencyMode": consistency_mode,
        "missingSkills": missing_skills,
        "matchBreakdown": match_breakdown,
        "proficiencyShortfalls": deficit.proficiencyShortfalls,
        "aliasHints": deficit.aliasHints,
        "bioInferredSkills": deficit.bioInferredSkills,
        "totalGapScore": deficit.totalGapScore,
    }
