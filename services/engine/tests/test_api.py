"""API contract tests for the FastAPI surface.

The engine must NEVER trust client input: malformed grades, duplicate codes, bad
categories and negative AU must come back as 4xx, not a 500 stack trace.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
COHORT = {"university": "ntu", "programme": "eee", "cohort": "ay2025-26"}


def _course(code, au, cat, grade):
    return {
        "code": code, "title": code, "au": au, "category": cat,
        "grade": grade, "fgo_applied": False, "spec_type": None,
    }


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_cgpa_happy_path():
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "A")]}
    r = client.post("/cgpa", json=body)
    assert r.status_code == 200
    assert r.json()["cgpa"] == 5.0


def test_cgpa_unknown_grade_is_422():
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "Z")]}
    r = client.post("/cgpa", json=body)
    assert r.status_code == 422


def test_cgpa_duplicate_codes_is_422():
    body = {**COHORT, "courses": [
        _course("X1", 3, "CORE", "A"),
        _course("X1", 3, "CORE", "B"),
    ]}
    r = client.post("/cgpa", json=body)
    assert r.status_code == 422


def test_cgpa_negative_au_is_422():
    body = {**COHORT, "courses": [_course("X1", -3, "CORE", "A")]}
    r = client.post("/cgpa", json=body)
    assert r.status_code == 422


def test_cgpa_unknown_category_is_422():
    body = {**COHORT, "courses": [_course("X1", 3, "NOPE", "A")]}
    r = client.post("/cgpa", json=body)
    assert r.status_code == 422


def test_honours_unknown_fyp_grade_is_422():
    body = {**COHORT, "cgpa": 4.60, "fyp_grade": "Z"}
    r = client.post("/honours", json=body)
    assert r.status_code == 422
