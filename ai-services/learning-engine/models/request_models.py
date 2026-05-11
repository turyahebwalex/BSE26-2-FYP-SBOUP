"""Pydantic schemas for the public API surface of the learning engine."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Requests ────────────────────────────────────────────────────────────


class GenerateLearningPathRequest(BaseModel):
    """Body of POST /api/learning/generate.

    Backwards-compatible with the existing Node.js call shape. Exactly
    one of `targetSkill` / `opportunityId` must be set; if both, the
    opportunity wins and `targetSkill` becomes a hint.
    """

    userId: str = Field(..., min_length=1)
    targetSkill: Optional[str] = None
    opportunityId: Optional[str] = None


class AnalyseSkillGapsRequest(BaseModel):
    profileId: str = Field(..., min_length=1)
    opportunityId: str = Field(..., min_length=1)


class DashboardFitRequest(BaseModel):
    userId: str = Field(..., min_length=1)


class ProgressUpdateRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    learningPathId: Optional[str] = None
    resourceUrl: str = Field(..., min_length=1)
    bridgesSkill: Optional[str] = None
    isCompleted: bool = True


# ─── Generic envelopes ───────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    semantic_model_loaded: bool = False
    summary_pipeline_loaded: bool = False
    ner_pipeline_loaded: bool = False


class ErrorResponse(BaseModel):
    error: str
    message: str


# ─── /api/learning/generate ──────────────────────────────────────────────


class GenerateLearningPathData(BaseModel):
    consistencyMode: str
    targetSkill: str
    missingSkills: list[str] = Field(default_factory=list)
    criticalGapCount: int = 0
    matchBreakdown: Optional[dict[str, Any]] = None
    aliasHints: list[dict[str, Any]] = Field(default_factory=list)
    proficiencyShortfalls: list[dict[str, str]] = Field(default_factory=list)
    bioInferredSkills: list[str] = Field(default_factory=list)
    analysisSummary: str = ""
    pathwayRationale: str = ""
    resources: list[dict[str, Any]] = Field(default_factory=list)
    skillGapLogId: Optional[str] = None


class GenerateLearningPathResponse(BaseModel):
    ok: bool = True
    data: GenerateLearningPathData
    # Top-level alias for the existing Node.js controller, which reads
    # `response.data.resources`. Axios resolves response.data == this body,
    # so the Node.js code path expects `resources` here, not under `data`.
    # TODO: drop top-level resources alias once server/controller is updated.
    resources: list[dict[str, Any]] = Field(default_factory=list)


# ─── /api/learning/skill-gaps ────────────────────────────────────────────


class SkillGapsData(BaseModel):
    consistencyMode: str
    missingSkills: list[str] = Field(default_factory=list)
    matchBreakdown: Optional[dict[str, Any]] = None
    proficiencyShortfalls: list[dict[str, str]] = Field(default_factory=list)
    aliasHints: list[dict[str, Any]] = Field(default_factory=list)
    bioInferredSkills: list[str] = Field(default_factory=list)
    totalGapScore: float = 0.0


class SkillGapsResponse(BaseModel):
    ok: bool = True
    data: SkillGapsData


# ─── /api/learning/dashboard-fit ─────────────────────────────────────────


class FittingCategory(BaseModel):
    category: str
    fitScore: float
    matchingOpportunityCount: int = 0
    matchingSkillCount: int = 0
    missingSkills: list[str] = Field(default_factory=list)
    aliasHints: list[dict[str, Any]] = Field(default_factory=list)


class DashboardFitData(BaseModel):
    consistencyMode: str
    fittingCategories: list[FittingCategory] = Field(default_factory=list)


class DashboardFitResponse(BaseModel):
    ok: bool = True
    data: DashboardFitData


# ─── /api/learning/progress ──────────────────────────────────────────────


class ProgressData(BaseModel):
    profileSkillsUpdated: int = 0
    learningProgressLogged: bool = False


class ProgressResponse(BaseModel):
    ok: bool = True
    data: ProgressData
