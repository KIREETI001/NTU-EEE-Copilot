"""Honours classification.

College of Engineering rule: Honours (Highest Distinction) requires CGPA >= 4.50
AND at least A- in the FYP. Driven by grading.yaml -> honours.
"""
from __future__ import annotations

from ..models import HonoursResult


def classify_honours(cgpa: float, fyp_grade: str | None, honours_rules: dict) -> HonoursResult:
    classes = honours_rules["classes"]
    notes: list[str] = []

    # classes are listed high -> low; pick the first whose band contains cgpa.
    classification = "Not classified"
    for band in classes:
        if band["min_cgpa"] <= cgpa <= band["max_cgpa"]:
            classification = band["name"]
            break

    # Engineering FYP gate on the top class.
    fyp_rule = honours_rules.get("engineering_fyp_rule")
    if fyp_rule and classification in fyp_rule["applies_to"]:
        gpa_scale_order = ["F", "D", "D+", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"]
        min_fyp = fyp_rule["min_fyp_grade"]
        if fyp_grade is None:
            notes.append("FYP grade unknown — Highest Distinction is conditional on FYP >= A-.")
        elif gpa_scale_order.index(fyp_grade) < gpa_scale_order.index(min_fyp):
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
