"""End-to-end orchestrator tests with all I/O mocked.

Mirror cv-generation/tests/test_cv_generator.py — proves the wiring of
fetch → match consumer → analyser → aggregator → explanation generator
without requiring MongoDB, the matching-engine, or HF model weights.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from models.db_models import (
    MatchBreakdown,
    OpportunitySummary,
    ProfileSummary,
    ResourceCandidate,
    SkillRef,
    WorkerSkillState,
)
from services import learning_path_generator as lpg


@pytest.fixture
def profile():
    return ProfileSummary(
        profile_id="507f1f77bcf86cd799439011",
        user_id="507f1f77bcf86cd799439012",
        title="Carpenter",
        bio="Skilled carpenter with eight years of fitting custom furniture.",
        location="Kampala",
        skill_state=WorkerSkillState(
            declared=[
                SkillRef("s1", "Carpentry", "Trade", "primary", "advanced"),
                SkillRef("s2", "Joinery", "Trade", "secondary", "intermediate"),
            ]
        ),
    )


@pytest.fixture
def opportunity():
    return OpportunitySummary(
        opportunity_id="507f1f77bcf86cd799439013",
        title="Senior Carpenter",
        description="Seeking experienced carpenter with masonry knowledge",
        category="formal",
        experience_level="senior",
        required_skill_names=["Carpentry", "Masonry"],
    )


@pytest.fixture
def candidate():
    return ResourceCandidate(
        title="Masonry Fundamentals",
        url="https://x/masonry",
        provider="YouTube",
        cost=0.0,
        priceLabel="Free",
        type="video",
        difficultyLevel="beginner",
        bridgesSkill="Masonry",
        relevanceScore=0.7,
        finalScore=0.7,
    )


@pytest.fixture(autouse=True)
def stub_models(monkeypatch):
    """Default ai_models pipelines to None so explanation generator and
    skill extractor take their fallback paths.
    """
    monkeypatch.setattr(lpg.ai_models, "semantic_model", None)
    monkeypatch.setattr(
        "services.skill_gap_analyser.ai_models.semantic_model", None
    )
    monkeypatch.setattr(
        "services.explanation_generator.ai_models.summary_pipeline", None
    )
    monkeypatch.setattr(
        "services.skill_extractor.ai_models.ner_pipeline", None
    )
    monkeypatch.setattr(
        "services.skill_extractor.ai_models.summary_pipeline", None
    )


@pytest.mark.asyncio
async def test_target_skill_mode_no_opportunity(monkeypatch, profile, candidate):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(lpg, "fetch_opportunity", AsyncMock(return_value=None))
    monkeypatch.setattr(
        lpg, "aggregate_resources", AsyncMock(return_value=[candidate])
    )
    monkeypatch.setattr(lpg, "_log_skill_gap", AsyncMock(return_value="log123"))

    result = await lpg.generate_learning_path(
        {"userId": "507f1f77bcf86cd799439012", "targetSkill": "Masonry"}
    )
    assert result["consistencyMode"] == "standalone"
    assert result["targetSkill"] == "Masonry"
    assert result["missingSkills"] == ["Masonry"]
    assert len(result["resources"]) == 1
    assert result["resources"][0]["whyThisCourse"]
    assert result["pathwayRationale"]


@pytest.mark.asyncio
async def test_opportunity_mode_uses_matching_engine(
    monkeypatch, profile, opportunity, candidate
):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(
        lpg, "fetch_opportunity", AsyncMock(return_value=opportunity)
    )

    mb = MatchBreakdown(
        match_score=35.0,
        missing_skills=["Masonry"],
        breakdown={
            "cosineScore": 30.1,
            "locationMatch": False,
            "salaryFit": False,
            "expFit": False,
            "skillOverlap": 1,
            "skillGap": 1,
        },
        model_used="ml",
        shortlist_probability=0.18,
    )
    monkeypatch.setattr(lpg, "fetch_match_breakdown", AsyncMock(return_value=mb))
    monkeypatch.setattr(
        lpg, "aggregate_resources", AsyncMock(return_value=[candidate])
    )
    monkeypatch.setattr(lpg, "_log_skill_gap", AsyncMock(return_value=None))

    result = await lpg.generate_learning_path(
        {
            "userId": "507f1f77bcf86cd799439012",
            "opportunityId": "507f1f77bcf86cd799439013",
        }
    )
    assert result["consistencyMode"] == "matching-engine"
    # Authoritative list comes from the matching-engine, not the analyser.
    assert result["missingSkills"] == ["Masonry"]
    assert result["matchBreakdown"]["matchScore"] == 35.0
    assert result["matchBreakdown"]["cosineScore"] == 30.1
    assert all(r["bridgesSkill"] in result["missingSkills"] for r in result["resources"])


@pytest.mark.asyncio
async def test_opportunity_mode_falls_back_when_match_engine_down(
    monkeypatch, profile, opportunity, candidate
):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(
        lpg, "fetch_opportunity", AsyncMock(return_value=opportunity)
    )
    monkeypatch.setattr(lpg, "fetch_match_breakdown", AsyncMock(return_value=None))
    monkeypatch.setattr(
        lpg, "aggregate_resources", AsyncMock(return_value=[candidate])
    )
    monkeypatch.setattr(lpg, "_log_skill_gap", AsyncMock(return_value=None))

    result = await lpg.generate_learning_path(
        {
            "userId": "507f1f77bcf86cd799439012",
            "opportunityId": "507f1f77bcf86cd799439013",
        }
    )
    assert result["consistencyMode"] == "fallback"
    # Now the analyser's local list is the source of truth — Masonry is missing,
    # Carpentry is held.
    assert "Masonry" in result["missingSkills"]


@pytest.mark.asyncio
async def test_missing_both_target_and_opportunity_raises(monkeypatch, profile):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    with pytest.raises(lpg.LearningEngineError) as exc:
        await lpg.generate_learning_path({"userId": "u"})
    assert exc.value.status == 422


@pytest.mark.asyncio
async def test_profile_not_found_raises(monkeypatch):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=None))
    with pytest.raises(lpg.LearningEngineError) as exc:
        await lpg.generate_learning_path(
            {"userId": "507f1f77bcf86cd799439012", "targetSkill": "Python"}
        )
    assert exc.value.code == "PROFILE_NOT_FOUND"
    assert exc.value.status == 404


@pytest.mark.asyncio
async def test_opportunity_not_found_raises(monkeypatch, profile):
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(lpg, "fetch_opportunity", AsyncMock(return_value=None))
    with pytest.raises(lpg.LearningEngineError) as exc:
        await lpg.generate_learning_path(
            {
                "userId": "507f1f77bcf86cd799439012",
                "opportunityId": "deadbeef",
            }
        )
    assert exc.value.code == "OPPORTUNITY_NOT_FOUND"


@pytest.mark.asyncio
async def test_no_missing_skills_returns_empty_resources(
    monkeypatch, profile, opportunity
):
    """When the worker already has every required skill, the pathway is
    empty but the response is still a 200 with a friendly summary.
    """
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(
        lpg, "fetch_opportunity", AsyncMock(return_value=opportunity)
    )
    mb = MatchBreakdown(
        match_score=92.0,
        missing_skills=[],
        breakdown={"skillGap": 0},
        model_used="ml",
    )
    monkeypatch.setattr(lpg, "fetch_match_breakdown", AsyncMock(return_value=mb))
    aggregate_calls = AsyncMock(return_value=[])
    monkeypatch.setattr(lpg, "aggregate_resources", aggregate_calls)
    monkeypatch.setattr(lpg, "_log_skill_gap", AsyncMock(return_value=None))

    result = await lpg.generate_learning_path(
        {
            "userId": "507f1f77bcf86cd799439012",
            "opportunityId": "507f1f77bcf86cd799439013",
        }
    )
    assert result["resources"] == []
    assert result["missingSkills"] == []
    assert "No missing skills" in result["analysisSummary"]
    aggregate_calls.assert_not_called()


@pytest.mark.asyncio
async def test_genuine_gap_drives_pathway(monkeypatch, profile, opportunity):
    """Profile has Carpentry only; opportunity needs Carpentry + Masonry +
    Concrete Finishing. Pathway must build resources for the two missing
    skills, none for Carpentry.
    """
    opportunity.required_skill_names = ["Carpentry", "Masonry", "Concrete Finishing"]
    monkeypatch.setattr(lpg, "fetch_profile_by_user", AsyncMock(return_value=profile))
    monkeypatch.setattr(
        lpg, "fetch_opportunity", AsyncMock(return_value=opportunity)
    )
    mb = MatchBreakdown(
        match_score=40.0,
        missing_skills=["Masonry", "Concrete Finishing"],
        breakdown={},
    )
    monkeypatch.setattr(lpg, "fetch_match_breakdown", AsyncMock(return_value=mb))

    def per_skill(skill, semantic_model=None):
        return [
            ResourceCandidate(
                title=f"{skill} 101",
                url=f"https://x/{skill}",
                provider="Curated",
                cost=0.0,
                priceLabel="Free",
                difficultyLevel="beginner",
                bridgesSkill=skill,
            )
        ]

    monkeypatch.setattr(
        lpg, "aggregate_resources", AsyncMock(side_effect=per_skill)
    )
    monkeypatch.setattr(lpg, "_log_skill_gap", AsyncMock(return_value=None))

    result = await lpg.generate_learning_path(
        {
            "userId": "507f1f77bcf86cd799439012",
            "opportunityId": "507f1f77bcf86cd799439013",
        }
    )
    bridges = {r["bridgesSkill"] for r in result["resources"]}
    assert "Masonry" in bridges
    assert "Concrete Finishing" in bridges
    assert "Carpentry" not in bridges  # Held, not missing.
