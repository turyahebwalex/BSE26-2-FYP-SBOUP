"""Tests for services/skill_extractor.py — bio-mining + resource skill tagging."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from models.db_models import (
    ProfileSummary,
    ResourceCandidate,
    SkillRef,
    WorkerSkillState,
)
from services import skill_extractor


def _profile(declared=None, bio="house painting and minor electrical work") -> ProfileSummary:
    return ProfileSummary(
        profile_id="p",
        user_id="u",
        title="",
        bio=bio,
        location="",
        skill_state=WorkerSkillState(declared=list(declared or [])),
    )


@pytest.mark.asyncio
async def test_canonical_validation_drops_unknown_spans(monkeypatch):
    """A span not present in the catalog must be dropped, not invented."""
    class FakePipe:
        def __call__(self, text):
            return [
                {"word": "Painting", "score": 0.9},
                {"word": "QuantumWeaving", "score": 0.95},
            ]

    monkeypatch.setattr(skill_extractor.ai_models, "ner_pipeline", FakePipe())

    async def fake_find_one(query):
        # Simulate a `skills` collection with only "Painting".
        if query.get("skillName") and query["skillName"].pattern.lower() == "^painting$":
            return {"skillName": "Painting"}
        return None

    fake_skills = type("FakeColl", (), {"find_one": staticmethod(fake_find_one)})()
    fake_db = type("FakeDB", (), {"skills": fake_skills})()
    monkeypatch.setattr(skill_extractor, "get_db", lambda: fake_db)

    out = await skill_extractor.extract_from_bio(_profile())
    assert [s.name for s in out] == ["Painting"]
    assert all(s.classification == "bio_inferred" for s in out)


@pytest.mark.asyncio
async def test_filters_out_already_declared_skills(monkeypatch):
    class FakePipe:
        def __call__(self, text):
            return [{"word": "Painting", "score": 0.9}]

    monkeypatch.setattr(skill_extractor.ai_models, "ner_pipeline", FakePipe())

    async def fake_find_one(query):
        return {"skillName": "Painting"}

    fake_skills = type("FakeColl", (), {"find_one": staticmethod(fake_find_one)})()
    fake_db = type("FakeDB", (), {"skills": fake_skills})()
    monkeypatch.setattr(skill_extractor, "get_db", lambda: fake_db)

    profile = _profile(
        declared=[SkillRef("s1", "Painting", "Trade", "primary", "intermediate")]
    )
    out = await skill_extractor.extract_from_bio(profile)
    assert out == []  # Already declared, so filtered out.


@pytest.mark.asyncio
async def test_llm_fallback_when_ner_unavailable(monkeypatch):
    monkeypatch.setattr(skill_extractor.ai_models, "ner_pipeline", None)

    class FakeSummaryPipe:
        def __call__(self, prompt, max_new_tokens, do_sample):
            return [{"generated_text": '["Painting", "Electrical"]'}]

    monkeypatch.setattr(skill_extractor.ai_models, "summary_pipeline", FakeSummaryPipe())

    async def fake_find_one(query):
        # Catalog has only Painting.
        if query["skillName"].pattern.lower() == "^painting$":
            return {"skillName": "Painting"}
        return None

    fake_skills = type("FakeColl", (), {"find_one": staticmethod(fake_find_one)})()
    fake_db = type("FakeDB", (), {"skills": fake_skills})()
    monkeypatch.setattr(skill_extractor, "get_db", lambda: fake_db)

    out = await skill_extractor.extract_from_bio(_profile())
    assert [s.name for s in out] == ["Painting"]


@pytest.mark.asyncio
async def test_both_models_unavailable_returns_empty(monkeypatch):
    monkeypatch.setattr(skill_extractor.ai_models, "ner_pipeline", None)
    monkeypatch.setattr(skill_extractor.ai_models, "summary_pipeline", None)

    out = await skill_extractor.extract_from_bio(_profile())
    assert out == []


@pytest.mark.asyncio
async def test_extract_resource_skill_returns_canonical(monkeypatch):
    class FakePipe:
        def __call__(self, text):
            return [{"word": "Pandas", "score": 0.95}]

    monkeypatch.setattr(skill_extractor.ai_models, "ner_pipeline", FakePipe())

    async def fake_find_one(query):
        if query["skillName"].pattern.lower() == "^pandas$":
            return {"skillName": "Pandas"}
        return None

    fake_skills = type("FakeColl", (), {"find_one": staticmethod(fake_find_one)})()
    fake_db = type("FakeDB", (), {"skills": fake_skills})()
    monkeypatch.setattr(skill_extractor, "get_db", lambda: fake_db)

    resource = ResourceCandidate(
        title="Intro to Pandas",
        url="https://x",
        provider="YouTube",
        description="Pandas is a data analysis library",
        bridgesSkill="",
    )
    out = await skill_extractor.extract_resource_skill(resource)
    assert out == "Pandas"


@pytest.mark.asyncio
async def test_extract_resource_skill_returns_existing_value():
    """If the resource already has bridgesSkill set, no NER call needed."""
    resource = ResourceCandidate(
        title="x", url="y", provider="z", bridgesSkill="React"
    )
    out = await skill_extractor.extract_resource_skill(resource)
    assert out == "React"
