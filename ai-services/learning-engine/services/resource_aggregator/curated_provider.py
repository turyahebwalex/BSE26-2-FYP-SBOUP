"""Curated offline catalog. Always available — used as last-resort
fallback when external providers return nothing.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from models.db_models import ResourceCandidate

logger = logging.getLogger(__name__)

_CATALOG_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "curated_resources.json"
_CATALOG: dict[str, list[dict]] | None = None


def _load_catalog() -> dict[str, list[dict]]:
    global _CATALOG
    if _CATALOG is not None:
        return _CATALOG
    try:
        with _CATALOG_PATH.open("r", encoding="utf-8") as fh:
            _CATALOG = json.load(fh)
    except Exception as exc:  # noqa: BLE001 — malformed file shouldn't crash startup
        logger.warning("curated catalog load failed (%s); using empty dict", exc)
        _CATALOG = {}
    return _CATALOG


def _to_candidate(skill: str, raw: dict) -> ResourceCandidate:
    cost = float(raw.get("cost", 0) or 0)
    return ResourceCandidate(
        title=str(raw.get("title", "")),
        url=str(raw.get("url", "")),
        provider=str(raw.get("provider", "Curated")),
        cost=cost,
        priceLabel="Free" if cost == 0 else f"${cost:g}",
        estimatedDuration=str(raw.get("estimatedDuration", "Varies")),
        type=str(raw.get("type", "course")),
        description=str(raw.get("description", "")),
        rating=float(raw["rating"]) if raw.get("rating") is not None else None,
        reviewCount=int(raw.get("reviewCount", 0) or 0),
        difficultyLevel=str(raw.get("difficultyLevel", "beginner")),
        bridgesSkill=skill,
    )


_STOPWORDS = {"a", "an", "the", "of", "and", "for", "in", "to", "with", "skills"}


def _tokenise(name: str) -> set[str]:
    """Lower-case word tokens, stop-words removed. 'React Native' → {react, native}."""
    return {t for t in name.lower().split() if t and t not in _STOPWORDS}


class CuratedProvider:
    name = "curated"

    async def fetch(self, skill: str) -> list[ResourceCandidate]:
        catalog = _load_catalog()
        if not catalog:
            return []

        # 1. Exact lookup, case-insensitive — catalog uses Title-Case keys
        #    but canonical Skill.skillName values don't always match exactly.
        lower_index = {k.lower(): k for k in catalog.keys()}
        key = lower_index.get(skill.lower())
        if key is not None:
            return [_to_candidate(skill, raw) for raw in catalog.get(key, [])]

        # 2. Token-overlap fallback so 'React native' finds 'React',
        #    'Digital marketing strategy' finds 'Digital Marketing', etc.
        #    Without this, a worker searching for a slightly-different
        #    phrasing than what's in the catalog gets zero resources.
        query_tokens = _tokenise(skill)
        if not query_tokens:
            return []
        best_key: str | None = None
        best_overlap = 0
        for cat_key in catalog.keys():
            cat_tokens = _tokenise(cat_key)
            overlap = len(query_tokens & cat_tokens)
            if overlap > best_overlap:
                best_key = cat_key
                best_overlap = overlap
        if best_key is None or best_overlap == 0:
            return []
        # Tag the returned resources with the *query* skill so downstream
        # bridgesSkill matches the worker's missing-skill list, not the
        # catalog's slightly-different key name.
        return [_to_candidate(skill, raw) for raw in catalog.get(best_key, [])]
