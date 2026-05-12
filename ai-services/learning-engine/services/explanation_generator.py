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


# Flan-T5-small is small enough to fall into degenerate token loops even
# with no_repeat_ngram_size enabled — typically a single skill name gets
# tiled across the output like "Data Analysis, Data Analysis, Data
# Analysis...". This guard checks for two failure modes:
#   1. Any single non-stopword token taking up an outsized share of the
#      output (>= 25% of content tokens) signals a single-word loop.
#   2. Excessive comma-separated repetition of the same chunk signals a
#      list-loop. The combined rule catches both flavours cleanly.
_STOP_TOKENS = {"a", "an", "the", "of", "and", "or", "in", "to", "for", "with",
                "is", "are", "be", "by", "on", "as", "at", "from", "you", "your"}


def _is_degenerate(text: str) -> bool:
    if not text:
        return True
    tokens = [t.lower() for t in re.findall(r"[A-Za-z]+", text)]
    content = [t for t in tokens if t not in _STOP_TOKENS]
    if not content:
        return True
    counts: dict[str, int] = {}
    for t in content:
        counts[t] = counts.get(t, 0) + 1
    max_share = max(counts.values()) / len(content)
    # 25% threshold lets a normal sentence repeat a key term once or twice
    # without false-flagging, but catches the degenerate "term, term, term"
    # loop where a single word becomes >50% of the output.
    if max_share >= 0.25 and max(counts.values()) >= 4:
        return True
    # List-loop: the same chunk between commas appears 3+ times.
    chunks = [c.strip().lower() for c in re.split(r"[,.;]", text) if c.strip()]
    if chunks:
        chunk_counts: dict[str, int] = {}
        for c in chunks:
            chunk_counts[c] = chunk_counts.get(c, 0) + 1
        if max(chunk_counts.values()) >= 3:
            return True
    return False


def _run_llm(prompt: str) -> str:
    pipe = ai_models.summary_pipeline
    if pipe is None:
        return ""
    try:
        result = pipe(
            prompt,
            max_new_tokens=HF_SUMMARY_MAX_NEW_TOKENS,
            do_sample=False,
            # no_repeat_ngram_size kills the most common Flan-T5 failure
            # mode: emitting the same 3-token sequence over and over.
            # repetition_penalty further discourages already-emitted
            # tokens. Both kwargs are forwarded to the underlying
            # transformers generate() call.
            no_repeat_ngram_size=3,
            repetition_penalty=1.3,
        )
        text = result[0].get("generated_text", "") if result else ""
        cleaned = _strip_filler(text)
        # Even with the decoder constraints above, Flan-T5-small can still
        # produce a degenerate list-loop when the prompt itself contains
        # comma-separated terms. Reject it here so the caller falls
        # through to the deterministic fact-pack instead of writing
        # garbage to the worker's screen.
        if _is_degenerate(cleaned):
            logger.info("rejected degenerate explanation: %r", cleaned[:120])
            return ""
        return cleaned
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
    skills_str = (
        ", ".join(relevant_skills)
        if relevant_skills
        else "their existing skills"
    )
    target = opportunity.title if opportunity else "general upskilling"

    prompt = (
        "Explain in 1-2 sentences why this resource was chosen to close "
        "the worker's skill gap. Write in third person. Do not invent "
        "durations or credentials.\n\n"
        f"Skill to bridge: {missing_skill}.\n"
        f"Worker already knows: {skills_str}.\n"
        f"Selected resource: {resource.title} from {resource.provider}, "
        f"{resource.difficultyLevel} level.\n"
        f"Target role: {target}."
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
    strengths = ", ".join(primary_skills) if primary_skills else "their existing skills"
    # Format facts as prose, not as Python list literals. Flan-T5-small
    # tends to echo bracketed lists verbatim, which is what produced the
    # "Data Analysis, Data Analysis, Data Analysis..." loop the worker saw.
    missing_phrase = (
        missing[0]
        if len(missing) == 1
        else f"{', '.join(missing[:-1])} and {missing[-1]}"
    )
    first_titles = [r.title for r in ordered_resources[:3]]
    first_titles_phrase = (
        first_titles[0]
        if len(first_titles) == 1
        else ", ".join(first_titles[:-1]) + f", and {first_titles[-1]}"
    ) if first_titles else "the curated set"

    prompt = (
        "Summarise an upskilling pathway in 2-3 sentences. "
        "Mention the skill gap the pathway closes, the worker's relevant "
        "strengths, and how the resource sequence flows from foundational "
        "to advanced. Write in third person. Do not list resources "
        "individually. Do not invent durations or credentials.\n\n"
        f"Skill gap to close: {missing_phrase}.\n"
        f"Worker already has: {strengths}.\n"
        f"Target role: {target}.\n"
        f"Pathway starts with {first_titles_phrase} "
        f"and continues for a total of {len(ordered_resources)} resources."
    )
    text = _run_llm(prompt)
    if text and len(text.split()) >= 8:
        return text

    skills_str = ", ".join(missing)
    return (
        f"Pathway covering {len(missing)} missing skill(s): {skills_str}. "
        f"{len(ordered_resources)} resources ordered foundational to advanced."
    )
