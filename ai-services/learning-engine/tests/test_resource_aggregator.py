"""Tests for the resource aggregator package.

Provider-level tests use httpx.MockTransport. Aggregate-level tests
verify dedupe, scoring relations, and pathway ordering.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from models.db_models import ResourceCandidate
from services.resource_aggregator import base, aggregate_resources
from services.resource_aggregator.coursera_provider import CourseraProvider
from services.resource_aggregator.curated_provider import CuratedProvider
from services.resource_aggregator.edx_provider import EdxProvider
from services.resource_aggregator.youtube_provider import YouTubeProvider


_RealAsyncClient = httpx.AsyncClient


def _patch_client(monkeypatch, transport, target_module):
    monkeypatch.setattr(
        target_module.httpx,
        "AsyncClient",
        lambda **kw: _RealAsyncClient(
            transport=transport,
            **{k: v for k, v in kw.items() if k != "transport"},
        ),
    )


def _candidate(**overrides) -> ResourceCandidate:
    base_args = dict(
        title="Intro to X",
        url="https://example.com/x",
        provider="Curated",
        cost=0.0,
        priceLabel="Free",
        estimatedDuration="2h",
        type="course",
        description="Beginner-friendly intro to X",
        rating=4.5,
        reviewCount=100,
        difficultyLevel="beginner",
        bridgesSkill="X",
    )
    base_args.update(overrides)
    return ResourceCandidate(**base_args)


def test_dedupe_by_url_strips_querystrings():
    a = _candidate(url="https://example.com/x?foo=1")
    b = _candidate(url="https://example.com/x?foo=2", title="Dup")
    c = _candidate(url="https://example.com/y", title="Other")
    out = base.dedupe_by_url([a, b, c])
    assert len(out) == 2
    assert {c.title for c in out} == {"Intro to X", "Other"}


def test_dedupe_handles_empty_url():
    out = base.dedupe_by_url([_candidate(url=""), _candidate(url="https://x.example")])
    assert len(out) == 1


def test_score_candidate_prefers_free_beginner_relevant_match():
    free_match = _candidate(
        title="X Tutorial for Beginners",
        cost=0.0,
        difficultyLevel="beginner",
        rating=4.7,
    )
    paid_advanced = _candidate(
        title="Advanced X for Experts",
        cost=120.0,
        difficultyLevel="advanced",
        rating=4.7,
        priceLabel="$120",
    )
    base.score_candidate(free_match, "X")
    base.score_candidate(paid_advanced, "X")
    assert free_match.finalScore > paid_advanced.finalScore


def test_score_candidate_no_model_uses_keyword_overlap():
    c = _candidate(title="Python Tutorial", description="Beginner Python content")
    base.score_candidate(c, "Python")
    # Keyword overlap fallback should give a positive relevance score.
    assert c.relevanceScore > 0


def test_order_pathway_foundational_first():
    beginner = _candidate(title="A", difficultyLevel="beginner")
    intermediate = _candidate(title="B", url="https://b", difficultyLevel="intermediate")
    advanced = _candidate(title="C", url="https://c", difficultyLevel="advanced")
    for c in (beginner, intermediate, advanced):
        base.score_candidate(c, "X")
    out = base.order_pathway([advanced, beginner, intermediate])
    assert [c.title for c in out] == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_youtube_disabled_when_key_empty(monkeypatch):
    monkeypatch.setattr("config.YOUTUBE_API_KEY", "")
    out = await YouTubeProvider().fetch("Python")
    assert out == []


@pytest.mark.asyncio
async def test_youtube_quota_skipped(monkeypatch):
    from services.resource_aggregator import youtube_provider

    monkeypatch.setattr("config.YOUTUBE_API_KEY", "fake-key")
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(403, json={"error": "quota"})),
        youtube_provider,
    )
    out = await YouTubeProvider().fetch("Python")
    assert out == []


@pytest.mark.asyncio
async def test_youtube_success(monkeypatch):
    from services.resource_aggregator import youtube_provider

    monkeypatch.setattr("config.YOUTUBE_API_KEY", "fake-key")
    payload = {
        "items": [
            {
                "id": {"videoId": "abc"},
                "snippet": {"title": "Python Tutorial", "description": "Beginner Python"},
            }
        ]
    }
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
        youtube_provider,
    )
    out = await YouTubeProvider().fetch("Python")
    assert len(out) == 1
    assert out[0].url.endswith("?v=abc")
    assert out[0].provider == "YouTube"


@pytest.mark.asyncio
async def test_coursera_marks_audit_free(monkeypatch):
    from services.resource_aggregator import coursera_provider

    payload = {
        "elements": [
            {
                "name": "Python Specialisation",
                "slug": "python",
                "description": "Free with audit access. Workload: 4 hours/week.",
                "workload": "4h/week",
            }
        ]
    }
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
        coursera_provider,
    )
    out = await CourseraProvider().fetch("Python")
    assert len(out) == 1
    assert out[0].priceLabel == "Free"
    assert out[0].cost == 0.0


@pytest.mark.asyncio
async def test_coursera_marks_paid_when_no_free_hint(monkeypatch):
    from services.resource_aggregator import coursera_provider

    payload = {
        "elements": [
            {
                "name": "Python Specialisation",
                "slug": "python",
                "description": "Comprehensive Python course",
                "workload": "4h/week",
            }
        ]
    }
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
        coursera_provider,
    )
    out = await CourseraProvider().fetch("Python")
    assert out[0].priceLabel == "Paid (audit may be free)"
    assert out[0].cost is None


@pytest.mark.asyncio
async def test_edx_returns_candidates(monkeypatch):
    from services.resource_aggregator import edx_provider

    payload = {
        "results": [
            {
                "name": "Python for Data Science",
                "course_id": "edx-py",
                "course_url": "https://www.edx.org/course/python-data",
                "short_description": "Free audit option for learners",
                "effort": "5h/week",
            }
        ]
    }
    _patch_client(
        monkeypatch,
        httpx.MockTransport(lambda req: httpx.Response(200, json=payload)),
        edx_provider,
    )
    out = await EdxProvider().fetch("Python")
    assert len(out) == 1
    assert out[0].provider == "edX"
    assert out[0].priceLabel == "Free"


@pytest.mark.asyncio
async def test_curated_provider_returns_for_known_skill():
    out = await CuratedProvider().fetch("Python")
    assert len(out) >= 1
    assert all(c.provider for c in out)
    assert all(c.url for c in out)


@pytest.mark.asyncio
async def test_curated_provider_empty_for_unknown():
    out = await CuratedProvider().fetch("DefinitelyNotASkill12345")
    assert out == []


@pytest.mark.asyncio
async def test_aggregate_uses_curated_fallback(monkeypatch):
    """When all live providers return empty (e.g. no YouTube key, network
    blocked), the curated catalog still yields something.
    """
    # Stub the NER call to return None — we don't want to hit Mongo.
    monkeypatch.setattr(
        "services.resource_aggregator.extract_resource_skill",
        AsyncMock(return_value=None),
    )

    class EmptyProvider:
        name = "empty"

        async def fetch(self, skill):
            return []

    providers = [EmptyProvider(), CuratedProvider()]
    out = await aggregate_resources("Python", semantic_model=None, providers=providers)
    assert out, "expected at least one curated resource for Python"
    for c in out:
        assert c.bridgesSkill == "Python"
        assert c.url


@pytest.mark.asyncio
async def test_aggregate_orders_foundational_first(monkeypatch):
    monkeypatch.setattr(
        "services.resource_aggregator.extract_resource_skill",
        AsyncMock(return_value=None),
    )

    class StubProvider:
        name = "stub"

        async def fetch(self, skill):
            return [
                _candidate(
                    title="Advanced",
                    url="https://x/adv",
                    difficultyLevel="advanced",
                    rating=4.8,
                ),
                _candidate(
                    title="Beginner",
                    url="https://x/beg",
                    difficultyLevel="beginner",
                    rating=4.5,
                ),
                _candidate(
                    title="Intermediate",
                    url="https://x/int",
                    difficultyLevel="intermediate",
                    rating=4.6,
                ),
            ]

    out = await aggregate_resources("X", semantic_model=None, providers=[StubProvider()])
    assert [c.difficultyLevel for c in out] == ["beginner", "intermediate", "advanced"]
