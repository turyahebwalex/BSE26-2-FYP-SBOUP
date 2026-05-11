"""Resource aggregator package — fans out to providers, dedupes, scores,
and orders into a foundational-first pathway.

CAL003 — prioritise free resources via cost-score weighting in
`base.score_candidate`.
"""
from __future__ import annotations

import logging
from typing import Iterable

from models.db_models import ResourceCandidate
from services.resource_aggregator.base import (
    Provider,
    dedupe_by_url,
    order_pathway,
    rank_and_filter,
    score_candidate,
)
from services.resource_aggregator.coursera_provider import CourseraProvider
from services.resource_aggregator.curated_provider import CuratedProvider
from services.resource_aggregator.edx_provider import EdxProvider
from services.resource_aggregator.youtube_provider import YouTubeProvider
from services.skill_extractor import extract_resource_skill

logger = logging.getLogger(__name__)

# CAL002 — personalised paths: each provider feeds the same merge/score/order
# pipeline so the eventual sequence reflects ranking, not provider order.
DEFAULT_PROVIDERS: list[Provider] = [
    YouTubeProvider(),
    CourseraProvider(),
    EdxProvider(),
    CuratedProvider(),
]

TOP_N_PER_SKILL = 3


async def aggregate_resources(
    skill: str,
    semantic_model=None,
    providers: Iterable[Provider] | None = None,
) -> list[ResourceCandidate]:
    """Fetch, dedupe, score, order, and skill-tag resources for one skill.

    The result is the foundational-first ordered list of up to
    `TOP_N_PER_SKILL` resources for this skill.
    """
    use = list(providers if providers is not None else DEFAULT_PROVIDERS)
    candidates: list[ResourceCandidate] = []
    for provider in use:
        try:
            chunk = await provider.fetch(skill)
        except Exception as exc:  # noqa: BLE001 — never let one provider kill the request
            logger.warning("%s fetch failed for %r: %s", provider.name, skill, exc)
            continue
        for cand in chunk:
            if not cand.bridgesSkill:
                cand.bridgesSkill = skill
            candidates.append(cand)

    candidates = dedupe_by_url(candidates)
    if not candidates:
        return []
    candidates = rank_and_filter(candidates, skill, semantic_model)

    # NER-tag any resource still without a bridgesSkill — deferred until
    # after scoring/dedupe so we only run the model on resources we'll
    # actually keep.
    for cand in candidates[:TOP_N_PER_SKILL]:
        if not cand.bridgesSkill:
            inferred = await extract_resource_skill(cand)
            cand.bridgesSkill = inferred or skill

    return order_pathway(candidates)[:TOP_N_PER_SKILL]
