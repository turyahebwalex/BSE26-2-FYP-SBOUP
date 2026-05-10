"""Skill / keyword extraction (Model 2 — skill NER, with LLM fallback).

Validates extracted spans against the existing Skill catalog so the
output uses canonical skill names already known to the rest of the
platform (the catalog is ESCO-populated by the skillSuggester service).
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from typing import Optional

from database.mongo_client import get_db
from services.ai_model_manager import ai_models

logger = logging.getLogger(__name__)

NER_SCORE_THRESHOLD = 0.5
MIN_TOKEN_LEN = 2
MAX_KEYWORDS = 10


def _normalise(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


async def _validate_against_catalog(names: list[str]) -> list[str]:
    """Replace extracted strings with their canonical Skill.skillName when
    a case-insensitive match exists. Unknown spans pass through unchanged.
    """
    if not names:
        return []
    db = get_db()
    canonical: list[str] = []
    seen_lower: set[str] = set()
    # One query per name keeps logic simple; lists are short (≤10).
    for raw in names:
        norm = _normalise(raw)
        if not norm or norm.lower() in seen_lower:
            continue
        regex = re.compile(f"^{re.escape(norm)}$", re.IGNORECASE)
        skill = await db.skills.find_one({"skillName": regex})
        canonical.append(skill["skillName"] if skill else norm)
        seen_lower.add(norm.lower())
    return canonical


def _ner_extract(text: str) -> list[str]:
    pipe = ai_models.ner_pipeline
    if pipe is None:
        return []
    try:
        spans = pipe(text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("NER inference failed: %s", exc)
        return []
    counts: Counter[str] = Counter()
    for span in spans:
        if span.get("score", 0) < NER_SCORE_THRESHOLD:
            continue
        word = _normalise(span.get("word", ""))
        if len(word) < MIN_TOKEN_LEN:
            continue
        counts[word] += 1
    return [w for w, _ in counts.most_common()]


def _llm_extract(text: str) -> list[str]:
    pipe = ai_models.summary_pipeline
    if pipe is None:
        return []
    prompt = (
        "Extract a JSON array of distinct, short skill names from the "
        "following job description. Output only the JSON array, no prose.\n"
        f"Description: {text}"
    )
    try:
        result = pipe(prompt, max_new_tokens=120, do_sample=False)
        raw = result[0].get("generated_text", "") if result else ""
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return []
        items = json.loads(match.group(0))
        return [_normalise(str(x)) for x in items if str(x).strip()]
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM keyword extraction failed: %s", exc)
        return []


async def extract_keywords(opportunity_text: str) -> list[str]:
    """Returns up to MAX_KEYWORDS canonical skill names derived from the
    opportunity text. Empty list if nothing reliable was found.
    """
    text = _normalise(opportunity_text)
    if not text:
        return []

    candidates = _ner_extract(text)
    if not candidates:
        candidates = _llm_extract(text)

    canonical = await _validate_against_catalog(candidates[:MAX_KEYWORDS])
    return canonical[:MAX_KEYWORDS]


def opportunity_text(opportunity) -> str:
    """Helper: assemble the text we run NER over."""
    parts = [opportunity.title, opportunity.description]
    if opportunity.required_skill_names:
        parts.append(", ".join(opportunity.required_skill_names))
    return ". ".join(p for p in parts if p)
