"""Specialization recognition tests against the real DA&ML rulebook entry."""
from __future__ import annotations

from app.engine import check_specialization
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
