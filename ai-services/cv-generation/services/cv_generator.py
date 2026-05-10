"""Top-level orchestrator. Implements the GenerateCV algorithm
(steps 1-6 in docs/cv-generation-spec.md §5).

Note: this service is stateless w.r.t. UserCV. The Node.js layer owns
the `usercvs` collection and writes it after this service returns. We
generate a `cvId` (24-char hex, ObjectId-compatible) so the Node.js
insert can use the same id for its `_id`, which keeps the S3 key /
storage path aligned with the DB record.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from models.db_models import CVRenderInputs, ProfileAggregate
from models.request_models import TEMPLATE_TYPES
from services.keyword_extractor import extract_keywords, opportunity_text
from services.profile_service import fetch_opportunity, fetch_profile_aggregate
from services.semantic_ranker import rank_experiences, rank_skills
from services.storage_service import StorageError, upload_pdf
from services.summary_generator import generate_summary
from templates import chronological, portfolio_focused, skills_based

logger = logging.getLogger(__name__)


class CVGenerationError(Exception):
    """Raised with an error code matching the API contract."""

    def __init__(self, code: str, message: str, status: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


_RENDERERS = {
    "chronological": chronological.render,
    "skills_based": skills_based.render,
    "portfolio_focused": portfolio_focused.render,
}


def _normalise_selected(selected_data: dict[str, Any]) -> dict[str, bool]:
    """Mobile sends `{ sections: ['experience', 'skills', ...] }`; web (in
    future) may send boolean flags. Accept both, output canonical bools.
    """
    canonical = {
        "workExperience": True,
        "skillsAndCompetencies": True,
        "education": True,
        "communityWork": False,
    }
    if not selected_data:
        return canonical

    if isinstance(selected_data.get("sections"), list):
        section_list = selected_data["sections"]
        canonical["workExperience"] = "experience" in section_list
        canonical["skillsAndCompetencies"] = "skills" in section_list
        canonical["education"] = "education" in section_list
        canonical["communityWork"] = "communityWork" in section_list

    for key in canonical:
        if key in selected_data and isinstance(selected_data[key], bool):
            canonical[key] = selected_data[key]
    return canonical


def _new_cv_id() -> str:
    """24-char hex matching ObjectId format so it embeds cleanly into
    the S3 key and the UserCV._id.
    """
    return uuid.uuid4().hex[:24]


async def generate_cv(request: dict) -> dict[str, Any]:
    """Main entry point. Raises CVGenerationError on failure."""
    profile_id = request.get("profileId")
    template_type = request.get("templateType", "chronological")

    # Step 1 — validate
    if not profile_id:
        raise CVGenerationError("PROFILE_NOT_FOUND", "profileId is required", 422)
    if template_type not in TEMPLATE_TYPES:
        raise CVGenerationError(
            "INVALID_TEMPLATE",
            f"templateType must be one of {TEMPLATE_TYPES}",
            400,
        )

    # Step 2 — aggregate
    aggregate = await fetch_profile_aggregate(profile_id)
    if aggregate is None:
        raise CVGenerationError(
            "PROFILE_NOT_FOUND", f"no profile found for {profile_id}", 404
        )

    opportunity = None
    opportunity_keywords: list[str] = []
    matched_skill_ids: set[str] = set()

    # Step 3 — AI processing
    if request.get("opportunityId"):
        opportunity = await fetch_opportunity(request["opportunityId"])
        if opportunity is not None:
            opportunity_keywords = await extract_keywords(opportunity_text(opportunity))

    summary = generate_summary(aggregate, opportunity, opportunity_keywords)

    if opportunity is not None:
        ordered_experiences = rank_experiences(
            aggregate.experiences, opportunity, opportunity_keywords
        )
        ordered_skills, matched_skill_ids = rank_skills(aggregate.skills, opportunity)
    else:
        # Baseline: experience already startDate-desc; skills primary-first.
        ordered_experiences = aggregate.experiences
        ordered_skills, _ = rank_skills(aggregate.skills, None)

    selected = _normalise_selected(request.get("selectedData") or {})

    inputs = CVRenderInputs(
        aggregate=aggregate,
        summary=summary,
        ordered_skills=ordered_skills,
        ordered_experiences=ordered_experiences,
        selected=selected,
        opportunity=opportunity,
        matched_skill_ids=matched_skill_ids,
    )

    # Step 4 — render
    renderer = _RENDERERS[template_type]
    try:
        pdf_bytes = renderer(inputs)
    except Exception as exc:  # noqa: BLE001 — render failures bubble up
        logger.exception("PDF render failed")
        raise CVGenerationError("CV_RENDER_FAILED", str(exc), 500) from exc

    # Step 5 — validate
    if not pdf_bytes:
        raise CVGenerationError("CV_RENDER_FAILED", "empty PDF byte stream", 500)
    if not aggregate.experiences:
        logger.warning("Profile %s has no experiences", aggregate.profile_id)
    if not aggregate.skills:
        logger.warning("Profile %s has no skills", aggregate.profile_id)
    if len(summary.split()) < 30:
        logger.info("Summary for %s is short (%d words)", aggregate.profile_id, len(summary.split()))

    # Step 6 — upload
    cv_id = _new_cv_id()
    try:
        file_url = upload_pdf(cv_id, pdf_bytes)
    except StorageError as exc:
        raise CVGenerationError("CV_STORAGE_FAILED", str(exc), 502) from exc

    # Step 7 — done. Node.js owns the UserCV insert; we just hand back
    # the cvId so it can use it as `_id`.
    cv_field_target = {
        "renderedSections": [k for k, v in selected.items() if v],
        "skillIds": [s.skill_id for s in ordered_skills],
        "experienceIds": [e.experience_id for e in ordered_experiences],
        "targetField": request.get("targetField", ""),
        "opportunityKeywords": opportunity_keywords,
        "matchedSkillIds": sorted(matched_skill_ids),
    }

    return {
        "cvId": cv_id,
        "fileUrl": file_url,
        "fileFormat": "pdf",
        "cvFieldTarget": cv_field_target,
    }
