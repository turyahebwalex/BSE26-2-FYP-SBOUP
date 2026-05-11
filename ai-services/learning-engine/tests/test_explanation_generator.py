"""Tests for the §6.6 explanation generator."""
from __future__ import annotations

import pytest

from models.db_models import (
    OpportunitySummary,
    ProfileSummary,
    ResourceCandidate,
    SkillGap,
    SkillRef,
    WorkerSkillState,
)
from services import explanation_generator


def _profile() -> ProfileSummary:
    return ProfileSummary(
        profile_id="p",
        user_id="u",
        title="Carpenter",
        bio="Skilled carpenter",
        location="Kampala",
        skill_state=WorkerSkillState(
            declared=[
                SkillRef("s1", "Carpentry", "Trade", "primary", "advanced"),
                SkillRef("s2", "Joinery", "Trade", "secondary", "intermediate"),
            ]
        ),
    )


def _resource() -> ResourceCandidate:
    return ResourceCandidate(
        title="Masonry Fundamentals",
        url="https://x/masonry",
        provider="YouTube",
        cost=0.0,
        priceLabel="Free",
        type="video",
        difficultyLevel="beginner",
        bridgesSkill="Masonry",
        description="Beginner-friendly masonry course",
    )


def test_strip_filler_removes_marketing_phrases():
    assert "highly recommended" not in explanation_generator._strip_filler(
        "This is highly recommended content"
    ).lower()
    assert "industry-leading" not in explanation_generator._strip_filler(
        "Industry-leading tutorial"
    ).lower()


def test_explain_resource_uses_fallback_when_pipeline_none(monkeypatch):
    monkeypatch.setattr(explanation_generator.ai_models, "summary_pipeline", None)
    text = explanation_generator.explain_resource(
        _resource(), "Masonry", _profile()
    )
    assert text
    assert "Masonry" in text
    assert "YouTube" in text


def test_explain_resource_falls_through_short_llm_output(monkeypatch):
    """LLM produced something too short → fall through to fact-pack."""

    class FakePipe:
        def __call__(self, prompt, max_new_tokens, do_sample):
            return [{"generated_text": "Yes"}]

    monkeypatch.setattr(explanation_generator.ai_models, "summary_pipeline", FakePipe())
    text = explanation_generator.explain_resource(
        _resource(), "Masonry", _profile()
    )
    # Fact-pack output is deterministic.
    assert "Bridges the Masonry gap" in text


def test_explain_resource_uses_llm_output_when_long_enough(monkeypatch):
    long_text = (
        "This beginner masonry course bridges directly to the carpentry experience "
        "already on the worker profile, foundational and free."
    )

    class FakePipe:
        def __call__(self, prompt, max_new_tokens, do_sample):
            return [{"generated_text": long_text}]

    monkeypatch.setattr(explanation_generator.ai_models, "summary_pipeline", FakePipe())
    text = explanation_generator.explain_resource(
        _resource(), "Masonry", _profile()
    )
    assert text == explanation_generator._strip_filler(long_text)


def test_explain_pathway_fact_pack(monkeypatch):
    monkeypatch.setattr(explanation_generator.ai_models, "summary_pipeline", None)
    deficit = SkillGap(missing=["Masonry", "Concrete Finishing"])
    pathway = explanation_generator.explain_pathway(
        deficit, [_resource(), _resource()], _profile()
    )
    assert "Masonry" in pathway
    assert "Concrete Finishing" in pathway


def test_explain_pathway_handles_no_resources(monkeypatch):
    monkeypatch.setattr(explanation_generator.ai_models, "summary_pipeline", None)
    pathway = explanation_generator.explain_pathway(
        SkillGap(missing=[]), [], _profile()
    )
    assert "No skill gaps" in pathway
