"""Degree Audit parsing logic.

`parse_audit_text` is PURE (string -> AuditParseResult) so the risky parsing is
unit-tested without a binary PDF. `extract_pdf_text` is a thin pdfplumber wrapper.

The real pdfplumber output WRAPS long course titles across lines, with the
AU/grade/type columns sandwiched in the middle, e.g.:

    EE2073 INTRODUCTION TO EEE DESIGN &
    2 B C
    PROJECT

So we reconstruct a logical row (all lines from one course code to the next),
then locate AU as the integer IMMEDIATELY FOLLOWED BY A GRADE TOKEN. That rule
is robust to both the wrapping and to titles that contain numbers
("MATHEMATICS 2", "CHINESE LANGUAGE LEVEL 1").

Two trust nets: per-course `needs_review` flags for anything ambiguous, and a
CGPA cross-check (recompute vs the audit's own stated CGPA).
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

# Lines inside the Examination Results section that are NOT course rows.
_MARKER_PREFIXES = (
    "Total AU Earned", "Semester GPA", "CGPA", "Academic Year", "Exam Status",
    "Legend", "Overseas", "Period", "Status", "FGO", "Course", "AU Type", "Index",
)

_CGPA_RE = re.compile(r"Cumulative Grade Point Average \(CGPA\)\s+([\d.]+)")
_QP_RE = re.compile(r"Total \(Grade Point x AU\) for CGPA Computation\s+([\d.]+)")
_AU_RE = re.compile(r"Total AU for CGPA Computation\s+(\d+)")


def _is_marker(s: str) -> bool:
    return (not s) or s == "In" or s.startswith(_MARKER_PREFIXES)


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


def _parse_row(code: str, tokens: list[str]) -> ParsedCourse:
    """Parse one reconstructed row's tokens (everything after the code).

    AU = the first integer token IMMEDIATELY FOLLOWED BY a grade token; the
    grade follows it, then an optional course type and optional group. Title is
    whatever is left (may surround the columns, because of wrapping)."""
    au_idx = next(
        (i for i, t in enumerate(tokens)
         if t.isdigit() and i + 1 < len(tokens) and tokens[i + 1] in GRADE_TOKENS),
        None,
    )
    if au_idx is None:
        return ParsedCourse(
            code=code,
            title=" ".join(tokens).strip(),
            needs_review=True,
            review_reason="could not locate the AU/grade columns on this row",
        )

    consumed = {au_idx, au_idx + 1}
    au = int(tokens[au_idx])
    grade = tokens[au_idx + 1]

    j = au_idx + 2
    ctype = group = None
    if j < len(tokens) and tokens[j] in TYPE_TOKENS:
        ctype = tokens[j]
        consumed.add(j)
        j += 1
    if j < len(tokens) and tokens[j] in GROUP_TOKENS:
        group = tokens[j]
        consumed.add(j)
        j += 1

    title = " ".join(t for k, t in enumerate(tokens) if k not in consumed).strip()
    category, cat_reason = _map_category(code, ctype, group)
    reasons = [cat_reason] if cat_reason else []

    return ParsedCourse(
        code=code,
        title=title,
        au=au,
        category=category,
        grade=grade,
        status=_status_for(grade),
        needs_review=bool(reasons),
        review_reason="; ".join(reasons) or None,
    )


def _reconstruct_rows(lines: list[str]) -> list[tuple[str, list[str]]]:
    """Join wrapped lines into logical rows: (code, tokens-after-code)."""
    rows: list[tuple[str, list[str]]] = []
    code: str | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal code, buf
        if code is not None:
            rows.append((code, buf))
        code, buf = None, []

    for s in lines:
        m = CODE_RE.match(s)
        if m:
            flush()
            code = m.group(1)
            buf = s[m.end():].split()
        elif _is_marker(s):
            flush()
        elif code is not None:
            buf.extend(s.split())   # title/columns continuation of an open row
    flush()
    return rows


def parse_audit_text(text: str, gpa_scale: dict | None = None) -> AuditParseResult:
    """Parse a Degree Audit's extracted text into a reviewable course list.

    If `gpa_scale` is given, also runs the CGPA cross-check against the audit's
    own stated numbers (the key trust signal).
    """
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

    for code, tokens in _reconstruct_rows(exam_lines):
        pc = _parse_row(code, tokens)
        if pc.code in seen:
            pc.needs_review = True
            pc.review_reason = ((pc.review_reason + "; ") if pc.review_reason else "") + "duplicate code on record"
        seen.add(pc.code)
        courses.append(pc)

    # Pending: a code that is registered but has NO examination result yet.
    for s in reg_lines:
        m = CODE_ANYWHERE_RE.search(s)
        if not m:
            continue
        regcode = m.group(1)
        if regcode in seen:
            continue
        seen.add(regcode)
        after = s[m.end():].split()
        title_toks: list[str] = []
        for t in after:
            if t.isdigit():
                break
            title_toks.append(t)
        courses.append(
            ParsedCourse(
                code=regcode,
                title=" ".join(title_toks).strip(),
                category=SPECIAL_CODE_CATEGORY.get(regcode),
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
