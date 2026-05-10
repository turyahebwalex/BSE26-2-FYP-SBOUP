"""End-to-end orchestrator test with all I/O mocked.

This proves the wiring of fetch → AI stages → render → upload → persist
without requiring MongoDB, S3, or the HF model weights.
"""
from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from models.db_models import (
    EducationRef,
    ExperienceRef,
    PortfolioItem,
    ProfileAggregate,
    SkillRef,
    UserRef,
)
from services import cv_generator


@pytest.fixture
def aggregate():
    return ProfileAggregate(
        profile_id="507f1f77bcf86cd799439011",
        user=UserRef(
            user_id="507f1f77bcf86cd799439012",
            full_name="Aisha Nakato",
            email="aisha@example.com",
            phone="+256700111222",
        ),
        title="Carpenter",
        bio="Skilled carpenter with eight years of fitting custom furniture across Kampala.",
        location="Kampala",
        portfolio=[PortfolioItem("Custom shelving", "Built oak shelves", "https://x", "link")],
        skills=[
            SkillRef("s1", "Carpentry", "Trade", "primary", "advanced"),
            SkillRef("s2", "Joinery", "Trade", "secondary", "intermediate"),
        ],
        experiences=[
            ExperienceRef(
                "e1",
                "Site Carpenter",
                "Acme Builders",
                "formal",
                datetime(2020, 1, 1),
                datetime(2024, 1, 1),
                48,
                "Led a crew of four on residential builds.",
            ),
        ],
        education=[
            EducationRef("ed1", "YMCA", "Diploma", "Carpentry", 2018, 2020),
        ],
    )


@pytest.mark.asyncio
async def test_generate_cv_baseline_flow(monkeypatch, aggregate, tmp_path):
    """Baseline CV: no opportunityId, no model usage required."""
    monkeypatch.setattr(
        cv_generator,
        "fetch_profile_aggregate",
        AsyncMock(return_value=aggregate),
    )
    monkeypatch.setattr(
        cv_generator,
        "upload_pdf",
        lambda cv_id, _bytes: f"http://test/static/cvs/{cv_id}.pdf",
    )

    result = await cv_generator.generate_cv(
        {
            "profileId": str(aggregate.profile_id),
            "userId": aggregate.user.user_id,
            "templateType": "chronological",
            "selectedData": {"sections": ["experience", "skills", "education"]},
        }
    )
    assert result["cvId"]
    assert len(result["cvId"]) == 24
    assert result["fileFormat"] == "pdf"
    assert result["fileUrl"].endswith(".pdf")
    assert "renderedSections" in result["cvFieldTarget"]


@pytest.mark.asyncio
async def test_invalid_template_raises(monkeypatch, aggregate):
    monkeypatch.setattr(
        cv_generator,
        "fetch_profile_aggregate",
        AsyncMock(return_value=aggregate),
    )
    with pytest.raises(cv_generator.CVGenerationError) as exc:
        await cv_generator.generate_cv(
            {"profileId": "p", "templateType": "fancy"}
        )
    assert exc.value.code == "INVALID_TEMPLATE"
    assert exc.value.status == 400


@pytest.mark.asyncio
async def test_missing_profile_raises(monkeypatch):
    monkeypatch.setattr(
        cv_generator,
        "fetch_profile_aggregate",
        AsyncMock(return_value=None),
    )
    with pytest.raises(cv_generator.CVGenerationError) as exc:
        await cv_generator.generate_cv(
            {"profileId": "deadbeef", "templateType": "chronological"}
        )
    assert exc.value.code == "PROFILE_NOT_FOUND"
    assert exc.value.status == 404
