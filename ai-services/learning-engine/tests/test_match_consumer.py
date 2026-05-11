"""Tests for services/match_consumer.py.

Per §6.0 / §12 step 9, every failure mode of the matching-engine call
MUST return None — the orchestrator interprets None as "fall through".
"""
from __future__ import annotations

import httpx
import pytest

from services import match_consumer


_RealAsyncClient = httpx.AsyncClient


def _patch_client(monkeypatch, transport):
    """Replace httpx.AsyncClient with a factory that always uses our
    MockTransport. Captured _RealAsyncClient avoids a recursive call
    when the patched factory itself constructs an AsyncClient.
    """
    monkeypatch.setattr(
        match_consumer.httpx,
        "AsyncClient",
        lambda **kw: _RealAsyncClient(
            transport=transport,
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )


@pytest.mark.asyncio
async def test_success_path_returns_breakdown(monkeypatch):
    payload = {
        "matchScore": 35.0,
        "missingSkills": ["JavaScript"],
        "breakdown": {
            "cosineScore": 30.1,
            "locationMatch": False,
            "salaryFit": False,
            "expFit": False,
            "skillOverlap": 1,
            "skillGap": 1,
        },
        "modelUsed": "ml",
        "shortlistProbability": 0.18,
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/match/score"
        return httpx.Response(200, json=payload)

    _patch_client(monkeypatch, httpx.MockTransport(handler))

    mb = await match_consumer.fetch_match_breakdown("p", "o")
    assert mb is not None
    assert mb.match_score == 35.0
    assert mb.missing_skills == ["JavaScript"]
    assert mb.breakdown["cosineScore"] == 30.1
    assert mb.shortlist_probability == 0.18


@pytest.mark.asyncio
async def test_5xx_returns_none(monkeypatch):
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(503, json={"error": "down"})),
    )
    assert await match_consumer.fetch_match_breakdown("p", "o") is None


@pytest.mark.asyncio
async def test_network_error_returns_none(monkeypatch):
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    _patch_client(monkeypatch, httpx.MockTransport(boom))
    assert await match_consumer.fetch_match_breakdown("p", "o") is None


@pytest.mark.asyncio
async def test_timeout_returns_none(monkeypatch):
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out")

    _patch_client(monkeypatch, httpx.MockTransport(boom))
    assert await match_consumer.fetch_match_breakdown("p", "o") is None


@pytest.mark.asyncio
async def test_unexpected_payload_returns_none(monkeypatch):
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json={"unexpected": True})),
    )
    assert await match_consumer.fetch_match_breakdown("p", "o") is None


@pytest.mark.asyncio
async def test_recommendations_success(monkeypatch):
    payload = {"recommendations": [{"opportunityId": "o1", "matchScore": 70, "missingSkills": ["x"]}]}
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
    )
    out = await match_consumer.fetch_recommendations("u")
    assert out == payload["recommendations"]


@pytest.mark.asyncio
async def test_recommendations_failure_returns_none(monkeypatch):
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(500)),
    )
    assert await match_consumer.fetch_recommendations("u") is None
