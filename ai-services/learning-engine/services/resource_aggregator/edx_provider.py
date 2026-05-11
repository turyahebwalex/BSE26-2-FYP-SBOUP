"""edX public catalog API provider. Same free-detection rule as Coursera."""
from __future__ import annotations

import logging
from typing import Any

import httpx

import config
from models.db_models import ResourceCandidate

logger = logging.getLogger(__name__)

_FREE_HINTS = ("audit", "free")


def _detect_free(description: str) -> bool:
    text = (description or "").lower()
    return any(hint in text for hint in _FREE_HINTS)


def _to_candidate(course: dict[str, Any], skill: str) -> ResourceCandidate:
    course_id = course.get("course_id") or course.get("id") or ""
    description = (
        course.get("short_description")
        or course.get("name", "")
        or ""
    )
    is_free = _detect_free(description)
    url = (
        course.get("course_url")
        or (f"https://www.edx.org/course/{course_id}" if course_id else "")
    )
    return ResourceCandidate(
        title=course.get("name", ""),
        url=url,
        provider="edX",
        cost=0.0 if is_free else None,  # type: ignore[arg-type]
        priceLabel="Free" if is_free else "Paid (audit may be free)",
        estimatedDuration=str(course.get("effort") or "Varies"),
        type="course",
        description=description,
        rating=None,
        reviewCount=0,
        difficultyLevel="intermediate",
        bridgesSkill="",
    )


class EdxProvider:
    name = "edx"

    async def fetch(self, skill: str) -> list[ResourceCandidate]:
        url = f"{config.EDX_BASE_URL}/courses/v1/courses/"
        params = {"search_term": skill, "page_size": 5}
        timeout = httpx.Timeout(config.PROVIDER_HTTP_TIMEOUT_SECONDS)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(url, params=params)
        except Exception as exc:  # noqa: BLE001
            logger.warning("edX request failed for %r: %s", skill, exc)
            return []

        if resp.status_code != 200:
            logger.warning("edX returned %s for %r", resp.status_code, skill)
            return []

        try:
            body = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("edX body decode failed: %s", exc)
            return []

        results = body.get("results") if isinstance(body, dict) else None
        if not isinstance(results, list):
            return []
        candidates = [_to_candidate(r, skill) for r in results]
        return [c for c in candidates if c.url]
