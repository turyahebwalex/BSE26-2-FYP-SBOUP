"""Portfolio-focused template: header → summary → portfolio → skills →
condensed experience → education.
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

    if p.portfolio:
        story.append(section_header("Portfolio Highlights"))
        for item in p.portfolio:
            title = f"<b>{item.title or 'Project'}</b>"
            story.append(Paragraph(title, STYLES["entry_title"]))
            if item.description:
                story.append(Paragraph(item.description, STYLES["body"]))
            if item.file_url:
                story.append(
                    Paragraph(
                        f"<font color='#F97316'>{item.file_url}</font>",
                        STYLES["entry_subtitle"],
                    )
                )
            story.append(Spacer(1, 4))

    if inputs.selected.get("skillsAndCompetencies", True) and inputs.ordered_skills:
        story.append(section_header("Skills & Competencies"))
        chips = []
        for s in inputs.ordered_skills:
            mark = "★ " if s.skill_id in inputs.matched_skill_ids else ""
            chips.append(f"{mark}{s.name}")
        story.append(Paragraph(" · ".join(chips), STYLES["body"]))

    if inputs.selected.get("workExperience", True) and inputs.ordered_experiences:
        story.append(section_header("Work Experience"))
        for exp in inputs.ordered_experiences:
            title = f"<b>{exp.job_title}</b>"
            if exp.company:
                title += f" — {exp.company}"
            story.append(Paragraph(title, STYLES["entry_title"]))
            if exp.description:
                story.append(Paragraph(exp.description, STYLES["body"]))
            story.append(Spacer(1, 2))

    if inputs.selected.get("education", True) and p.education:
        story.append(section_header("Education"))
        for edu in p.education:
            line = f"<b>{edu.qualification}</b>"
            if edu.institution:
                line += f" — {edu.institution}"
            story.append(Paragraph(line, STYLES["entry_title"]))

    doc.build(story)
    return buffer.getvalue()
