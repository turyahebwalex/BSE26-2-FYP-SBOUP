"""Professional summary generation (Model 3 — Flan-T5-small).

Bio rule (per docs/cv-generation-spec.md §2):
- bio ≥ 50 chars: render verbatim. The LLM does not rewrite human content.
- bio < 50 chars or empty: generate from a structured prompt.

The denylist below strips a handful of generic-filler phrases that small
LLMs reliably emit regardless of prompt — without this, every CV says
"highly motivated professional with extensive experience" verbatim.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from config import HF_SUMMARY_MAX_NEW_TOKENS
from models.db_models import OpportunityRef, ProfileAggregate
from services.ai_model_manager import ai_models

logger = logging.getLogger(__name__)

BIO_VERBATIM_THRESHOLD = 50

# Phrases that small instruction-tuned LMs emit as filler. Stripped
# case-insensitively from the model output, then surrounding
# punctuation is normalised.
GENERIC_FILLER = [
    "highly motivated",
    "extensive experience",
    "results-driven",
    "team player",
    "self-starter",
    "go-getter",
    "with a passion for",
    "passionate about",
]


def _strip_filler(text: str) -> str:
    out = text
    for phrase in GENERIC_FILLER:
        out = re.sub(rf"\b{re.escape(phrase)}\b[, ]*", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+,", ",", out)
    out = re.sub(r"^\W+", "", out)
    return out.strip()


def _baseline_prompt(p: ProfileAggregate) -> str:
    most_recent = p.most_recent_experience()
    primary = ", ".join(p.primary_skill_names(3)) or "various practical skills"
    role = (
        f"Most recent role: {most_recent.job_title} at "
        f"{most_recent.company} for {most_recent.duration_months} months."
        if most_recent
        else "No prior formal roles listed."
    )
    return (
        "Write a 2-3 sentence professional summary in third person for a CV.\n"
        f"Person: {p.title or 'a skilled worker'}. "
        f"Location: {p.location or 'unspecified'}.\n"
        f"Top skills: {primary}.\n"
        f"{role}\n"
        "Constraints: do not invent credentials, certifications, or employers. "
        "Use only the facts provided."
    )


def _tailored_prompt(
    p: ProfileAggregate, opp: OpportunityRef, opp_keywords: list[str]
) -> str:
    matched = [s.name for s in p.skills if s.name.lower() in {k.lower() for k in opp.required_skill_names}]
    matched_str = ", ".join(matched) if matched else "transferable practical skills"
    keywords = ", ".join(opp_keywords[:3]) if opp_keywords else opp.title
    return (
        "Write a 2-3 sentence professional summary in third person for a CV "
        f"targeting a {opp.title} role.\n"
        f"Person: {p.title or 'a skilled worker'}.\n"
        f"Relevant skills: {matched_str}.\n"
        f"Top role keywords: {keywords}.\n"
        "Constraints: do not invent credentials. Use only the facts provided."
    )


def _run_llm(prompt: str) -> str:
    if ai_models.summary_pipeline is None:
        return ""
    try:
        result = ai_models.summary_pipeline(
            prompt,
            max_new_tokens=HF_SUMMARY_MAX_NEW_TOKENS,
            do_sample=False,
        )
        text = result[0].get("generated_text", "") if result else ""
        return _strip_filler(text)
    except Exception as exc:  # noqa: BLE001 — non-fatal
        logger.warning("Summary generation failed: %s", exc)
        return ""


def generate_summary(
    profile: ProfileAggregate,
    opportunity: Optional[OpportunityRef] = None,
    opportunity_keywords: Optional[list[str]] = None,
) -> str:
    """Returns the final summary string for the CV header.

    Falls back through a deterministic chain so we never produce empty
    output: bio → LLM → fact-pack sentence built from structured data.
    """
    bio = (profile.bio or "").strip()
    if len(bio) >= BIO_VERBATIM_THRESHOLD:
        return bio

    prompt = (
        _tailored_prompt(profile, opportunity, opportunity_keywords or [])
        if opportunity is not None
        else _baseline_prompt(profile)
    )
    summary = _run_llm(prompt)
    if summary and len(summary.split()) >= 8:
        return summary

    # Last-resort fact-pack so we always emit *something* readable.
    role = profile.title or "Skilled worker"
    loc = f" based in {profile.location}" if profile.location else ""
    skills = profile.primary_skill_names(3)
    skills_str = (
        f" with experience in {', '.join(skills)}" if skills else ""
    )
    return f"{role}{loc}{skills_str}.".strip()
