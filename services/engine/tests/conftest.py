"""Shared fixtures. Tests run against the REAL rulebook YAML, so a rulebook
edit that breaks an invariant fails CI — exactly what we want.
"""
from __future__ import annotations

import pytest

from app.models import Category, Course
from app.rulebook import load_cohort


@pytest.fixture(scope="session")
def bundle() -> dict:
    return load_cohort("ntu", "eee", "ay2025-26")


@pytest.fixture(scope="session")
def gpa_scale(bundle) -> dict:
    return bundle["grading"]["gpa_scale"]


@pytest.fixture(scope="session")
def fgo_rules(bundle) -> dict:
    return bundle["grading"]["fgo"]


@pytest.fixture(scope="session")
def honours_rules(bundle) -> dict:
    return bundle["grading"]["honours"]


@pytest.fixture(scope="session")
def spec_doc(bundle) -> dict:
    return bundle["specializations"]


def make_course(
    code: str,
    au: int,
    grade: str | None = None,
    category: Category = Category.CORE,
    fgo: bool = False,
    spec_type: str | None = None,
) -> Course:
    return Course(
        code=code,
        title=code,
        au=au,
        grade=grade,
        category=category,
        fgo_applied=fgo,
        spec_type=spec_type,
    )
