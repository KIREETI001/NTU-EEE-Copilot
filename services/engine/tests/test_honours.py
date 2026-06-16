"""Honours tests — including the engineering FYP gate on Highest Distinction."""
from __future__ import annotations

from app.engine import classify_honours


def test_highest_distinction_with_good_fyp(honours_rules):
    r = classify_honours(4.60, "A", honours_rules)
    assert r.classification == "Honours (Highest Distinction)"


def test_highest_distinction_demoted_by_weak_fyp(honours_rules):
    # CGPA qualifies, but FYP B+ < A- gate -> demote to Distinction
    r = classify_honours(4.60, "B+", honours_rules)
    assert r.classification == "Honours (Distinction)"
    assert any("FYP" in n for n in r.notes)


def test_highest_distinction_conditional_when_fyp_unknown(honours_rules):
    r = classify_honours(4.60, None, honours_rules)
    assert r.classification == "Honours (Highest Distinction)"
    assert any("conditional" in n.lower() for n in r.notes)


def test_merit_band(honours_rules):
    r = classify_honours(3.74, "B", honours_rules)   # user's documented CGPA
    assert r.classification == "Honours (Merit)"


def test_distinction_band(honours_rules):
    r = classify_honours(4.20, "B", honours_rules)
    assert r.classification == "Honours (Distinction)"


def test_pass_band(honours_rules):
    r = classify_honours(2.50, "C", honours_rules)
    assert r.classification == "Pass"
