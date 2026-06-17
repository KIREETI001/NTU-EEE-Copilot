"""FastAPI surface for the rule engine.

Thin layer: parse request -> load cohort rulebook -> call pure engine fn ->
return result. No business logic lives here. The undergrad optimizer (private,
high-liability track) consumes these endpoints; the public explorer mostly
reads the compiled rulebook JSON directly and only calls /simulate-fgo etc.
when a logged-in student opts in.
"""
from __future__ import annotations

import io

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, model_validator

from .engine import (
    check_specialization,
    classify_honours,
    compute_cgpa,
    quota_status,
    simulate_fgo,
    suggest_fgo_candidates,
)
from .models import (
    AuditParseResult,
    CgpaResult,
    Course,
    FgoQuotaStatus,
    FgoSimulation,
    FgoSuggestion,
    HonoursResult,
    SpecializationStatus,
)
from .parser.audit import extract_pdf_text, parse_audit_text
from .rulebook import list_cohorts, load_cohort

app = FastAPI(title="NTU EEE Co-Pilot Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # explorer dev server
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def _domain_value_error(request: Request, exc: ValueError) -> JSONResponse:
    # The engine raises ValueError for invalid-but-well-formed input (e.g. a
    # grade not in the cohort scale). Surface as 422, never a 500 stack trace.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


class CohortRef(BaseModel):
    university: str = "ntu"
    programme: str = "eee"
    cohort: str = "ay2025-26"


class TranscriptRequest(CohortRef):
    courses: list[Course]

    @model_validator(mode="after")
    def _reject_duplicate_codes(self) -> "TranscriptRequest":
        codes = [c.code for c in self.courses]
        dupes = sorted({c for c in codes if codes.count(c) > 1})
        if dupes:
            raise ValueError(f"Duplicate course codes not allowed: {dupes}")
        return self


class FgoRequest(TranscriptRequest):
    fgo_codes: list[str] = []


class HonoursRequest(CohortRef):
    cgpa: float
    fyp_grade: str | None = None


def _grading(ref: CohortRef) -> dict:
    try:
        return load_cohort(ref.university, ref.programme, ref.cohort)["grading"]
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "cohorts": list_cohorts()}


@app.get("/rulebook/{university}/{programme}/{cohort}")
def get_rulebook(university: str, programme: str, cohort: str) -> dict:
    try:
        return load_cohort(university, programme, cohort)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/cgpa", response_model=CgpaResult)
def cgpa(req: TranscriptRequest) -> dict:
    scale = _grading(req)["gpa_scale"]
    return compute_cgpa(req.courses, scale).model_dump()


@app.post("/fgo/quota", response_model=FgoQuotaStatus)
def fgo_quota(req: TranscriptRequest) -> dict:
    fgo_rules = _grading(req)["fgo"]
    return quota_status(req.courses, fgo_rules).model_dump()


@app.post("/fgo/simulate", response_model=FgoSimulation)
def fgo_simulate(req: FgoRequest) -> dict:
    grading = _grading(req)
    return simulate_fgo(
        req.courses, req.fgo_codes, grading["gpa_scale"], grading["fgo"]
    ).model_dump()


@app.post("/fgo/suggest", response_model=FgoSuggestion)
def fgo_suggest(req: TranscriptRequest) -> dict:
    grading = _grading(req)
    codes = suggest_fgo_candidates(req.courses, grading["gpa_scale"], grading["fgo"])
    return {
        "suggested_codes": codes,
        "disclaimer": (
            "MATH-ONLY suggestion. FGO is IRREVERSIBLE. These courses drag your CGPA "
            "below its current value; FGO'ing them raises CGPA but does NOT count toward "
            "specialization, and may affect honours/scholarship/accreditation. Deconflict "
            "manually and verify with the Office of Academic Services."
        ),
    }


@app.post("/specialization/check", response_model=dict[str, SpecializationStatus])
def specialization_check(req: TranscriptRequest) -> dict:
    bundle = load_cohort(req.university, req.programme, req.cohort)
    spec_doc = bundle["specializations"]
    rules = spec_doc["recognition_rules"]
    return {
        s["slug"]: check_specialization(req.courses, s, rules).model_dump()
        for s in spec_doc["specializations"]
    }


@app.post("/honours", response_model=HonoursResult)
def honours(req: HonoursRequest) -> dict:
    grading = _grading(req)
    return classify_honours(
        req.cgpa, req.fyp_grade, grading["honours"], grading["gpa_scale"]
    ).model_dump()


@app.post("/parse-audit", response_model=AuditParseResult)
async def parse_audit(
    file: UploadFile = File(...),
    university: str = "ntu",
    programme: str = "eee",
    cohort: str = "ay2025-26",
) -> AuditParseResult:
    """Parse an uploaded Degree Audit PDF into a reviewable DRAFT.

    The PDF is processed in memory and is never stored or logged (PDPA). The
    result is a draft for the student to review/correct — it is NOT FGO advice.
    """
    grading = _grading(CohortRef(university=university, programme=programme, cohort=cohort))
    data = await file.read()
    try:
        text = extract_pdf_text(io.BytesIO(data))
    except Exception as exc:  # noqa: BLE001 - any pdf failure is a client error
        raise HTTPException(status_code=422, detail=f"Could not read the PDF: {exc}")
    return parse_audit_text(text, gpa_scale=grading["gpa_scale"])
