"""Degree Audit parser tests — golden parse against a redacted real audit.

The CGPA cross-check (recompute == the audit's stated 3.74/88/329.5) is the
strongest assertion: if it holds, the extraction is faithful.
"""
from __future__ import annotations

from pathlib import Path

from app.models import Category
from app.parser.audit import parse_audit_text

FIXTURE = (Path(__file__).parent / "fixtures" / "audit_sample.txt").read_text(encoding="utf-8")


def test_cross_check_reproduces_real_cgpa(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    assert r.reported_cgpa == 3.74
    assert r.reported_graded_au == 88
    assert r.recomputed_cgpa == 3.74
    assert r.recomputed_graded_au == 88
    assert r.cgpa_matches is True
    assert r.warnings == []


def test_completed_count(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    completed = [c for c in r.courses if c.status == "completed" and not c.needs_review]
    assert len(completed) == 32


def test_category_mapping(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    by = {c.code: c for c in r.courses}
    assert by["EE3101"].category == Category.CORE     # type C
    assert by["IE3017"].category == Category.MPE       # type P
    assert by["HG2051"].category == Category.BDE       # type BDE
    assert by["CC0007"].category == Category.ICC_CC    # type C + group ICC


def test_medical_leave_and_pass_classified(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    by = {c.code: c for c in r.courses}
    assert by["IE3014"].status == "in_progress"   # 'I' Medical Leave
    assert by["EE1071"].status == "non_gpa"        # 'P' Pass


def test_pending_internship_detected(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    by = {c.code: c for c in r.courses}
    assert "EE3920" in by
    assert by["EE3920"].status == "pending"
    assert by["EE3920"].grade is None
    assert by["EE3920"].category == Category.INTERNSHIP
    assert by["EE3920"].needs_review is True


def test_title_with_number_not_misread_as_au(gpa_scale):
    # "MATHEMATICS 2" / "CHINESE LANGUAGE LEVEL 2" must keep the number in the
    # title and read AU from the right-anchored column.
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    by = {c.code: c for c in r.courses}
    assert by["MH1811"].title == "MATHEMATICS 2"
    assert by["MH1811"].au == 3
    assert by["LC5002"].title == "CHINESE LANGUAGE LEVEL 2"
    assert by["LC5002"].au == 3


def test_unparseable_row_flagged_not_crashed(gpa_scale):
    r = parse_audit_text(FIXTURE, gpa_scale=gpa_scale)
    by = {c.code: c for c in r.courses}
    assert by["HW0001"].needs_review is True   # 0 AU / no type column
