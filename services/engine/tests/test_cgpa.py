"""CGPA tests. The `golden` case is the oracle: swap in your real Degree Audit
courses and assert your actual CGPA. If this passes, the math is trustworthy.
"""
from __future__ import annotations

from app.engine import compute_cgpa
from app.models import Category
from conftest import make_course


def test_simple_average(gpa_scale):
    courses = [
        make_course("X1", 3, "A"),    # 5.00 * 3 = 15.0
        make_course("X2", 3, "B"),    # 3.50 * 3 = 10.5
    ]
    r = compute_cgpa(courses, gpa_scale)
    assert r.cgpa == 4.25          # 25.5 / 6
    assert r.graded_au == 6


def test_fail_counts_as_zero(gpa_scale):
    courses = [
        make_course("X1", 3, "A"),    # 15.0
        make_course("X2", 3, "F"),    # 0.0, but 3 AU still in denominator
    ]
    r = compute_cgpa(courses, gpa_scale)
    assert r.cgpa == 2.5           # 15 / 6
    assert r.graded_au == 6


def test_fgo_excluded_from_cgpa(gpa_scale):
    courses = [
        make_course("X1", 3, "A"),                    # counts
        make_course("X2", 3, "C", fgo=True),          # excluded
    ]
    r = compute_cgpa(courses, gpa_scale)
    assert r.cgpa == 5.0           # only the A counts
    assert r.graded_au == 3
    assert r.excluded_fgo_au == 3


def test_in_progress_excluded(gpa_scale):
    courses = [
        make_course("X1", 3, "A"),
        make_course("X2", 3, None),   # in progress
    ]
    r = compute_cgpa(courses, gpa_scale)
    assert r.graded_au == 3


def test_golden_cgpa_real_degree_audit(gpa_scale):
    """ORACLE — the real Degree Audit (June 2026, matric U2321008K).

    Every LETTER-GRADED course on the transcript; Medical-Leave ('I'), Pass
    ('P') and in-progress courses are excluded by the engine. The official audit
    reports:
        Total (Grade Point x AU) for CGPA = 329.5
        Total AU for CGPA Computation     = 88
        CGPA                              = 3.74
    If this passes, the engine reproduces the real standing — not a synthetic fit.
    """
    # (code, AU, grade) — category is irrelevant to CGPA; no FGO applied.
    transcript = [
        # AY2025 Sem 1
        ("EE3101", 3, "C+"), ("EE3180", 3, "A-"), ("HG2051", 3, "A-"),
        ("IE3017", 3, "B-"), ("IE3102", 3, "C+"),
        # AY2024 Special Term
        ("ET5131", 3, "A"),
        # AY2024 Sem 2
        ("CC0007", 3, "A"), ("EE2073", 2, "B"), ("IE2107", 3, "B-"),
        ("IE2108", 3, "B"), ("SS5206", 3, "A"),
        # AY2024 Sem 1
        ("EE2103", 3, "B-"), ("ML0004", 2, "A"), ("LC5002", 3, "B+"),
        ("IE2110", 3, "C"), ("IE2106", 3, "B-"), ("EE2101", 3, "B-"),
        ("CC0006", 3, "B+"),
        # AY2023 Sem 2
        ("CC0003", 2, "A-"), ("CC0005", 3, "A-"), ("LC5001", 3, "B+"),
        ("EE1102", 3, "B-"), ("IE0005", 3, "B"), ("IE2104", 3, "B"),
        ("MH1811", 3, "B+"),
        # AY2023 Sem 1
        ("IE1005", 3, "B"), ("FE1073", 1, "A-"), ("EG1001", 2, "B-"),
        ("CC0002", 2, "A+"), ("MH1810", 3, "A-"), ("CC0001", 2, "A"),
        ("PH1011", 3, "B-"),
    ]
    courses = [make_course(code, au, grade) for code, au, grade in transcript]
    r = compute_cgpa(courses, gpa_scale)
    assert r.graded_au == 88
    assert r.quality_points == 329.5
    assert r.cgpa == 3.74


def test_medical_leave_excluded_not_error(gpa_scale):
    # 'I' (Medical Leave) appears on real transcripts (IE3014, EE3011 on the
    # June 2026 audit). It must be EXCLUDED from CGPA, never raise.
    courses = [make_course("X1", 3, "A"), make_course("IE3014", 3, "I")]
    r = compute_cgpa(courses, gpa_scale)
    assert r.cgpa == 5.0
    assert r.graded_au == 3
