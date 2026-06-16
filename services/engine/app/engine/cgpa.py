"""CGPA computation. Pure functions over Course lists + a grading-rules dict.

The grading dict is the parsed `grading.yaml -> gpa_scale`. We never hardcode
the scale here so that a per-cohort rulebook change flows through without code
edits. That is the whole point of the rulebook-as-source-of-truth design.
"""
from __future__ import annotations

from ..models import Course, CgpaResult


def compute_cgpa(courses: list[Course], gpa_scale: dict) -> CgpaResult:
    """Compute CGPA.

    Rules (from grading.yaml, AY2025-26):
      - Only LETTER-GRADED courses count toward CGPA.
      - A course with FGO applied is EXCLUDED from CGPA (Pass/NR carries no points).
      - Failed (F) letter-graded courses DO count (grade point 0.00), unless FGO'd.
      - Courses still in progress (grade is None) are excluded.
    """
    grade_points: dict[str, float] = gpa_scale["grades"]
    non_gpa = set(gpa_scale.get("non_gpa_outcomes", []))

    quality_points = 0.0
    graded_au = 0
    excluded_fgo_au = 0

    for c in courses:
        if c.fgo_applied:
            excluded_fgo_au += c.au
            continue
        if not c.is_graded:
            continue
        if c.grade in non_gpa:
            continue
        if c.grade not in grade_points:
            raise ValueError(f"Unknown grade {c.grade!r} for {c.code} — not in cohort gpa_scale.")
        quality_points += grade_points[c.grade] * c.au
        graded_au += c.au

    cgpa = round(quality_points / graded_au, 2) if graded_au else 0.0
    return CgpaResult(
        cgpa=cgpa,
        graded_au=graded_au,
        quality_points=round(quality_points, 4),
        excluded_fgo_au=excluded_fgo_au,
    )
