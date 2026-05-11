"""§3.2.5 Skill Gap Analyser — CAL001.

Two-stage match: exact lowercase first (cheap, deterministic), then
MiniLM cosine fallback (catches synonyms / regional variants /
granularity drift). Only when both fail is a required skill declared
missing.

Why a threshold of 0.75: MiniLM all-MiniLM-L6-v2 places truly synonymous
short skill phrases (bricklaying ↔ masonry, joiner ↔ carpenter,
web designer ↔ UI designer) at ≈0.78–0.92 cosine; related-but-distinct
skills (Python ↔ JavaScript, plumbing ↔ electrical) at ≈0.55–0.70;
unrelated skills below ≈0.40. 0.75 sits cleanly in the synonym band.
Make it retunable via SEMANTIC_MATCH_THRESHOLD.

Two distinct roles:
- Opportunity-driven mode (an `opportunityId` is in scope upstream): the
  matching-engine is authoritative for `missingSkills`. The analyser's
  job is enrichment only — produce `aliasHints` and
  `proficiencyShortfalls`. The orchestrator discards the analyser's
  local `missing` output in this mode.
- Target-skill mode (only `targetSkill`, no opportunity): no external
  ground truth. The analyser's two-stage match is the source of truth.
"""
from __future__ import annotations

import logging
from typing import Optional

from models.db_models import (
    OpportunitySummary,
    ProfileSummary,
    RequiredSkill,
    SkillGap,
    SkillRef,
)
from services.ai_model_manager import ai_models
from services.skill_extractor import extract_from_bio

import config

logger = logging.getLogger(__name__)

PROFICIENCY_RANK = {"beginner": 1, "intermediate": 2, "advanced": 3, "expert": 4}

# Map opportunity.experienceLevel → required proficiency. Opportunity
# documents only carry skill IDs, not per-skill levels, so we infer one
# uniform level from the role's experience tier.
EXP_LEVEL_TO_PROFICIENCY = {
    "entry": "intermediate",
    "mid": "advanced",
    "senior": "expert",
    "any": "intermediate",
}


def required_skills_from_opportunity(opp: OpportunitySummary) -> list[RequiredSkill]:
    level = EXP_LEVEL_TO_PROFICIENCY.get(opp.experience_level, "intermediate")
    return [RequiredSkill(name=name, requiredLevel=level) for name in opp.required_skill_names]


def required_skills_from_target(target: str) -> list[RequiredSkill]:
    return [RequiredSkill(name=target, requiredLevel="intermediate")]


async def compute_skill_deficit(
    profile: ProfileSummary,
    required: list[RequiredSkill],
) -> SkillGap:
    """Returns the full SkillGap for one (profile, required-set).

    Mutates the profile's effective skill set to include bio-mined
    skills (request-scoped, never persisted — see §6.7 constraint).
    """
    # Augment profile with NER-mined bio skills before any matching runs.
    if not profile.skill_state.bio_inferred:
        profile.skill_state.bio_inferred = await extract_from_bio(profile)

    effective = profile.skill_state.all
    bio_inferred_names = [s.name for s in profile.skill_state.bio_inferred]

    if not required:
        return SkillGap(
            missing=[],
            bioInferredSkills=bio_inferred_names,
            totalGapScore=0.0,
        )

    profile_index = {s.name.lower(): s for s in effective}
    missing: list[str] = []
    shortfalls: list[dict[str, str]] = []
    alias_hints: list[dict[str, object]] = []

    semantic_model = ai_models.semantic_model
    profile_names = [s.name for s in effective]
    profile_embeds = None
    if profile_names and semantic_model is not None:
        try:
            profile_embeds = semantic_model.encode(
                profile_names,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("profile embedding failed: %s", exc)
            profile_embeds = None

    for req in required:
        held: Optional[SkillRef] = profile_index.get(req.name.lower())

        # Step 1.5 — semantic fallback when no exact match.
        if held is None and profile_embeds is not None and semantic_model is not None:
            try:
                req_embed = semantic_model.encode(
                    [req.name],
                    normalize_embeddings=True,
                    convert_to_numpy=True,
                )[0]
                # Both vectors normalised → dot product is cosine.
                sims = profile_embeds @ req_embed
                best_idx = int(sims.argmax())
                best_score = float(sims[best_idx])
                if best_score >= config.SEMANTIC_MATCH_THRESHOLD:
                    held = effective[best_idx]
                    alias_hints.append(
                        {
                            "missingSkill": req.name,
                            "youMayAlreadyHave": held.name,
                            "similarity": round(best_score, 3),
                            "suggestion": (
                                f"Add '{req.name}' to your skills profile to update your match score."
                            ),
                        }
                    )
            except Exception as exc:  # noqa: BLE001
                logger.warning("semantic match for %r failed: %s", req.name, exc)

        if held is None:
            missing.append(req.name)
            continue

        required_level = req.requiredLevel or "intermediate"
        if PROFICIENCY_RANK.get(held.proficiency, 2) < PROFICIENCY_RANK.get(required_level, 2):
            shortfalls.append(
                {
                    "skill": req.name,
                    "current": held.proficiency,
                    "required": required_level,
                }
            )

    total_gap = (len(missing) + 0.5 * len(shortfalls)) / max(1, len(required))
    return SkillGap(
        missing=missing,
        proficiencyShortfalls=shortfalls,
        aliasHints=alias_hints,
        bioInferredSkills=bio_inferred_names,
        totalGapScore=round(total_gap, 3),
    )
