"""Skill NER over `Profile.bio` and resource descriptions, validated
against the canonical `skills` collection.

Structural twin of `ai-services/cv-generation/services/keyword_extractor.py`:
same NER-then-LLM-fallback chain, same `_normalise`, same
`_validate_against_catalog`, same MAX_KEYWORDS guardrail.

Two public entry points:
- `extract_from_bio()` — augments the worker's effective skill set
  (CAL001).
- `extract_resource_skill()` — tags `bridgesSkill` for provider results
  that don't declare it.

Validation rule (mandatory): every NER span must round-trip through
`_validate_against_catalog`. Spans that don't match a canonical
`Skill.skillName` are dropped, not invented.
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from typing import Optional

from database.mongo_client import get_db
from models.db_models import ProfileSummary, ResourceCandidate, SkillRef
from services.ai_model_manager import ai_models

logger = logging.getLogger(__name__)

NER_SCORE_THRESHOLD = 0.5
MIN_TOKEN_LEN = 2
MAX_KEYWORDS = 10
MAX_BIO_SKILLS = 8


def _normalise(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


async def _validate_against_catalog(names: list[str]) -> list[str]:
    """Replace extracted strings with their canonical `Skill.skillName`
    when a case-insensitive match exists. Unknown spans are dropped —
    the learning engine MUST NOT invent skill names (see §14: "Do not
    invent skill names").
    """
    if not names:
        return []
    db = get_db()
    canonical: list[str] = []
    seen_lower: set[str] = set()
    for raw in names:
        norm = _normalise(raw)
        if not norm or norm.lower() in seen_lower:
            continue
        regex = re.compile(f"^{re.escape(norm)}$", re.IGNORECASE)
        skill = await db.skills.find_one({"skillName": regex})
        if skill is not None:
            canonical.append(skill["skillName"])
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
        "following text. Output only the JSON array, no prose.\n"
        f"Text: {text}"
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
        logger.warning("LLM skill extraction failed: %s", exc)
        return []


async def _extract_canonical(text: str, limit: int) -> list[str]:
    text = _normalise(text)
    if not text:
        return []
    candidates = _ner_extract(text)
    if not candidates:
        candidates = _llm_extract(text)
    return (await _validate_against_catalog(candidates[:MAX_KEYWORDS]))[:limit]


async def extract_from_bio(profile: ProfileSummary) -> list[SkillRef]:
    """Returns SkillRef rows for skills inferred from `profile.bio`,
    excluding any skill the profile already declares as a ProfileSkill.

    These rows are NEVER persisted — they live only for the request
    (see §6.7 constraint).
    """
    if not profile.bio:
        return []
    declared_lower = {s.name.lower() for s in profile.skill_state.declared}
    canonical = await _extract_canonical(profile.bio, MAX_BIO_SKILLS)
    out: list[SkillRef] = []
    for name in canonical:
        if name.lower() in declared_lower:
            continue
        out.append(
            SkillRef(
                skill_id="",
                name=name,
                category="Other",
                classification="bio_inferred",
                proficiency="intermediate",
            )
        )
    return out


async def extract_resource_skill(resource: ResourceCandidate) -> Optional[str]:
    """Returns the highest-confidence canonical skill name for a resource,
    or None. Called only when the provider response did not declare a
    `bridgesSkill` already — keeps NER cost amortised.
    """
    if resource.bridgesSkill:
        return resource.bridgesSkill
    text = ". ".join(p for p in [resource.title, resource.description] if p)
    if not text:
        return None
    canonical = await _extract_canonical(text, 1)
    return canonical[0] if canonical else None
