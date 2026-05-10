"""Pydantic schemas for the public API surface."""
from typing import Any, Optional

from pydantic import BaseModel, Field


TEMPLATE_TYPES = ("chronological", "skills_based", "portfolio_focused")


class GenerateCVRequest(BaseModel):
    """Body of POST /api/cv/generate.

    `selectedData` mirrors the mobile checkboxes. The keys are flexible
    (the mobile screen sends `{ sections: [...] }` but the same payload
    accepts boolean flags too). We normalise downstream.
    """

    profileId: str = Field(..., min_length=1)
    userId: Optional[str] = None
    templateType: str = Field(default="chronological")
    opportunityId: Optional[str] = None
    targetField: Optional[str] = None
    selectedData: dict[str, Any] = Field(default_factory=dict)
    description: str = Field(default="", max_length=500)


class GenerateCVData(BaseModel):
    cvId: str
    fileUrl: str
    fileFormat: str = "pdf"
    cvFieldTarget: dict[str, Any]


class GenerateCVResponse(BaseModel):
    ok: bool = True
    data: GenerateCVData


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool


class ErrorResponse(BaseModel):
    error: str
    message: str
