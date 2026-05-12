"""§6.5 Dashboard Fit — drives the §6.2.4 worker dashboard's "Close
Your Skill Gaps" section.

The matching-engine is authoritative per the §6.0 consistency contract.
We fetch its `/api/match/recommendations/{userId}` output, bucket by
`Opportunity.category`, and aggregate per-category fit. This guarantees
that when the worker drills into any opportunity in a category, the
per-opportunity Match Breakdown card shows the same `missingSkills`
the dashboard had — the two views derive from the same source.

Fallback path: if the matching-engine is unavailable, we compute the
dashboard fit locally using MiniLM cosine over category skill rosters
and flip `consistencyMode = "fallback"` so the client can warn the user.
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import Optional

from bson import ObjectId

from database.mongo_client import get_db
from models.db_models import CategoryFit, ProfileSummary
from services.ai_model_manager import ai_models
from services.match_consumer import fetch_recommendations
from services.profile_service import fetch_opportunities_by_ids

import config

logger = logging.getLogger(__name__)

MIN_FIT_SCORE = 0.3
# A rec must score at least this much (0-100) to count toward a
# category's average fitScore. Below this the match is too weak to
# meaningfully represent fit; keeping it would just dilute the mean.
BUCKET_REC_MIN_SCORE = 20.0


async def compute_category_fit(profile: ProfileSummary, user_id: str) -> tuple[list[CategoryFit], str]:
    """Returns (fitting_categories, consistency_mode).

    Tries the recommendations-driven path first. Falls back to the
    local MiniLM computation if the matching-engine is unavailable.
    """
    recs = await fetch_recommendations(user_id)
    if recs is not None:
        return await _from_recommendations(recs), "matching-engine"

    logger.warning(
        "matching-engine unavailable; falling back to local category fit for user %s",
        user_id,
    )
    return await _local_category_fit(profile), "fallback"


async def _from_recommendations(recommendations: list[dict]) -> list[CategoryFit]:
    if not recommendations:
        return []

    opp_ids = [str(r.get("opportunityId")) for r in recommendations if r.get("opportunityId")]
    opportunities = await fetch_opportunities_by_ids(opp_ids)

    # Pre-filter weak recs out of each bucket so the per-category mean
    # reflects only meaningful matches. Without this, a worker with one
    # 72% match and seven 12% matches in the same category averages
    # ~20% and the bucket falls below MIN_FIT_SCORE — the worker sees
    # nothing despite genuinely fitting the category once.
    buckets: dict[str, list[dict]] = defaultdict(list)
    for rec in recommendations:
        opp_id = str(rec.get("opportunityId") or "")
        opp_meta = opportunities.get(opp_id)
        if not opp_meta:
            continue
        if float(rec.get("matchScore") or 0) < BUCKET_REC_MIN_SCORE:
            continue
        buckets[opp_meta["category"]].append(rec)

    out: list[CategoryFit] = []
    for category, recs_in_cat in buckets.items():
        scores = [float(r.get("matchScore") or 0) for r in recs_in_cat]
        fit_score = (sum(scores) / len(scores)) / 100.0 if scores else 0.0
        if fit_score < MIN_FIT_SCORE:
            continue
        missing_counter: Counter[str] = Counter()
        for rec in recs_in_cat:
            for skill in rec.get("missingSkills") or []:
                missing_counter[skill] += 1
        ranked_missing = [name for name, _ in missing_counter.most_common()]
        out.append(
            CategoryFit(
                category=category,
                fitScore=round(fit_score, 3),
                matchingOpportunityCount=len(recs_in_cat),
                missingSkills=ranked_missing,
            )
        )
    out.sort(key=lambda c: c.fitScore, reverse=True)
    return out


async def _local_category_fit(profile: ProfileSummary) -> list[CategoryFit]:
    """Local fallback: bucket published opportunities by category, run
    MiniLM cosine over category skill rosters. Same contract as the
    happy path but uses the learning engine's own analyser.
    """
    db = get_db()
    pipeline = [
        {"$match": {"status": "published"}},
        {
            "$lookup": {
                "from": "skills",
                "localField": "requiredSkills",
                "foreignField": "_id",
                "as": "_skills",
            }
        },
        {
            "$project": {
                "category": 1,
                "title": 1,
                "skillNames": "$_skills.skillName",
            }
        },
    ]
    buckets: dict[str, list[set[str]]] = defaultdict(list)
    async for opp in db.opportunities.aggregate(pipeline):
        names = set(opp.get("skillNames") or [])
        if names:
            buckets[opp.get("category", "Other")].append(names)

    if not buckets:
        return []

    semantic_model = ai_models.semantic_model
    profile_skill_names = [s.name for s in profile.skill_state.declared]
    profile_lower = {n.lower() for n in profile_skill_names}
    profile_embeds = None
    if profile_skill_names and semantic_model is not None:
        try:
            profile_embeds = semantic_model.encode(
                profile_skill_names,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("local fit profile embedding failed: %s", exc)
            profile_embeds = None

    out: list[CategoryFit] = []
    for category, opp_skills_list in buckets.items():
        all_required = sorted({s for opp_set in opp_skills_list for s in opp_set})
        if not all_required:
            continue

        matches = 0
        missing: list[str] = []
        for req in all_required:
            if req.lower() in profile_lower:
                matches += 1
                continue
            if profile_embeds is not None and semantic_model is not None:
                try:
                    req_embed = semantic_model.encode(
                        [req],
                        normalize_embeddings=True,
                        convert_to_numpy=True,
                    )[0]
                    sim = float((profile_embeds @ req_embed).max())
                    if sim >= config.SEMANTIC_MATCH_THRESHOLD:
                        matches += 1
                        continue
                except Exception:  # noqa: BLE001
                    pass
            missing.append(req)

        fit_score = matches / len(all_required) if all_required else 0.0
        if fit_score < MIN_FIT_SCORE:
            continue

        # Frequency-rank the missing skills by how many opportunities
        # in the bucket required them — same rule as the happy path.
        missing_counter: Counter[str] = Counter()
        for opp_set in opp_skills_list:
            for s in opp_set:
                if s in missing:
                    missing_counter[s] += 1
        ranked_missing = [name for name, _ in missing_counter.most_common()]

        out.append(
            CategoryFit(
                category=category,
                fitScore=round(fit_score, 3),
                matchingOpportunityCount=len(opp_skills_list),
                missingSkills=ranked_missing,
            )
        )

    out.sort(key=lambda c: c.fitScore, reverse=True)
    return out
