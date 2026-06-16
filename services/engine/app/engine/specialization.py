"""Specialization recognition check.

Implements the AY2025-26 rule: >=15 AU from one area, >=1 design + >=2 technical,
ALL letter-graded, FGO'd courses excluded.
"""
from __future__ import annotations

from ..models import Course, SpecializationStatus


def check_specialization(
    courses: list[Course],
    spec: dict,
    recognition_rules: dict,
) -> SpecializationStatus:
    """Check whether the student's record satisfies one specialization.

    `spec` is one entry from specializations.yaml -> specializations[].
    `recognition_rules` is specializations.yaml -> recognition_rules.

    A course counts toward this specialization only if ALL hold:
      - its code is in this spec's design or technical lists
      - it is letter-graded (grade present, not a P/NR/etc.)
      - FGO was NOT applied (explicit AY2025-26 rule)
      - it passed (we treat F as non-counting toward the AU requirement)
    """
    min_au = recognition_rules["min_au_single_area"]
    min_design = recognition_rules["min_design_electives"]
    min_tech = recognition_rules["min_technical_electives"]
    fail_grades = {"F"}

    design_codes = {d["code"] for d in spec.get("design_electives", [])}
    tech_codes = {t["code"] for t in spec.get("technical_electives", [])}

    counted_au = 0
    design_count = 0
    technical_count = 0
    reasons: list[str] = []

    for c in courses:
        in_design = c.code in design_codes
        in_tech = c.code in tech_codes
        if not (in_design or in_tech):
            continue
        if c.fgo_applied:
            reasons.append(f"{c.code}: FGO applied — excluded from specialization.")
            continue
        if not c.is_graded or c.grade in fail_grades:
            reasons.append(f"{c.code}: not a passing letter grade — excluded.")
            continue
        counted_au += c.au
        if in_design:
            design_count += 1
        else:
            technical_count += 1

    recognized = (
        counted_au >= min_au
        and design_count >= min_design
        and technical_count >= min_tech
    )

    if not recognized:
        if counted_au < min_au:
            reasons.append(f"Need {min_au} AU, have {counted_au}.")
        if design_count < min_design:
            reasons.append(f"Need >={min_design} design elective(s), have {design_count}.")
        if technical_count < min_tech:
            reasons.append(f"Need >={min_tech} technical elective(s), have {technical_count}.")
    else:
        reasons.append("Recognized: all thresholds met.")

    return SpecializationStatus(
        slug=spec["slug"],
        name=spec["name"],
        recognized=recognized,
        counted_au=counted_au,
        required_au=min_au,
        design_count=design_count,
        technical_count=technical_count,
        reasons=reasons,
    )
