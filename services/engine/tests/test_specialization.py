"""Specialization recognition tests against the real DA&ML rulebook entry."""
from __future__ import annotations

from app.engine import check_specialization, plan_specialization
from app.models import Category
from conftest import make_course


def _daml(spec_doc):
    return next(s for s in spec_doc["specializations"] if s["slug"] == "data-analysis-machine-learning")


def test_daml_recognized(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    # 1 design + 2 technical, all letter-graded, >=15 AU (3 AU each = 15)
    courses = [
        make_course("IE4424", 3, "A", Category.CORE),   # design
        make_course("EE6405", 3, "B", Category.CORE),   # technical
        make_course("IE4483", 3, "B+", Category.CORE),  # technical
        make_course("IE4476", 3, "A-", Category.CORE),  # technical
        make_course("EE4285", 3, "B", Category.CORE),   # technical -> 15 AU total
    ]
    r = check_specialization(courses, daml, rules)
    assert r.recognized is True
    assert r.counted_au >= rules["min_au_single_area"]
    assert r.design_count >= 1
    assert r.technical_count >= 2


def test_daml_fgo_course_excluded(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    courses = [
        make_course("IE4424", 3, "A", Category.CORE),               # design
        make_course("EE6405", 3, "A", Category.CORE, fgo=True),     # FGO'd -> excluded
        make_course("IE4483", 3, "B+", Category.CORE),              # technical
    ]
    r = check_specialization(courses, daml, rules)
    # Only 1 technical counts (EE6405 excluded) -> not recognized
    assert r.recognized is False
    assert any("FGO" in reason for reason in r.reasons)


def test_daml_insufficient_design(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    # 0 design, 5 technical -> fails the >=1 design rule even at 15 AU
    courses = [
        make_course("EE6405", 3, "A", Category.CORE),
        make_course("EE6427", 3, "A", Category.CORE),
        make_course("IE4483", 3, "A", Category.CORE),
        make_course("IE4476", 3, "A", Category.CORE),
        make_course("IE4497", 3, "A", Category.CORE),
    ]
    r = check_specialization(courses, daml, rules)
    assert r.recognized is False
    assert any("design" in reason for reason in r.reasons)


# ---------------------------------------------------------------------------
# plan_specialization — eligibility drill-down with FGO-locked courses (WS3)
# ---------------------------------------------------------------------------


def test_plan_recognized_spec(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    courses = [
        make_course("IE4424", 3, "A", Category.CORE),   # design
        make_course("EE6405", 3, "B", Category.CORE),   # technical
        make_course("IE4483", 3, "B+", Category.CORE),  # technical
        make_course("IE4476", 3, "A-", Category.CORE),  # technical
        make_course("EE4285", 3, "B", Category.CORE),   # technical -> 15 AU total
    ]
    p = plan_specialization(courses, daml, rules)
    assert p.slug == "data-analysis-machine-learning"
    assert p.recognized is True
    assert p.counted_au == 15
    assert p.required_au == rules["min_au_single_area"]
    # All five counting courses are present in completed_counting and fgo_locked.
    assert set(p.completed_counting) == {"IE4424", "EE6405", "IE4483", "IE4476", "EE4285"}
    assert set(p.fgo_locked) == set(p.completed_counting)
    # remaining_needed is the spec list minus what's done (none of the 5 repeat).
    assert "IE4424" not in p.remaining_needed
    assert "EE6405" not in p.remaining_needed


def test_plan_on_track_spec(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    # 1 design + 1 technical = 6 AU: not yet recognized, but progressing.
    courses = [
        make_course("IE4424", 3, "A", Category.CORE),   # design
        make_course("EE6405", 3, "B", Category.CORE),   # technical
    ]
    p = plan_specialization(courses, daml, rules)
    assert p.recognized is False
    assert p.counted_au == 6
    assert set(p.completed_counting) == {"IE4424", "EE6405"}
    # The remaining design/technical courses for this spec are still listed,
    # and the two already-done ones are NOT in remaining_needed.
    assert "IE4424" not in p.remaining_needed
    assert "EE6405" not in p.remaining_needed
    assert "EE6427" in p.remaining_needed   # an untouched technical for DA&ML
    assert "EE4228" in p.remaining_needed   # an untouched design for DA&ML


def test_plan_fgo_locked_excludes_fgod_course(spec_doc):
    rules = spec_doc["recognition_rules"]
    daml = _daml(spec_doc)
    courses = [
        make_course("IE4424", 3, "A", Category.CORE),            # counts -> fgo_locked
        make_course("EE6405", 3, "A", Category.CORE, fgo=True),  # FGO'd -> NOT counted
        make_course("IE4483", 3, "B+", Category.CORE),           # counts -> fgo_locked
    ]
    p = plan_specialization(courses, daml, rules)
    # FGO'd course contributes 0 AU and is excluded from counted_au + locked set.
    assert p.counted_au == 6
    assert "EE6405" not in p.completed_counting
    assert "EE6405" not in p.fgo_locked
    # The two non-FGO counting courses ARE locked (must not be FGO'd to keep spec).
    assert set(p.fgo_locked) == {"IE4424", "IE4483"}
    # An FGO'd in-spec course is still a course "to secure" — it appears in
    # remaining_needed because it does not currently count.
    assert "EE6405" in p.remaining_needed


def test_plan_all_specs_via_endpoint_shape(spec_doc):
    # Sanity: plan_specialization works for every spec in the rulebook, never
    # hardcoding a code/cap — required_au always comes from the rules.
    rules = spec_doc["recognition_rules"]
    for spec in spec_doc["specializations"]:
        p = plan_specialization([], spec, rules)
        assert p.required_au == rules["min_au_single_area"]
        assert p.counted_au == 0
        assert p.completed_counting == []
        assert p.fgo_locked == []
        # With no completed courses, every design+technical course is remaining.
        expected = {d["code"] for d in spec.get("design_electives", [])} | {
            t["code"] for t in spec.get("technical_electives", [])
        }
        assert set(p.remaining_needed) == expected
