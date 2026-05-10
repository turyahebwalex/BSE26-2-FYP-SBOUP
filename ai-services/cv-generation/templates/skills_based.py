"""Skills-based template: header → summary → competency matrix → condensed
experience → education.
"""
from __future__ import annotations

from collections import defaultdict
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

    if inputs.selected.get("skillsAndCompetencies", True) and inputs.ordered_skills:
        story.append(section_header("Core Competencies"))
        grouped: dict[str, list[str]] = defaultdict(list)
        for s in inputs.ordered_skills:
            mark = "★ " if s.skill_id in inputs.matched_skill_ids else ""
            level = f" ({s.proficiency})" if s.proficiency else ""
            grouped[s.category or "Other"].append(f"{mark}{s.name}{level}")
        for category, items in grouped.items():
            line = f"<b>{category}:</b> {' · '.join(items)}"
            story.append(Paragraph(line, STYLES["body"]))

    if inputs.selected.get("workExperience", True) and inputs.ordered_experiences:
        story.append(section_header("Work Experience"))
        for exp in inputs.ordered_experiences:
            title = f"<b>{exp.job_title}</b>"
            if exp.company:
                title += f" — {exp.company}"
            duration_bits = []
            if exp.start_date:
                start = exp.start_date.strftime("%b %Y")
                end = exp.end_date.strftime("%b %Y") if exp.end_date else "Present"
                duration_bits.append(f"{start} – {end}")
            elif exp.duration_months:
                duration_bits.append(f"{exp.duration_months} months")
            if duration_bits:
                title += f"  <font color='#6B7280'>({duration_bits[0]})</font>"
            story.append(Paragraph(title, STYLES["entry_title"]))
            story.append(Spacer(1, 2))

    if inputs.selected.get("education", True) and p.education:
        story.append(section_header("Education"))
        for edu in p.education:
            line = f"<b>{edu.qualification}</b>"
            if edu.institution:
                line += f" — {edu.institution}"
            if edu.start_year:
                year = f"{edu.start_year}"
                if edu.end_year:
                    year += f" – {edu.end_year}"
                line += f"  <font color='#6B7280'>({year})</font>"
            story.append(Paragraph(line, STYLES["entry_title"]))

    doc.build(story)
    return buffer.getvalue()
