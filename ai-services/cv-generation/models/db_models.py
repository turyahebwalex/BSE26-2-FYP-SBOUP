"""Plain dataclasses representing the joined profile state.

These are not the Mongo schemas — they're the in-memory shape the AI
services and renderers consume. Built by `services/profile_service.py`.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class SkillRef:
    skill_id: str
    name: str
    category: str
    classification: str            # primary | secondary
    proficiency: str               # beginner | intermediate | advanced | expert


@dataclass
class ExperienceRef:
    experience_id: str
    job_title: str
    company: str
    category: str
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    duration_months: int
    description: str


@dataclass
class EducationRef:
    education_id: str
    institution: str
    qualification: str
    field_of_study: str
    start_year: Optional[int]
    end_year: Optional[int]


@dataclass
class PortfolioItem:
    title: str
    description: str
    file_url: str
    file_type: str


@dataclass
class PreferenceRef:
    work_style: str = ""
    remote_preference: str = ""
    learning_willingness: str = ""
    personality_traits: list[dict[str, str]] = field(default_factory=list)


@dataclass
class UserRef:
    user_id: str
    full_name: str = ""
    email: str = ""
    phone: str = ""


@dataclass
class OpportunityRef:
    opportunity_id: str
    title: str
    description: str
    required_skill_names: list[str] = field(default_factory=list)


@dataclass
class ProfileAggregate:
    profile_id: str
    user: UserRef
    title: str
    bio: str
    location: str
    portfolio: list[PortfolioItem] = field(default_factory=list)
    skills: list[SkillRef] = field(default_factory=list)
    experiences: list[ExperienceRef] = field(default_factory=list)
    education: list[EducationRef] = field(default_factory=list)
    preference: PreferenceRef = field(default_factory=PreferenceRef)

    def primary_skill_names(self, n: int = 3) -> list[str]:
        return [s.name for s in self.skills if s.classification == "primary"][:n]

    def most_recent_experience(self) -> Optional[ExperienceRef]:
        sorted_exp = sorted(
            self.experiences,
            key=lambda e: (e.end_date or datetime.max, e.start_date or datetime.min),
            reverse=True,
        )
        return sorted_exp[0] if sorted_exp else None


@dataclass
class CVRenderInputs:
    """What every template renderer receives."""

    aggregate: ProfileAggregate
    summary: str                   # AI-generated or bio-verbatim
    ordered_skills: list[SkillRef]
    ordered_experiences: list[ExperienceRef]
    selected: dict[str, bool]      # which sections to include
    opportunity: Optional[OpportunityRef] = None
    matched_skill_ids: set[str] = field(default_factory=set)
