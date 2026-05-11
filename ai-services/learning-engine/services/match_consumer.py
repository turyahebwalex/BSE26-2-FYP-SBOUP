"""Talks to the matching-engine — the source of truth for `missingSkills`
on opportunity-driven requests (see §6.0 consistency contract).

Single helper: `fetch_match_breakdown(profile_id, opportunity_id) -> MatchBreakdown | None`.

Failure semantics: any exception (timeout, network, 5xx, malformed
response) returns None. The caller interprets None as "fall through to
local analyser and flip `consistencyMode = 'fallback'`". Never raises.
The 5s timeout is deliberate: a slow matching-engine should produce a
fast fallback, not a 30s spinner.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

import config
from models.db_models import MatchBreakdown

logger = logging.getLogger(__name__)


async def fetch_match_breakdown(
    profile_id: str, opportunity_id: str
) -> Optional[MatchBreakdown]:
    url = f"{config.MATCHING_SERVICE_URL}/api/match/score"
    payload = {"profileId": str(profile_id), "opportunityId": str(opportunity_id)}
    timeout = httpx.Timeout(config.MATCHING_SERVICE_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            logger.warning(
                "matching-engine /score returned %s for %s",
                resp.status_code,
                opportunity_id,
            )
            return None
        body = resp.json()
    except Exception as exc:  # noqa: BLE001 — never raise to caller
        logger.warning("matching-engine /score call failed: %s", exc)
        return None

    if not isinstance(body, dict) or "matchScore" not in body:
        logger.warning(
            "matching-engine /score returned unexpected payload for %s",
            opportunity_id,
        )
        return None

    return MatchBreakdown(
        match_score=float(body.get("matchScore") or 0.0),
        missing_skills=list(body.get("missingSkills") or []),
        breakdown=dict(body.get("breakdown") or {}),
        model_used=str(body.get("modelUsed") or "ml"),
        shortlist_probability=body.get("shortlistProbability"),
    )


async def fetch_recommendations(user_id: str) -> Optional[list[dict]]:
    """Used by dashboard-fit. Returns the matching-engine's already-ranked
    list of opportunities for this worker, or None on any failure.
    """
    url = f"{config.MATCHING_SERVICE_URL}/api/match/recommendations/{user_id}"
    timeout = httpx.Timeout(config.MATCHING_SERVICE_TIMEOUT_SECONDS)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            logger.warning(
                "matching-engine /recommendations returned %s for %s",
                resp.status_code,
                user_id,
            )
            return None
        body = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("matching-engine /recommendations call failed: %s", exc)
        return None
    recs = body.get("recommendations") if isinstance(body, dict) else None
    return list(recs) if isinstance(recs, list) else None


def matchbreakdown_to_response(
    mb: MatchBreakdown,
) -> dict:
    """Flatten a MatchBreakdown into the shape mobile/web clients expect
    on `data.matchBreakdown`. Mirrors the matching-engine's own response
    keys so a single learning-engine call can drive the Match Breakdown
    card without a second round trip.
    """
    out: dict = {
        "matchScore": mb.match_score,
        "modelUsed": mb.model_used,
    }
    out.update(mb.breakdown or {})
    if mb.shortlist_probability is not None:
        out["shortlistProbability"] = mb.shortlist_probability
    return out
