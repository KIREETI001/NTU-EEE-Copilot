"""Domain models for the NTU EEE rule engine.

Pure data structures. No I/O, no rulebook loading here — the engine functions
take these plus a cohort-rules dict and return results. That separation is what
makes the math unit-testable against a real transcript.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Category(str, Enum):
    """Course categories. Drives FGO eligibility + sub-cap logic."""

    CORE = "CORE"
    MPE = "MPE"                 # Major Prescribed Elective
    MPE_BDE_OPTION = "MPE_BDE_OPTION"
    ICC_CC = "ICC_CC"           # Interdisciplinary Collaborative Core - Common Core
    FC = "FC"                   # Foundation Core
    BDE = "BDE"
    FYP = "FYP"                 # Final Year Project (FGO-ineligible)
    INTERNSHIP = "INTERNSHIP"   # Professional Internship (FGO-ineligible)
    SANCTIONED = "SANCTIONED"


class Course(BaseModel):
    """A single course on a student's record."""

    code: str
    title: str = ""
    au: int = Field(ge=0)
    category: Category
    grade: Optional[str] = None   # letter grade, e.g. "A-", "B+", "F". None = in progress.
    fgo_applied: bool = False     # has the student exercised FGO on this course?
    spec_type: Optional[str] = None  # "design" | "technical" | None — for specialization checks

    @property
    def is_graded(self) -> bool:
        return self.grade is not None


class CgpaResult(BaseModel):
    cgpa: float
    graded_au: int                # AU of letter-graded courses (the CGPA denominator)
    quality_points: float
    excluded_fgo_au: int          # AU removed from CGPA because FGO was applied


class FgoQuotaStatus(BaseModel):
    regime: str
    total_quota_au: int
    subcap_quota_au: int
    used_total_au: int
    used_subcap_au: int
    remaining_total_au: int
    remaining_subcap_au: int
    over_total: bool
    over_subcap: bool
    irreversible: bool
    irreversible_text: str
    warnings: list[str] = []


class FgoSimulation(BaseModel):
    cgpa_before: float
    cgpa_after: float
    delta: float
    quota: FgoQuotaStatus
    blocked: list[str] = []       # codes that could NOT be FGO'd, with reasons
    warnings: list[str] = []


class FgoSuggestion(BaseModel):
    suggested_codes: list[str]
    disclaimer: str


class SpecializationStatus(BaseModel):
    slug: str
    name: str
    recognized: bool
    counted_au: int
    required_au: int
    design_count: int
    technical_count: int
    reasons: list[str] = []       # why not recognized, or confirmations


class SpecializationPlan(BaseModel):
    """Eligibility drill-down for ONE specialization.

    Extends the recognition check with the data a student needs to PLAN toward
    a spec: which of their completed courses currently count, which spec courses
    are still outstanding, and — the liability bit — which counting courses are
    FGO-locked (FGO'ing them forfeits their contribution, since AY2025-26 excludes
    FGO'd courses from a specialization).
    """

    slug: str
    name: str
    recognized: bool
    counted_au: int
    required_au: int
    design_count: int
    technical_count: int
    min_design: int                # >=1 design electives required (from rulebook)
    min_technical: int             # >=2 technical electives required (from rulebook)
    completed_counting: list[str] = []   # student's completed courses that count now
    remaining_needed: list[str] = []     # spec design/technical courses NOT yet counting
    fgo_locked: list[str] = []           # counting courses that would be FORFEITED if FGO'd
    reasons: list[str] = []


class HonoursResult(BaseModel):
    classification: str
    cgpa: float
    fyp_grade: Optional[str] = None
    notes: list[str] = []


class ParsedCourse(BaseModel):
    """A course extracted from a Degree Audit — a DRAFT for student review.

    Never trusted blindly: `needs_review` flags anything the parser was not sure
    about, and nothing reaches FGO without the student confirming.
    """

    code: str
    title: str = ""
    au: int = 0
    category: Optional[Category] = None
    grade: Optional[str] = None
    status: str = "completed"        # completed | in_progress | pending | non_gpa
    needs_review: bool = False
    review_reason: Optional[str] = None


class AuditParseResult(BaseModel):
    courses: list[ParsedCourse] = []
    # What the audit document itself states (for the cross-check):
    reported_cgpa: Optional[float] = None
    reported_graded_au: Optional[int] = None
    reported_quality_points: Optional[float] = None
    # What the engine recomputes from the parsed completed courses:
    recomputed_cgpa: Optional[float] = None
    recomputed_graded_au: Optional[int] = None
    cgpa_matches: Optional[bool] = None   # None = could not cross-check
    warnings: list[str] = []
