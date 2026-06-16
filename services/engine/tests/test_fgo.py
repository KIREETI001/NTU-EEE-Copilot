"""FGO tests — the liability-critical path. We assert that:
  - quota caps match the rulebook (24 / 12)
  - ineligible courses (FYP/internship) are BLOCKED, never silently FGO'd
  - the irreversibility warning is ALWAYS present
  - over-sub-cap is detected
  - suggestions only target grades below current CGPA
"""
from __future__ import annotations

from app.engine import quota_status, simulate_fgo, suggest_fgo_candidates
from app.models import Category
from conftest import make_course


def test_quota_caps_match_rulebook(fgo_rules):
    assert fgo_rules["quota"]["total_au"] == 24
    assert fgo_rules["quota"]["subcap_au"] == 12


def test_fgo_raises_cgpa(gpa_scale, fgo_rules):
    courses = [
        make_course("X1", 3, "A", Category.CORE),
        make_course("X2", 3, "C", Category.BDE),   # drag
    ]
    sim = simulate_fgo(courses, ["X2"], gpa_scale, fgo_rules)
    assert sim.cgpa_before == 3.5   # (15 + 6) / 6
    assert sim.cgpa_after == 5.0    # only the A remains
    assert sim.delta == 1.5


def test_fyp_is_blocked(gpa_scale, fgo_rules):
    courses = [
        make_course("EE4080", 8, "B", Category.FYP),
        make_course("X2", 3, "A", Category.BDE),
    ]
    sim = simulate_fgo(courses, ["EE4080"], gpa_scale, fgo_rules)
    assert any("EE4080" in b and "INELIGIBLE" in b for b in sim.blocked)
    # CGPA unchanged because FYP could not be converted
    assert sim.cgpa_before == sim.cgpa_after


def test_irreversibility_warning_always_present(gpa_scale, fgo_rules):
    courses = [make_course("X1", 3, "B", Category.BDE)]
    sim = simulate_fgo(courses, [], gpa_scale, fgo_rules)
    assert any("IRREVOCABLE" in w.upper() for w in sim.warnings)


def test_over_subcap_detected(gpa_scale, fgo_rules):
    # 15 AU of CORE FGO'd exceeds the 12 AU sub-cap.
    courses = [
        make_course("C1", 9, "C", Category.CORE, fgo=True),
        make_course("C2", 6, "C", Category.MPE, fgo=True),
    ]
    q = quota_status(courses, fgo_rules)
    assert q.used_subcap_au == 15
    assert q.over_subcap is True
    assert any("SUB-CAP" in w for w in q.warnings)


def test_suggest_only_below_cgpa(gpa_scale, fgo_rules):
    courses = [
        make_course("A1", 12, "A", Category.CORE),    # well above CGPA
        make_course("LOW", 3, "C", Category.BDE),     # below CGPA -> candidate
        make_course("FYP", 8, "C", Category.FYP),     # below but INELIGIBLE
    ]
    codes = suggest_fgo_candidates(courses, gpa_scale, fgo_rules)
    assert "LOW" in codes
    assert "A1" not in codes
    assert "FYP" not in codes      # ineligible never suggested
