"""Coursera public catalog API provider.

Free-detection rule (§6.4): Coursera courses are paid by default; we
only mark `cost=0` when the course description / landing-page
explicitly mentions financial aid or audit availability. Otherwise
`cost=null` and `priceLabel="Paid (audit may be free)"` — we never
invent prices.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

import config
from models.db_models import ResourceCandidate

logger = logging.getLogger(__name__)

_FREE_HINTS = ("financial aid", "audit", "free")


def _detect_free(description: str) -> bool:
    text = (description or "").lower()
    return any(hint in text for hint in _FREE_HINTS)


def _to_candidate(course: dict[str, Any], skill: str) -> ResourceCandidate:
    slug = course.get("slug", "")
    description = course.get("description") or course.get("name", "") or ""
    is_free = _detect_free(description)
    return ResourceCandidate(
        title=course.get("name", ""),
        url=f"https://www.coursera.org/learn/{slug}" if slug else "",
        provider="Coursera",
        cost=0.0 if is_free else None,  # type: ignore[arg-type]
        priceLabel="Free" if is_free else "Paid (audit may be free)",
        estimatedDuration=course.get("workload", "Varies"),
        type="course",
        description=description,
        rating=None,
        reviewCount=0,
        difficultyLevel="intermediate",
        bridgesSkill=skill,
    )


class CourseraProvider:
    name = "coursera"

    async def fetch(self, skill: str) -> list[ResourceCandidate]:
        url = f"{config.COURSERA_BASE_URL}/courses.v1"
        params = {
            "q": "search",
            "query": skill,
            "limit": 5,
            "fields": "name,slug,workload,partnerIds,photoUrl,description",
        }
        timeout = httpx.Timeout(config.PROVIDER_HTTP_TIMEOUT_SECONDS)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url, params=params)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Coursera request failed for %r: %s", skill, exc)
            return []

        if resp.status_code != 200:
            logger.warning(
                "Coursera returned %s for %r", resp.status_code, skill
            )
            return []

        try:
            body = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Coursera body decode failed: %s", exc)
            return []

        elements = body.get("elements") or []
        candidates = [_to_candidate(e, skill) for e in elements]
        return [c for c in candidates if c.url]
