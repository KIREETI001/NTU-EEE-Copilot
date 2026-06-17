"""Honours classification.

College of Engineering rule: Honours (Highest Distinction) requires CGPA >= 4.50
AND at least A- in the FYP. Driven by grading.yaml -> honours.
"""
from __future__ import annotations

from ..models import HonoursResult


def classify_honours(
    cgpa: float,
    fyp_grade: str | None,
    honours_rules: dict,
    gpa_scale: dict,
) -> HonoursResult:
    classes = honours_rules["classes"]
    notes: list[str] = []

    # classes are listed high -> low; pick the first whose band contains cgpa.
    classification = "Not classified"
    for band in classes:
        if band["min_cgpa"] <= cgpa <= band["max_cgpa"]:
            classification = band["name"]
            break

    # Engineering FYP gate on the top class. Compare by grade POINTS from the
    # rulebook gpa_scale (no hardcoded grade order in code — the one rule).
    fyp_rule = honours_rules.get("engineering_fyp_rule")
    if fyp_rule and classification in fyp_rule["applies_to"]:
        grade_points: dict[str, float] = gpa_scale["grades"]
        min_fyp = fyp_rule["min_fyp_grade"]
        if fyp_grade is None:
            notes.append(
                f"FYP grade unknown — Highest Distinction is conditional on FYP >= {min_fyp}."
            )
        elif fyp_grade not in grade_points:
            raise ValueError(f"Unknown FYP grade {fyp_grade!r} — not in cohort gpa_scale.")
        elif grade_points[fyp_grade] < grade_points[min_fyp]:
            # Demote to next class down (Distinction) since CGPA still >= 4.00.
            classification = "Honours (Distinction)"
            notes.append(
                f"CGPA qualifies for Highest Distinction, but FYP grade {fyp_grade} is below the "
                f"required {min_fyp}; classified as Honours (Distinction)."
            )

    return HonoursResult(
        classification=classification,
        cgpa=cgpa,
        fyp_grade=fyp_grade,
        notes=notes,
    )
