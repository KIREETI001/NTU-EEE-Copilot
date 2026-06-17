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


def test_parse_audit_rejects_non_pdf():
    # A non-PDF upload must come back as a clean 4xx, not a 500.
    r = client.post(
        "/parse-audit",
        files={"file": ("x.pdf", b"this is not a pdf", "application/pdf")},
    )
    assert r.status_code == 422


def test_specialization_plan_returns_all_specs():
    # DA&ML: 1 design + 2 technical -> on track, FGO-locked surfaced.
    body = {**COHORT, "courses": [
        _course("IE4424", 3, "CORE", "A"),   # DA&ML design
        _course("EE6405", 3, "CORE", "B"),   # DA&ML technical
        _course("IE4483", 3, "CORE", "B+"),  # DA&ML technical
    ]}
    r = client.post("/specialization/plan", json=body)
    assert r.status_code == 200
    plans = r.json()
    # One plan per specialization, keyed by slug.
    assert "data-analysis-machine-learning" in plans
    daml = plans["data-analysis-machine-learning"]
    assert daml["counted_au"] == 9
    assert daml["required_au"] == 15
    assert set(daml["completed_counting"]) == {"IE4424", "EE6405", "IE4483"}
    assert set(daml["fgo_locked"]) == {"IE4424", "EE6405", "IE4483"}
    assert "EE6427" in daml["remaining_needed"]


def test_specialization_plan_duplicate_codes_is_422():
    body = {**COHORT, "courses": [
        _course("IE4424", 3, "CORE", "A"),
        _course("IE4424", 3, "CORE", "B"),
    ]}
    r = client.post("/specialization/plan", json=body)
    assert r.status_code == 422


# --- internal-secret gate (deploy-time; the BFF proxy adds x-internal-secret) ---
# When ENGINE_SHARED_SECRET is set (prod, behind the proxy), every request must
# carry a matching header. Unset (local dev) => open, no behavioural change.

def test_internal_secret_blocks_when_set_without_header(monkeypatch):
    monkeypatch.setenv("ENGINE_SHARED_SECRET", "s3cret")
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "A")]}
    assert client.post("/cgpa", json=body).status_code == 401


def test_internal_secret_blocks_wrong_header(monkeypatch):
    monkeypatch.setenv("ENGINE_SHARED_SECRET", "s3cret")
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "A")]}
    r = client.post("/cgpa", json=body, headers={"x-internal-secret": "nope"})
    assert r.status_code == 401


def test_internal_secret_allows_correct_header(monkeypatch):
    monkeypatch.setenv("ENGINE_SHARED_SECRET", "s3cret")
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "A")]}
    r = client.post("/cgpa", json=body, headers={"x-internal-secret": "s3cret"})
    assert r.status_code == 200


def test_internal_secret_exempts_health(monkeypatch):
    # Platform (Fly) health checks hit /health with no secret.
    monkeypatch.setenv("ENGINE_SHARED_SECRET", "s3cret")
    assert client.get("/health").status_code == 200


def test_no_secret_configured_means_open(monkeypatch):
    monkeypatch.delenv("ENGINE_SHARED_SECRET", raising=False)
    body = {**COHORT, "courses": [_course("X1", 3, "CORE", "A")]}
    assert client.post("/cgpa", json=body).status_code == 200
