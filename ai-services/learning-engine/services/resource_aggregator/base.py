"""Provider Protocol, dedupe, scoring math, and pathway ordering.

Scoring math (per §6.2):

    relevanceScore  ∈ [0,1] — MiniLM cosine(query, title+description),
                              keyword-overlap fallback when no model.
    qualityScore    ∈ [0,1] — normalised(rating/5) * sqrt(1 + log10(1+reviews))
                              capped at 1.
    costScore       ∈ {1.0 if free else 0.4} — strong free preference (CAL003).
    difficultyScore ∈ [0,1] — beginner=1.0, intermediate=0.7, advanced=0.4.

    finalScore = 0.5 * relevance + 0.2 * quality + 0.2 * cost + 0.1 * difficulty

This is consistent with SDD §5.4 step 4 (`0.7 × relevance + 0.3 ×
difficulty`) but extended to honour SDD §3.2.5's "filter by relevance,
cost, learner ratings, completion rates" — quality and cost get explicit
weight here so a free 4.7-rated beginner resource for the right skill
beats a paid advanced one even when both score highly on relevance.
"""
from __future__ import annotations

import math
from typing import Iterable, Protocol, runtime_checkable

from models.db_models import ResourceCandidate


@runtime_checkable
class Provider(Protocol):
    name: str

    async def fetch(self, skill: str) -> list[ResourceCandidate]: ...


_DIFFICULTY_SCORE = {
    "beginner": 1.0,
    "intermediate": 0.7,
    "advanced": 0.4,
}


def _keyword_overlap(query: str, doc: str) -> float:
    qs = {w.lower() for w in query.split() if len(w) > 2}
    ds = {w.lower() for w in doc.split() if len(w) > 2}
    if not qs:
        return 0.0
    return len(qs & ds) / len(qs)


def _semantic_relevance(query: str, doc: str, model) -> float:
    if model is None:
        return _keyword_overlap(query, doc)
    try:
        embeds = model.encode([query, doc], normalize_embeddings=True, convert_to_numpy=True)
        return float((embeds[0] * embeds[1]).sum())
    except Exception:  # noqa: BLE001 — fall back silently
        return _keyword_overlap(query, doc)


def score_candidate(c: ResourceCandidate, skill: str, semantic_model=None) -> ResourceCandidate:
    query = f"{skill} tutorial"
    doc = f"{c.title}. {c.description}".strip()
    c.relevanceScore = max(0.0, min(1.0, _semantic_relevance(query, doc, semantic_model)))

    rating = c.rating if c.rating is not None else 3.5
    rating_norm = max(0.0, min(1.0, rating / 5.0))
    review_factor = math.sqrt(1.0 + math.log10(1.0 + max(0, c.reviewCount)))
    # Cap at 1.0 — review_factor is unbounded above and would dominate.
    c.qualityScore = max(0.0, min(1.0, rating_norm * (review_factor / 2.5)))

    c.costScore = 1.0 if (c.cost is not None and c.cost == 0) else 0.4
    c.difficultyScore = _DIFFICULTY_SCORE.get(c.difficultyLevel, 0.7)

    c.finalScore = (
        0.5 * c.relevanceScore
        + 0.2 * c.qualityScore
        + 0.2 * c.costScore
        + 0.1 * c.difficultyScore
    )
    return c


def dedupe_by_url(candidates: Iterable[ResourceCandidate]) -> list[ResourceCandidate]:
    seen: set[str] = set()
    out: list[ResourceCandidate] = []
    for c in candidates:
        if not c.url:
            continue
        key = c.url.split("?", 1)[0].rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def rank_and_filter(
    candidates: list[ResourceCandidate],
    skill: str,
    semantic_model=None,
    min_relevance: float = 0.05,
) -> list[ResourceCandidate]:
    """Score every candidate, drop the ones with implausibly low
    relevance (curated fallback bypasses this floor), and sort by
    finalScore desc.
    """
    scored = [score_candidate(c, skill, semantic_model) for c in candidates]
    # Curated entries always survive the floor — they're our last-ditch
    # fallback and we'd rather show a slightly off-topic curated tutorial
    # than nothing at all.
    kept = [
        c for c in scored
        if c.provider.lower() == "curated" or c.relevanceScore >= min_relevance
    ]
    if not kept:
        kept = scored
    kept.sort(key=lambda c: c.finalScore, reverse=True)
    return kept


def order_pathway(candidates: list[ResourceCandidate]) -> list[ResourceCandidate]:
    """Foundational → advanced ordering within a single skill bucket
    (per SDD §3.2.5 / §6.3): sort by (difficultyScore desc, finalScore desc).
    """
    return sorted(
        candidates,
        key=lambda c: (c.difficultyScore, c.finalScore),
        reverse=True,
    )
