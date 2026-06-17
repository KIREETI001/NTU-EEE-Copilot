"""Specialization recognition check.

Implements the AY2025-26 rule: >=15 AU from one area, >=1 design + >=2 technical,
ALL letter-graded, FGO'd courses excluded.
"""
from __future__ import annotations

from ..models import Course, SpecializationPlan, SpecializationStatus


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


def plan_specialization(
    courses: list[Course],
    spec: dict,
    recognition_rules: dict,
) -> SpecializationPlan:
    """Eligibility drill-down for one specialization.

    Layers the planning view on top of `check_specialization` (the single
    recognition authority — we don't re-derive `recognized`/counts here):

      - completed_counting : the student's courses that currently count toward
        this spec (same rule as the AU tally: in-list, letter-graded pass, NOT
        FGO'd).
      - remaining_needed   : this spec's design+technical courses that are NOT
        currently counting (spec list minus completed_counting) — i.e. what's
        left to secure it. A course the student took but FGO'd is still
        "remaining" because it does not count.
      - fgo_locked         : the subset of completed_counting that would be
        FORFEITED if FGO'd. AY2025-26 excludes FGO'd courses from a spec, so
        every currently-counting course is FGO-locked: the student must NOT FGO
        it to keep this spec. This drives the irreversibility disclaimer.

    All thresholds/lists come from `spec` + `recognition_rules` — nothing here
    is hardcoded.
    """
    status = check_specialization(courses, spec, recognition_rules)
    fail_grades = {"F"}

    design_codes = [d["code"] for d in spec.get("design_electives", [])]
    tech_codes = [t["code"] for t in spec.get("technical_electives", [])]
    spec_codes = design_codes + tech_codes
    spec_code_set = set(spec_codes)

    completed_counting: list[str] = []
    for c in courses:
        if c.code not in spec_code_set:
            continue
        if c.fgo_applied:
            continue
        if not c.is_graded or c.grade in fail_grades:
            continue
        completed_counting.append(c.code)

    counting_set = set(completed_counting)
    # Spec courses NOT currently counting, in the rulebook's listed order.
    remaining_needed = [code for code in spec_codes if code not in counting_set]
    # Every currently-counting course is FGO-locked (FGO would forfeit it).
    fgo_locked = list(completed_counting)

    return SpecializationPlan(
        slug=status.slug,
        name=status.name,
        recognized=status.recognized,
        counted_au=status.counted_au,
        required_au=status.required_au,
        design_count=status.design_count,
        technical_count=status.technical_count,
        min_design=recognition_rules["min_design_electives"],
        min_technical=recognition_rules["min_technical_electives"],
        completed_counting=completed_counting,
        remaining_needed=remaining_needed,
        fgo_locked=fgo_locked,
        reasons=status.reasons,
    )
