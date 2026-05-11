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


class CuratedProvider:
    name = "curated"

    async def fetch(self, skill: str) -> list[ResourceCandidate]:
        catalog = _load_catalog()
        # Case-insensitive lookup: catalog uses Title-Case keys but the
        # canonical Skill.skillName values may not always match exactly.
        lower_index = {k.lower(): k for k in catalog.keys()}
        key = lower_index.get(skill.lower())
        if key is None:
            return []
        return [_to_candidate(skill, raw) for raw in catalog.get(key, [])]
