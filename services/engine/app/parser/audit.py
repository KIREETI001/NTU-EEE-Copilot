"""Degree Audit parsing logic.

`parse_audit_text` is PURE (string -> AuditParseResult) so the risky parsing is
unit-tested without a binary PDF. `extract_pdf_text` is a thin pdfplumber wrapper.

Two trust nets (see the spec):
  - per-course `needs_review` flags for anything ambiguous (never a silent guess);
  - a CGPA cross-check: recompute CGPA from the parsed completed courses and
    compare against the audit's own stated CGPA. A mismatch means the extraction
    is suspect.
"""
from __future__ import annotations

import re

from ..engine.cgpa import compute_cgpa
from ..models import AuditParseResult, Category, Course, ParsedCourse

CODE_RE = re.compile(r"^([A-Z]{2,4}\d{4})\b")
CODE_ANYWHERE_RE = re.compile(r"\b([A-Z]{2,4}\d{4})\b")

LETTER_GRADES = {"A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D+", "D", "F"}
IN_PROGRESS_GRADES = {"I", "IP"}
NON_GPA_GRADES = {"P", "NR", "LOA", "EX", "TC", "ABS", "DI", "S", "U"}
GRADE_TOKENS = LETTER_GRADES | IN_PROGRESS_GRADES | NON_GPA_GRADES

TYPE_TOKENS = {"C", "P", "BDE"}
GROUP_TOKENS = {"ICC"}
TYPE_TO_CATEGORY = {"C": Category.CORE, "P": Category.MPE, "BDE": Category.BDE}
SPECIAL_CODE_CATEGORY = {
    "EE4080": Category.FYP,         # Final Year Project
    "EE3279": Category.INTERNSHIP,  # Professional Internship (older code)
    "EE3920": Category.INTERNSHIP,  # Professional Internship
}

_CGPA_RE = re.compile(r"Cumulative Grade Point Average \(CGPA\)\s+([\d.]+)")
_QP_RE = re.compile(r"Total \(Grade Point x AU\) for CGPA Computation\s+([\d.]+)")
_AU_RE = re.compile(r"Total AU for CGPA Computation\s+(\d+)")


def _status_for(grade: str) -> str:
    if grade in LETTER_GRADES:
        return "completed"
    if grade in IN_PROGRESS_GRADES:
        return "in_progress"
    return "non_gpa"


def _map_category(code: str, ctype: str | None, group: str | None):
    if code in SPECIAL_CODE_CATEGORY:
        return SPECIAL_CODE_CATEGORY[code], None
    if ctype == "C" and group == "ICC":
        return Category.ICC_CC, None
    cat = TYPE_TO_CATEGORY.get(ctype)
    if cat is None:
        return None, f"could not map course type {ctype!r} / group {group!r} to a category"
    return cat, None


def _parse_exam_row(line: str) -> ParsedCourse | None:
    """Right-anchored parse of one Examination Results row:
        CODE  TITLE...  AU  GRADE  TYPE  [GROUP]
    Parsing from the right makes titles that contain numbers (e.g. "MATHEMATICS
    2", "CHINESE LANGUAGE LEVEL 1") safe — the trailing columns are fixed."""
    m = CODE_RE.match(line)
    if not m:
        return None
    code = m.group(1)
    toks = line[m.end():].split()
    if not toks:
        return None

    group = toks.pop() if toks[-1] in GROUP_TOKENS else None
    ctype = toks.pop() if toks else None
    grade = toks.pop() if toks else None
    au_tok = toks.pop() if toks else None
    title = " ".join(toks).strip()

    reasons: list[str] = []
    if grade not in GRADE_TOKENS:
        reasons.append(f"unrecognized grade token {grade!r}")
    if ctype not in TYPE_TOKENS:
        reasons.append(f"unexpected course type {ctype!r}")
    au = int(au_tok) if (au_tok and au_tok.isdigit()) else 0
    if not (au_tok and au_tok.isdigit()):
        reasons.append(f"AU not an integer ({au_tok!r})")

    category, cat_reason = _map_category(code, ctype, group)
    if cat_reason and grade in GRADE_TOKENS:
        reasons.append(cat_reason)

    valid_grade = grade in GRADE_TOKENS
    return ParsedCourse(
        code=code,
        title=title,
        au=au,
        category=category,
        grade=grade if valid_grade else None,
        status=_status_for(grade) if valid_grade else "completed",
        needs_review=bool(reasons),
        review_reason="; ".join(reasons) or None,
    )


def parse_audit_text(text: str, gpa_scale: dict | None = None) -> AuditParseResult:
    """Parse a Degree Audit's extracted text into a reviewable course list.

    If `gpa_scale` is given, also runs the CGPA cross-check against the audit's
    own stated numbers (the key trust signal).
    """
    # Split into Examination Results vs Courses Registered sections.
    exam_lines: list[str] = []
    reg_lines: list[str] = []
    section: str | None = None
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith("Examination Results"):
            section = "exam"
            continue
        if s.startswith("Courses Registered"):
            section = "reg"
            continue
        if section == "exam":
            exam_lines.append(s)
        elif section == "reg":
            reg_lines.append(s)

    warnings: list[str] = []
    courses: list[ParsedCourse] = []
    seen: set[str] = set()

    for s in exam_lines:
        if not CODE_RE.match(s):
            continue
        pc = _parse_exam_row(s)
        if pc is None:
            continue
        if pc.code in seen:
            pc.needs_review = True
            pc.review_reason = ((pc.review_reason + "; ") if pc.review_reason else "") + "duplicate code on record"
        seen.add(pc.code)
        courses.append(pc)

    # Pending: a code registered but with NO examination result yet.
    for s in reg_lines:
        m = CODE_ANYWHERE_RE.search(s)
        if not m:
            continue
        code = m.group(1)
        if code in seen:
            continue
        seen.add(code)
        after = s[m.end():].split()
        title_toks: list[str] = []
        for t in after:
            if t.isdigit():
                break
            title_toks.append(t)
        courses.append(
            ParsedCourse(
                code=code,
                title=" ".join(title_toks).strip(),
                category=SPECIAL_CODE_CATEGORY.get(code),
                grade=None,
                status="pending",
                needs_review=True,
                review_reason="pending course — confirm AU, category and grade when results release",
            )
        )

    cm = _CGPA_RE.search(text)
    qm = _QP_RE.search(text)
    am = _AU_RE.search(text)
    result = AuditParseResult(
        courses=courses,
        reported_cgpa=float(cm.group(1)) if cm else None,
        reported_quality_points=float(qm.group(1)) if qm else None,
        reported_graded_au=int(am.group(1)) if am else None,
        warnings=warnings,
    )

    if gpa_scale is not None:
        completed = [
            Course(code=c.code, title=c.title, au=c.au, category=c.category, grade=c.grade)
            for c in courses
            if c.status == "completed" and not c.needs_review and c.category is not None
        ]
        rc = compute_cgpa(completed, gpa_scale)
        result.recomputed_cgpa = rc.cgpa
        result.recomputed_graded_au = rc.graded_au
        if result.reported_cgpa is not None:
            result.cgpa_matches = abs(rc.cgpa - result.reported_cgpa) < 0.005
            if not result.cgpa_matches:
                warnings.append(
                    f"CGPA cross-check FAILED: recomputed {rc.cgpa} vs audit-reported "
                    f"{result.reported_cgpa}. Extraction is suspect — review every row "
                    "before trusting any number."
                )
        if result.reported_graded_au is not None and rc.graded_au != result.reported_graded_au:
            warnings.append(
                f"Graded-AU mismatch: recomputed {rc.graded_au} vs audit-reported "
                f"{result.reported_graded_au}."
            )

    return result


def extract_pdf_text(path: str) -> str:
    """Thin pdfplumber wrapper: concatenate each page's extracted text."""
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
    return "\n".join(parts)


def parse_audit_pdf(path: str, gpa_scale: dict | None = None) -> AuditParseResult:
    return parse_audit_text(extract_pdf_text(path), gpa_scale=gpa_scale)
