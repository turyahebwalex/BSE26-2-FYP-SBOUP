"""Plain dataclasses representing the in-memory shapes the learning
engine works with.

These are NOT Mongo schemas — Mongoose owns those on the Node.js side.
They're the typed shapes our services build from raw documents and pass
to one another. Built by `services/profile_service.py`,
`services/match_consumer.py`, etc.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class SkillRef:
    skill_id: str
    name: str
    category: str = "Other"
    classification: str = "primary"          # primary | secondary | bio_inferred
    proficiency: str = "intermediate"        # beginner | intermediate | advanced | expert


@dataclass
class WorkerSkillState:
    """The skills the worker effectively has at request time.

    `declared` are real ProfileSkill rows. `bio_inferred` are NER hits on
    `Profile.bio` that survive `_validate_against_catalog`. They count
    toward fit but are NEVER persisted — the user's profile flow is the
    only place a ProfileSkill row gets written.
    """

    declared: list[SkillRef] = field(default_factory=list)
    bio_inferred: list[SkillRef] = field(default_factory=list)

    @property
    def all(self) -> list[SkillRef]:
        return [*self.declared, *self.bio_inferred]


@dataclass
class ProfileSummary:
    profile_id: str
    user_id: str
    title: str
    bio: str
    location: str
    skill_state: WorkerSkillState = field(default_factory=WorkerSkillState)


@dataclass
class OpportunitySummary:
    opportunity_id: str
    title: str
    description: str
    category: str
    experience_level: str = "any"            # entry | mid | senior | any
    required_skill_names: list[str] = field(default_factory=list)


@dataclass
class RequiredSkill:
    """A required skill annotated with the opportunity-derived
    proficiency level so the gap analyser can flag shortfalls.
    """

    name: str
    requiredLevel: str = "intermediate"      # camelCase to mirror API response keys


@dataclass
class SkillGap:
    """The gap analyser's complete output for one (profile, opportunity).

    `missing` is the analyser's local opinion of which required skills
    the worker lacks. In opportunity-driven mode it's used only for
    enrichment — the orchestrator overrides it with the matching-engine's
    authoritative list per the §6.0 consistency contract. `aliasHints`
    and `proficiencyShortfalls` always survive into the response.
    """

    missing: list[str] = field(default_factory=list)
    proficiencyShortfalls: list[dict[str, str]] = field(default_factory=list)
    aliasHints: list[dict[str, Any]] = field(default_factory=list)
    bioInferredSkills: list[str] = field(default_factory=list)
    totalGapScore: float = 0.0


@dataclass
class ResourceCandidate:
    """One learning resource normalised across providers."""

    title: str
    url: str
    provider: str
    cost: float = 0.0                        # in USD; 0.0 = free
    priceLabel: str = "Free"
    estimatedDuration: str = "Varies"
    type: str = "course"                     # video | course | article | tutorial
    description: str = ""
    rating: Optional[float] = None
    reviewCount: int = 0
    difficultyLevel: str = "beginner"        # beginner | intermediate | advanced
    relevanceScore: float = 0.0
    qualityScore: float = 0.5
    costScore: float = 1.0
    difficultyScore: float = 1.0
    finalScore: float = 0.0
    bridgesSkill: str = ""

    def to_response_dict(self) -> dict[str, Any]:
        cost_value: Any = self.cost
        return {
            "title": self.title,
            "url": self.url,
            "provider": self.provider,
            "cost": cost_value,
            "priceLabel": self.priceLabel,
            "estimatedDuration": self.estimatedDuration,
            "type": self.type,
            "rating": self.rating,
            "difficultyLevel": self.difficultyLevel,
            "relevanceScore": round(self.relevanceScore, 3),
            "finalScore": round(self.finalScore, 3),
            "bridgesSkill": self.bridgesSkill,
            "isCompleted": False,
        }


@dataclass
class LearningPathDraft:
    """In-flight pathway state the orchestrator hands back to the API layer."""

    target_skill: str
    missing_skills: list[str]
    resources: list[ResourceCandidate] = field(default_factory=list)
    pathway_rationale: str = ""
    consistency_mode: str = "standalone"     # matching-engine | fallback | standalone


@dataclass
class MatchBreakdown:
    """The matching-engine /api/match/score response, normalised."""

    match_score: float
    missing_skills: list[str]
    breakdown: dict[str, Any]
    model_used: str = "ml"
    shortlist_probability: Optional[float] = None


@dataclass
class CategoryFit:
    category: str
    fitScore: float
    matchingOpportunityCount: int
    missingSkills: list[str] = field(default_factory=list)
    aliasHints: list[dict[str, Any]] = field(default_factory=list)
