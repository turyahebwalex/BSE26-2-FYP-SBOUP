"""YouTube Data API v3 provider.

Behaviour rules (§6.4):
- If `YOUTUBE_API_KEY` is empty, this provider is disabled — `.fetch()`
  returns an empty list. Callers must treat absence as normal, not as
  an error.
- Quota / auth failures (HTTP 403 / 429) are logged and skipped for
  the current request; the next request retries automatically.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

import config
from models.db_models import ResourceCandidate

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.googleapis.com/youtube/v3/search"


def _to_candidate(item: dict[str, Any], skill: str) -> ResourceCandidate:
    snippet = item.get("snippet") or {}
    video_id = (item.get("id") or {}).get("videoId") or ""
    return ResourceCandidate(
        title=snippet.get("title", ""),
        url=f"https://www.youtube.com/watch?v={video_id}" if video_id else "",
        provider="YouTube",
        cost=0.0,
        priceLabel="Free",
        estimatedDuration="Varies",
        type="video",
        description=snippet.get("description", ""),
        rating=None,
        reviewCount=0,
        difficultyLevel="beginner",
        bridgesSkill=skill,
    )


class YouTubeProvider:
    name = "youtube"

    async def fetch(self, skill: str) -> list[ResourceCandidate]:
        api_key = config.YOUTUBE_API_KEY
        if not api_key:
            return []

        params = {
            "part": "snippet",
            "q": f"{skill} tutorial",
            "type": "video",
            "videoDuration": "long",
            "relevanceLanguage": "en",
            "maxResults": 5,
            "key": api_key,
        }
        timeout = httpx.Timeout(config.PROVIDER_HTTP_TIMEOUT_SECONDS)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(_BASE_URL, params=params)
        except Exception as exc:  # noqa: BLE001
            logger.warning("YouTube request failed for %r: %s", skill, exc)
            return []

        if resp.status_code in (403, 429):
            logger.warning(
                "YouTube quota / auth issue (status=%s) for %r; skipping provider",
                resp.status_code,
                skill,
            )
            return []
        if resp.status_code != 200:
            logger.warning(
                "YouTube returned %s for %r", resp.status_code, skill
            )
            return []

        try:
            body = resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("YouTube body decode failed: %s", exc)
            return []

        items = body.get("items") or []
        candidates = [_to_candidate(it, skill) for it in items]
        return [c for c in candidates if c.url]
