"""Shared layout primitives for the three CV templates.

Brand colours mirror the mobile UI: orange #F97316 accents, dark
#1F2937 body text, light #FFF7ED section headers.
"""
from __future__ import annotations

from io import BytesIO
from typing import Iterable

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

BRAND_PRIMARY = HexColor("#F97316")
BRAND_DARK = HexColor("#1F2937")
SECTION_BG = HexColor("#FFF7ED")
TEXT_BODY = HexColor("#374151")
TEXT_MUTED = HexColor("#6B7280")

PAGE_MARGIN = 20 * mm


def _build_styles():
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "name",
            parent=base["Title"],
            fontSize=22,
            leading=26,
            textColor=BRAND_DARK,
            spaceAfter=2,
        ),
        "title": ParagraphStyle(
            "title",
            parent=base["Normal"],
            fontSize=12,
            textColor=BRAND_PRIMARY,
            spaceAfter=4,
        ),
        "contact": ParagraphStyle(
            "contact",
            parent=base["Normal"],
            fontSize=9,
            textColor=TEXT_MUTED,
            spaceAfter=10,
        ),
        "section_header": ParagraphStyle(
            "section_header",
            parent=base["Heading2"],
            fontSize=11,
            textColor=BRAND_PRIMARY,
            backColor=SECTION_BG,
            borderPadding=(4, 6, 4, 6),
            spaceAfter=6,
            spaceBefore=10,
            leading=14,
            uppercase=1,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontSize=10,
            leading=13,
            textColor=TEXT_BODY,
            spaceAfter=4,
        ),
        "entry_title": ParagraphStyle(
            "entry_title",
            parent=base["Normal"],
            fontSize=11,
            textColor=BRAND_DARK,
            leading=13,
            spaceAfter=1,
        ),
        "entry_subtitle": ParagraphStyle(
            "entry_subtitle",
            parent=base["Normal"],
            fontSize=9,
            textColor=TEXT_MUTED,
            spaceAfter=2,
        ),
        "skill_chip": ParagraphStyle(
            "skill_chip",
            parent=base["Normal"],
            fontSize=10,
            textColor=BRAND_DARK,
            spaceAfter=2,
        ),
    }


STYLES = _build_styles()


def section_header(label: str) -> Paragraph:
    return Paragraph(label.upper(), STYLES["section_header"])


def hr() -> HRFlowable:
    return HRFlowable(
        width="100%",
        thickness=0.5,
        color=BRAND_PRIMARY,
        spaceBefore=2,
        spaceAfter=4,
    )


def make_doc(buffer: BytesIO) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        title="SBOUP CV",
    )


def header_block(name: str, title: str, contact_lines: Iterable[str]):
    items = [
        Paragraph(name or "Unnamed", STYLES["name"]),
        Paragraph(title or "", STYLES["title"]) if title else Spacer(1, 0),
    ]
    contact_str = "  ·  ".join([c for c in contact_lines if c])
    if contact_str:
        items.append(Paragraph(contact_str, STYLES["contact"]))
    items.append(hr())
    return [item for item in items if item is not None]
