"""Tests for the §6.1 two-stage skill gap analyser.

Coverage requirements (§6.1, §13):
- Exact match (no semantic call needed) — assert empty aliasHints.
- Synonym above threshold — required skill NOT in missing, IS in aliasHints.
- Near-miss below threshold — required skill IS in missing, NOT a hint.
- Empty profile_skills.
- semantic_model = None — analyser still works via exact match only.
- Bio-augmentation path: bio-inferred skill counts toward fit.
- Proficiency shortfall.
"""
from __future__ import annotations

from typing import Iterable
from unittest.mock import AsyncMock

import numpy as np
import pytest

from models.db_models import (
    OpportunitySummary,
    ProfileSummary,
    RequiredSkill,
    SkillRef,
    WorkerSkillState,
)
from services import skill_gap_analyser


class _StubSemanticModel:
    """Returns a deterministic embedding per known phrase. Cosine
    similarity between two encoded inputs reduces to dot product since
    normalize_embeddings=True is requested.
    """

    def __init__(self, vectors: dict[str, list[float]]):
        self._vectors = {k.lower(): np.array(v, dtype=float) for k, v in vectors.items()}

    def encode(self, texts, normalize_embeddings=True, convert_to_numpy=True):
        out = []
        for t in texts:
            v = self._vectors.get(t.lower(), np.array([0.1, 0.1, 0.1], dtype=float))
            if normalize_embeddings:
                norm = np.linalg.norm(v) or 1.0
                v = v / norm
            out.append(v)
        return np.array(out)


def _profile(declared: Iterable[SkillRef], bio: str = "") -> ProfileSummary:
    return ProfileSummary(
        profile_id="p",
        user_id="u",
        title="",
        bio=bio,
        location="",
        skill_state=WorkerSkillState(declared=list(declared)),
    )


@pytest.fixture(autouse=True)
def stub_extract(monkeypatch):
    """Default the bio extractor to no-op so most tests don't need to
    set up Mongo. Individual tests can override.
    """
    monkeypatch.setattr(
        skill_gap_analyser,
        "extract_from_bio",
        AsyncMock(return_value=[]),
    )


@pytest.mark.asyncio
async def test_exact_match_no_alias_hint(monkeypatch):
    monkeypatch.setattr(skill_gap_analyser.ai_models, "semantic_model", None)
    profile = _profile([SkillRef("s1", "Python", "Tech", "primary", "intermediate")])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="Python")]
    )
    assert deficit.missing == []
    assert deficit.aliasHints == []


@pytest.mark.asyncio
async def test_semantic_synonym_above_threshold(monkeypatch):
    """Bricklaying ↔ Masonry should NOT land in `missing`."""
    monkeypatch.setattr(
        skill_gap_analyser.ai_models,
        "semantic_model",
        _StubSemanticModel({
            "Bricklaying": [1.0, 0.0, 0.0],
            "Masonry": [0.95, 0.31, 0.0],  # cosine ≈ 0.95
        }),
    )
    profile = _profile([SkillRef("s1", "Bricklaying", "Trade", "primary", "advanced")])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="Masonry")]
    )
    assert deficit.missing == []
    assert len(deficit.aliasHints) == 1
    hint = deficit.aliasHints[0]
    assert hint["missingSkill"] == "Masonry"
    assert hint["youMayAlreadyHave"] == "Bricklaying"


@pytest.mark.asyncio
async def test_semantic_near_miss_below_threshold(monkeypatch):
    """Cosine ~0.5 should leave the skill in `missing`."""
    monkeypatch.setattr(
        skill_gap_analyser.ai_models,
        "semantic_model",
        _StubSemanticModel({
            "Python": [1.0, 0.0, 0.0],
            "JavaScript": [0.5, 0.866, 0.0],  # cosine = 0.5
        }),
    )
    profile = _profile([SkillRef("s1", "Python", "Tech", "primary", "advanced")])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="JavaScript")]
    )
    assert deficit.missing == ["JavaScript"]
    assert deficit.aliasHints == []


@pytest.mark.asyncio
async def test_empty_profile(monkeypatch):
    monkeypatch.setattr(skill_gap_analyser.ai_models, "semantic_model", None)
    profile = _profile([])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="Python"), RequiredSkill(name="React")]
    )
    assert sorted(deficit.missing) == ["Python", "React"]


@pytest.mark.asyncio
async def test_semantic_model_none(monkeypatch):
    monkeypatch.setattr(skill_gap_analyser.ai_models, "semantic_model", None)
    profile = _profile([SkillRef("s1", "Bricklaying", "Trade", "primary", "advanced")])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="Masonry")]
    )
    # Without the model the analyser falls back to exact match only.
    assert deficit.missing == ["Masonry"]


@pytest.mark.asyncio
async def test_proficiency_shortfall(monkeypatch):
    monkeypatch.setattr(skill_gap_analyser.ai_models, "semantic_model", None)
    profile = _profile([SkillRef("s1", "Python", "Tech", "primary", "beginner")])
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile,
        [RequiredSkill(name="Python", requiredLevel="advanced")],
    )
    assert deficit.missing == []
    assert deficit.proficiencyShortfalls == [
        {"skill": "Python", "current": "beginner", "required": "advanced"}
    ]


@pytest.mark.asyncio
async def test_bio_augmentation_counts_toward_fit(monkeypatch):
    monkeypatch.setattr(skill_gap_analyser.ai_models, "semantic_model", None)
    monkeypatch.setattr(
        skill_gap_analyser,
        "extract_from_bio",
        AsyncMock(return_value=[
            SkillRef("", "Painting", "Trade", "bio_inferred", "intermediate"),
        ]),
    )
    profile = _profile([], bio="house painting and minor electrical")
    deficit = await skill_gap_analyser.compute_skill_deficit(
        profile, [RequiredSkill(name="Painting")]
    )
    assert deficit.missing == []
    assert "Painting" in deficit.bioInferredSkills


@pytest.mark.asyncio
async def test_required_skills_from_opportunity_uses_experience_level():
    opp = OpportunitySummary(
        opportunity_id="o1",
        title="Senior Carpenter",
        description="",
        category="formal",
        experience_level="senior",
        required_skill_names=["Carpentry"],
    )
    rs = skill_gap_analyser.required_skills_from_opportunity(opp)
    assert rs == [RequiredSkill(name="Carpentry", requiredLevel="expert")]


@pytest.mark.asyncio
async def test_target_skill_required_level_default():
    rs = skill_gap_analyser.required_skills_from_target("Plumbing")
    assert rs == [RequiredSkill(name="Plumbing", requiredLevel="intermediate")]
