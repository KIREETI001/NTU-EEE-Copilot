"""FGO quota tracking + simulation.

⚠ LIABILITY-CRITICAL. This module decides what a student is told about an
IRREVERSIBLE action. Every public entry point returns the irreversibility
warning, and the simulate path refuses to FGO ineligible courses rather than
silently producing a wrong number.

All thresholds come from the parsed `grading.yaml -> fgo` dict (per cohort).
"""
from __future__ import annotations

import copy

from .cgpa import compute_cgpa
from ..models import Course, FgoQuotaStatus, FgoSimulation


def quota_status(courses: list[Course], fgo_rules: dict) -> FgoQuotaStatus:
    """Compute how much FGO quota is already consumed by FGO-applied courses."""
    total_quota = fgo_rules["quota"]["total_au"]
    subcap_quota = fgo_rules["quota"].get("subcap_au") or 0
    subcap_cats = set(fgo_rules["quota"].get("subcap_categories", []))

    used_total = 0
    used_subcap = 0
    for c in courses:
        if not c.fgo_applied:
            continue
        used_total += c.au
        if c.category.value in subcap_cats:
            used_subcap += c.au

    warnings: list[str] = [fgo_rules["irreversible_text"]]
    over_total = used_total > total_quota
    over_subcap = subcap_quota > 0 and used_subcap > subcap_quota
    if over_total:
        warnings.append(f"OVER QUOTA: {used_total} AU FGO'd exceeds the {total_quota} AU cap.")
    if over_subcap:
        warnings.append(
            f"OVER SUB-CAP: {used_subcap} AU FGO'd on Core/MPE/ICC exceeds the {subcap_quota} AU sub-cap."
        )

    return FgoQuotaStatus(
        regime=fgo_rules["regime"],
        total_quota_au=total_quota,
        subcap_quota_au=subcap_quota,
        used_total_au=used_total,
        used_subcap_au=used_subcap,
        remaining_total_au=max(0, total_quota - used_total),
        remaining_subcap_au=max(0, subcap_quota - used_subcap),
        over_total=over_total,
        over_subcap=over_subcap,
        irreversible=fgo_rules.get("irreversible", True),
        irreversible_text=fgo_rules["irreversible_text"],
        warnings=warnings,
    )


def _is_ineligible(course: Course, fgo_rules: dict) -> bool:
    return course.category.value in set(fgo_rules.get("ineligible_categories", []))


def simulate_fgo(
    courses: list[Course],
    fgo_codes: list[str],
    gpa_scale: dict,
    fgo_rules: dict,
) -> FgoSimulation:
    """Simulate applying FGO to `fgo_codes` and report the CGPA effect.

    SIMULATE ONLY. This never mutates the caller's data and never executes a
    real declaration. It:
      - refuses ineligible courses (FYP, internship, sanctioned) -> `blocked`
      - applies FGO to the rest, recomputes CGPA
      - re-checks quota and surfaces over-cap / over-sub-cap warnings
      - ALWAYS returns the irreversibility warning
    """
    before = compute_cgpa(courses, gpa_scale)

    working = copy.deepcopy(courses)
    by_code = {c.code: c for c in working}
    blocked: list[str] = []

    for code in fgo_codes:
        c = by_code.get(code)
        if c is None:
            blocked.append(f"{code}: not found on record.")
            continue
        if _is_ineligible(c, fgo_rules):
            blocked.append(f"{code}: {c.category.value} is FGO-INELIGIBLE — cannot be converted.")
            continue
        c.fgo_applied = True

    after = compute_cgpa(working, gpa_scale)
    q = quota_status(working, fgo_rules)

    warnings = list(q.warnings)
    warnings.append(
        "This is a MATH-ONLY simulation. It does not account for specialization "
        "loss, honours strategy, scholarship/accreditation needs, or grad-school "
        "scrutiny. You must deconflict those yourself before declaring."
    )
    if any(by_code[c].category.value in set(fgo_rules["quota"].get("subcap_categories", []))
           for c in fgo_codes if c in by_code):
        warnings.append(
            "At least one selected course counts toward a specialization — FGO'd "
            "courses do NOT count toward specialization recognition."
        )

    return FgoSimulation(
        cgpa_before=before.cgpa,
        cgpa_after=after.cgpa,
        delta=round(after.cgpa - before.cgpa, 2),
        quota=q,
        blocked=blocked,
        warnings=warnings,
    )


def suggest_fgo_candidates(
    courses: list[Course],
    gpa_scale: dict,
    fgo_rules: dict,
) -> list[str]:
    """Auto-suggest which courses to FGO, purely on the math.

    Heuristic: a course is a candidate if it is FGO-eligible, letter-graded,
    and its grade point is BELOW the current CGPA (so removing it raises CGPA).
    Returns codes ordered by how far below CGPA they sit (worst first), capped
    by remaining quota.

    ⚠ This is a suggestion, not advice. The caller MUST show the math-only
    disclaimer and the irreversibility warning alongside these.
    """
    grade_points: dict[str, float] = gpa_scale["grades"]
    current = compute_cgpa(courses, gpa_scale).cgpa
    subcap_cats = set(fgo_rules["quota"].get("subcap_categories", []))

    candidates: list[tuple[float, int, str]] = []  # (gap, au, code)
    for c in courses:
        if c.fgo_applied or not c.is_graded:
            continue
        if _is_ineligible(c, fgo_rules):
            continue
        if c.grade not in grade_points:
            continue
        gp = grade_points[c.grade]
        if gp < current:
            candidates.append((current - gp, c.au, c.code))

    candidates.sort(reverse=True)  # biggest drag first

    # Respect remaining quota (greedy by drag).
    q = quota_status(courses, fgo_rules)
    rem_total = q.remaining_total_au
    rem_sub = q.remaining_subcap_au
    by_code = {c.code: c for c in courses}

    chosen: list[str] = []
    for _gap, au, code in candidates:
        c = by_code[code]
        in_subcap = c.category.value in subcap_cats
        if au > rem_total:
            continue
        if in_subcap and au > rem_sub:
            continue
        chosen.append(code)
        rem_total -= au
        if in_subcap:
            rem_sub -= au
    return chosen
