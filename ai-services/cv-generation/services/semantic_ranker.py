"""Semantic ranking (Model 1 — sentence-transformers MiniLM).

Encodes the opportunity context and each Experience description into
sentence embeddings, then sorts experiences by descending cosine similarity.
Skills are sorted by an opportunity-aware rule independent of embeddings
(matched first → primary > secondary → original order).
"""
from __future__ import annotations

import logging
from typing import Iterable

from models.db_models import ExperienceRef, OpportunityRef, SkillRef
from services.ai_model_manager import ai_models

logger = logging.getLogger(__name__)


def _encode(texts: Iterable[str]):
    model = ai_models.semantic_model
    if model is None:
        return None
    return model.encode(list(texts), convert_to_numpy=True, normalize_embeddings=True)


def _cosine(a, b) -> float:
    # Both vectors normalised → dot product is cosine.
    return float((a * b).sum())


def rank_experiences(
    experiences: list[ExperienceRef],
    opportunity: OpportunityRef,
    opportunity_keywords: list[str],
) -> list[ExperienceRef]:
    """Returns a copy of experiences sorted by descending semantic
    similarity to the opportunity. If embedding fails, returns the
    input order (newest first by date — already pre-sorted upstream).
    """
    if not experiences:
        return []

    query_text = ". ".join(
        filter(
            None,
            [
                opportunity.title,
                opportunity.description,
                ", ".join(opportunity_keywords[:5]) if opportunity_keywords else "",
            ],
        )
    )
    docs = [e.description or e.job_title for e in experiences]

    try:
        embeds = _encode([query_text, *docs])
        if embeds is None or len(embeds) < 2:
            return experiences
        query_vec = embeds[0]
        scored = [
            (idx, _cosine(query_vec, embeds[1 + idx]))
            for idx in range(len(experiences))
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [experiences[idx] for idx, _ in scored]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Experience ranking failed: %s", exc)
        return experiences


def rank_skills(
    skills: list[SkillRef],
    opportunity: OpportunityRef | None,
) -> tuple[list[SkillRef], set[str]]:
    """Sorts ProfileSkills as: required-by-opportunity first, primary
    above secondary, then original order. Returns (ordered_skills,
    set of matched skill_ids).
    """
    if not skills:
        return [], set()

    if opportunity is None:
        primary = [s for s in skills if s.classification == "primary"]
        secondary = [s for s in skills if s.classification != "primary"]
        return primary + secondary, set()

    required_lower = {n.lower() for n in opportunity.required_skill_names}
    matched_ids: set[str] = set()

    def bucket(s: SkillRef) -> int:
        is_match = s.name.lower() in required_lower
        if is_match:
            matched_ids.add(s.skill_id)
        if is_match and s.classification == "primary":
            return 0
        if is_match:
            return 1
        if s.classification == "primary":
            return 2
        return 3

    ordered = sorted(skills, key=bucket)
    return ordered, matched_ids
