"""§6.6 "WHY THIS COURSE?" + pathway rationale generator.

Structural twin of `cv-generation/services/summary_generator.py`. Same
imports shape, same `GENERIC_FILLER` denylist (extended), same
three-tier fallback (LLM → strip filler → fact-pack template), same
short-output guard (< 8 words → fall through).

Two public functions:
- `explain_resource(...)` — drives the §6.2.4 dashboard's "WHY THIS
  COURSE?" panel verbatim.
- `explain_pathway(...)` — header for the whole pathway.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from config import HF_SUMMARY_MAX_NEW_TOKENS
from models.db_models import (
    OpportunitySummary,
    ProfileSummary,
    ResourceCandidate,
    SkillGap,
)
from services.ai_model_manager import ai_models

logger = logging.getLogger(__name__)

# Filler phrases that small instruction-tuned LMs reliably emit. We
# strip these before checking the output length — copied verbatim from
# cv-generation, then augmented with the upskilling-specific filler the
# Flan-T5 base loves to produce.
GENERIC_FILLER = [
    "highly motivated",
    "extensive experience",
    "results-driven",
    "team player",
    "self-starter",
    "go-getter",
    "with a passion for",
    "passionate about",
    "highly recommended",
    "industry-leading",
    "cutting-edge",
    "world-class",
    "best-in-class",
]


def _strip_filler(text: str) -> str:
    out = text
    for phrase in GENERIC_FILLER:
        out = re.sub(rf"\b{re.escape(phrase)}\b[, ]*", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+,", ",", out)
    out = re.sub(r"^\W+", "", out)
    return out.strip()


def _run_llm(prompt: str) -> str:
    pipe = ai_models.summary_pipeline
    if pipe is None:
        return ""
    try:
        result = pipe(
            prompt,
            max_new_tokens=HF_SUMMARY_MAX_NEW_TOKENS,
            do_sample=False,
        )
        text = result[0].get("generated_text", "") if result else ""
        return _strip_filler(text)
    except Exception as exc:  # noqa: BLE001 — non-fatal
        logger.warning("explanation generation failed: %s", exc)
        return ""


def _profile_top_relevant_skills(profile: ProfileSummary, hint_text: str, n: int = 3) -> list[str]:
    """Return up to n skill names from the profile that share keywords
    with the hint text. Falls back to primary skills if nothing matches.
    """
    hint_terms = {w.lower() for w in re.split(r"\W+", hint_text) if len(w) > 2}
    matches: list[str] = []
    for s in profile.skill_state.declared:
        if any(w in hint_terms for w in s.name.lower().split()):
            matches.append(s.name)
        if len(matches) >= n:
            return matches
    if matches:
        return matches
    return [s.name for s in profile.skill_state.declared if s.classification == "primary"][:n]


def explain_resource(
    resource: ResourceCandidate,
    missing_skill: str,
    profile: ProfileSummary,
    opportunity: Optional[OpportunitySummary] = None,
) -> str:
    """1-2 sentence rationale naming the gap and the worker's existing
    relevant skills. Never empty — falls through to a fact-pack sentence
    when the LLM is unavailable.
    """
    relevant_skills = _profile_top_relevant_skills(
        profile, f"{resource.title} {resource.description}"
    )
    skills_str = ", ".join(relevant_skills) if relevant_skills else "your existing skills"
    target = opportunity.title if opportunity else "general upskilling"

    prompt = (
        "Write a 1-2 sentence explanation for a CV/upskilling app telling "
        "the worker why this learning resource was chosen for them. Use "
        "only the facts below. Do not mention the worker by name.\n"
        f"Target gap: {missing_skill}\n"
        f"Resource: {resource.title} ({resource.provider}, {resource.difficultyLevel})\n"
        f"Worker's relevant existing skills: {skills_str}\n"
        f"Target opportunity: {target}\n"
        "Constraints: do not invent credentials or duration. No filler "
        "phrases. Two sentences maximum."
    )
    text = _run_llm(prompt)
    if text and len(text.split()) >= 8:
        return text

    # Last-resort fact-pack: deterministic, always non-empty.
    diff = (resource.difficultyLevel or "beginner").capitalize()
    return f"Bridges the {missing_skill} gap. {diff}-level {resource.type} from {resource.provider}."


def explain_pathway(
    deficit: SkillGap,
    ordered_resources: list[ResourceCandidate],
    profile: ProfileSummary,
    opportunity: Optional[OpportunitySummary] = None,
    missing_skills_override: Optional[list[str]] = None,
) -> str:
    """2-3 sentence header for the whole pathway."""
    missing = missing_skills_override if missing_skills_override is not None else deficit.missing
    if not missing or not ordered_resources:
        return "No skill gaps detected — your profile already covers the requested skills."

    target = opportunity.title if opportunity else "general upskilling"
    primary_skills = [
        s.name for s in profile.skill_state.declared if s.classification == "primary"
    ][:3]
    strengths = ", ".join(primary_skills) if primary_skills else "your existing skills"
    sequence_titles = [r.title for r in ordered_resources[:5]]

    prompt = (
        "Write a 2-3 sentence overview for an upskilling pathway. Use "
        "only the facts.\n"
        f"Missing skills (in order): {missing}\n"
        f"Worker's strengths: {strengths}\n"
        f"Target opportunity: {target}\n"
        f"Resource sequence: {sequence_titles}\n"
        f"Number of resources: {len(ordered_resources)}\n"
        "Constraints: third person, no invented credentials, no filler. "
        "Mention how the sequence flows from foundational to advanced where relevant."
    )
    text = _run_llm(prompt)
    if text and len(text.split()) >= 8:
        return text

    skills_str = ", ".join(missing)
    return (
        f"Pathway covering {len(missing)} missing skill(s): {skills_str}. "
        f"{len(ordered_resources)} resources ordered foundational to advanced."
    )
