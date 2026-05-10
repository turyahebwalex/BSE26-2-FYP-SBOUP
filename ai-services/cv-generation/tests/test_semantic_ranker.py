"""Skill ranking is deterministic — testable without loading models.
The experience ranker requires a real embedding pass, so it's covered
by the integration test instead.
"""
from models.db_models import OpportunityRef, SkillRef
from services.semantic_ranker import rank_skills


def _skill(name, classification="primary", sid=None):
    return SkillRef(
        skill_id=sid or name,
        name=name,
        category="Trade",
        classification=classification,
        proficiency="intermediate",
    )


def test_baseline_puts_primary_first():
    skills = [
        _skill("Plumbing", "secondary"),
        _skill("Carpentry", "primary"),
        _skill("Joinery", "primary"),
    ]
    ordered, matched = rank_skills(skills, opportunity=None)
    assert [s.name for s in ordered] == ["Carpentry", "Joinery", "Plumbing"]
    assert matched == set()


def test_tailored_puts_matched_primary_first():
    skills = [
        _skill("Plumbing", "secondary", "p1"),
        _skill("Carpentry", "secondary", "c1"),
        _skill("Joinery", "primary", "j1"),
    ]
    opp = OpportunityRef(
        opportunity_id="o",
        title="Site Carpenter",
        description="...",
        required_skill_names=["Carpentry"],
    )
    ordered, matched = rank_skills(skills, opp)
    assert ordered[0].name == "Carpentry"
    assert "c1" in matched
