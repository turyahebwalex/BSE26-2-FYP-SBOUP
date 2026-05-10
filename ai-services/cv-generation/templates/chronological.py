"""Chronological template: header → summary → experience → education → skills.

Experience is already pre-ordered by the orchestrator (semantic similarity
for tailored CVs, startDate desc for baseline).
"""
from __future__ import annotations

from io import BytesIO

from reportlab.platypus import Paragraph, Spacer

from models.db_models import CVRenderInputs
from templates.base_template import (
    STYLES,
    header_block,
    make_doc,
    section_header,
)


def render(inputs: CVRenderInputs) -> bytes:
    buffer = BytesIO()
    doc = make_doc(buffer)
    p = inputs.aggregate

    story = []
    story.extend(
        header_block(
            p.user.full_name or p.title,
            p.title,
            [p.location, p.user.email, p.user.phone],
        )
    )

    if inputs.summary:
        story.append(section_header("Professional Summary"))
        story.append(Paragraph(inputs.summary, STYLES["body"]))

    if inputs.selected.get("workExperience", True) and inputs.ordered_experiences:
        story.append(section_header("Work Experience"))
        for exp in inputs.ordered_experiences:
            title = f"<b>{exp.job_title}</b>"
            if exp.company:
                title += f" — {exp.company}"
            story.append(Paragraph(title, STYLES["entry_title"]))
            duration = ""
            if exp.start_date:
                start = exp.start_date.strftime("%b %Y")
                end = exp.end_date.strftime("%b %Y") if exp.end_date else "Present"
                duration = f"{start} – {end}"
            elif exp.duration_months:
                duration = f"{exp.duration_months} months"
            if duration:
                story.append(Paragraph(duration, STYLES["entry_subtitle"]))
            if exp.description:
                story.append(Paragraph(exp.description, STYLES["body"]))
            story.append(Spacer(1, 4))

    if inputs.selected.get("education", True) and inputs.aggregate.education:
        story.append(section_header("Education"))
        for edu in inputs.aggregate.education:
            line = f"<b>{edu.qualification}</b>"
            if edu.field_of_study:
                line += f" in {edu.field_of_study}"
            if edu.institution:
                line += f" — {edu.institution}"
            story.append(Paragraph(line, STYLES["entry_title"]))
            year_line = ""
            if edu.start_year:
                year_line = f"{edu.start_year}"
                if edu.end_year:
                    year_line += f" – {edu.end_year}"
            if year_line:
                story.append(Paragraph(year_line, STYLES["entry_subtitle"]))
            story.append(Spacer(1, 2))

    if inputs.selected.get("skillsAndCompetencies", True) and inputs.ordered_skills:
        story.append(section_header("Skills & Competencies"))
        chips = []
        for s in inputs.ordered_skills:
            mark = "★ " if s.skill_id in inputs.matched_skill_ids else ""
            level = f" ({s.proficiency})" if s.proficiency else ""
            chips.append(f"{mark}{s.name}{level}")
        story.append(Paragraph(" · ".join(chips), STYLES["body"]))

    if inputs.selected.get("communityWork", False):
        community = [
            e for e in inputs.ordered_experiences if e.category == "community"
        ]
        if community:
            story.append(section_header("Community Work"))
            for exp in community:
                story.append(
                    Paragraph(f"<b>{exp.job_title}</b>", STYLES["entry_title"])
                )
                if exp.description:
                    story.append(Paragraph(exp.description, STYLES["body"]))

    doc.build(story)
    return buffer.getvalue()
