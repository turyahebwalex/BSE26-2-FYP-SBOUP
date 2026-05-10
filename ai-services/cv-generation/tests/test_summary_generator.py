"""Tests for the bio rule and fact-pack fallback. The LLM path itself
is tested at integration time (Step 4 in the spec) since it requires
the model to be loaded.
"""
from datetime import datetime

from models.db_models import (
    ExperienceRef,
    ProfileAggregate,
    SkillRef,
    UserRef,
)
from services import summary_generator


def _aggregate(bio: str = "", skills=None, experiences=None) -> ProfileAggregate:
    return ProfileAggregate(
        profile_id="p",
        user=UserRef(user_id="u", full_name="Test User"),
        title="Carpenter",
        bio=bio,
        location="Kampala",
        skills=skills or [],
        experiences=experiences or [],
    )


def test_long_bio_returned_verbatim(monkeypatch):
    """If bio is ≥50 chars, the LLM should not be called."""
    bio = "Twenty years building wooden furniture across central Uganda."
    called = {"n": 0}

    def fake_run(_prompt):
        called["n"] += 1
        return "should not be used"

    monkeypatch.setattr(summary_generator, "_run_llm", fake_run)
    out = summary_generator.generate_summary(_aggregate(bio=bio))
    assert out == bio
    assert called["n"] == 0


def test_short_bio_falls_back_to_factpack(monkeypatch):
    """When bio is empty and the LLM returns nothing, fact-pack kicks in."""
    monkeypatch.setattr(summary_generator, "_run_llm", lambda _prompt: "")
    skills = [
        SkillRef("s1", "Carpentry", "Trade", "primary", "advanced"),
        SkillRef("s2", "Joinery", "Trade", "primary", "intermediate"),
    ]
    out = summary_generator.generate_summary(_aggregate(skills=skills))
    assert "Carpenter" in out
    assert "Kampala" in out
    assert "Carpentry" in out


def test_filler_phrases_stripped():
    raw = "Highly motivated Carpenter with extensive experience in Kampala."
    cleaned = summary_generator._strip_filler(raw)
    assert "highly motivated" not in cleaned.lower()
    assert "extensive experience" not in cleaned.lower()
    assert "Carpenter" in cleaned
