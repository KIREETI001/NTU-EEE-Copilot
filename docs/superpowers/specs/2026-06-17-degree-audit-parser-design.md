# Design: Degree Audit PDF parser (core)

**Date:** 2026-06-17
**Status:** Approved (build now) — parser CORE only; optimizer upload UI is a follow-up.
**Author:** Claude (with KIREETI001)

---

## Why this exists (and the risk it carries)

The project **deliberately deferred** a transcript/audit parser: "a parser will
extract confidently-wrong courses — the worst failure for a trust tool." We are
building it now because two preconditions changed: the engine is hardened (31
tests, real CGPA oracle, rulebook validator) and we have a **real sample** of the
exact NTU Degree Audit PDF to pin against.

The parser **saves typing; it is never trusted blindly.** Its output is a *draft*
the user reviews and corrects before any CGPA/FGO computation.

## Scope

- **In:** a Python parser that turns a Degree Audit PDF into a structured list of
  courses (completed + pending), with per-course `needs_review` flags, plus a
  CGPA cross-check against the audit's own stated numbers. A CLI entry point.
- **Out (follow-up):** the optimizer file-upload UI, the `/parse` engine endpoint,
  and the editable review table. This spec is the parser core only.

## Architecture (isolation for testability)

```
parse_audit_pdf(path)
   └─ extract_pdf_text(path)  ── thin pdfplumber wrapper (page.extract_text joined)
        └─ parse_audit_text(text)  ── PURE: all parsing logic, unit-tested
```

Splitting the pure text parser from the PDF I/O means the risky logic is tested
against a **text fixture** (no binary PDF needed in CI), and the finicky
PDF→text step is a thin, separately smoke-tested wrapper.

## Modules

- `services/engine/app/parser/audit.py`
  - `parse_audit_text(text: str) -> AuditParseResult` (pure)
  - `extract_pdf_text(path: str) -> str` (pdfplumber)
  - `parse_audit_pdf(path: str) -> AuditParseResult`
- `services/engine/app/parser/__main__.py` — CLI: `python -m app.parser <audit.pdf>`
  prints the structured result + the cross-check verdict.
- Models (in `app/parser/models.py` or `app/models.py`):
  - `ParsedCourse`: `code, title, au, category, grade, status, needs_review,
    review_reason` where `status ∈ {completed, in_progress, pending}`.
  - `AuditParseResult`: `courses: list[ParsedCourse]`, `reported_cgpa`,
    `reported_graded_au`, `reported_quality_points`, `recomputed_cgpa`,
    `cgpa_matches: bool | None`, `warnings: list[str]`.

## Parsing rules (from the real audit format)

- **Completed** — "Examination Results" blocks (per AY/Semester): rows of
  `code  title  AU  grade  type  group`. Letter grades A+..F.
- **Excluded from CGPA but kept** — grades `I` (Medical Leave), `IP`, `P` →
  `status=in_progress` or non-GPA; the engine already excludes these.
- **Pending** — codes in "Courses Registered" that have **no grade** in
  Examination Results (e.g. `EE3920` Professional Internship) → `grade=None,
  status=pending`.
- **Category mapping** (Course Type `C/P/BDE` + Course Group `ICC`):
  | Type | Group | -> Category |
  |---|---|---|
  | C | ICC | `ICC_CC` |
  | C | - | `CORE` |
  | P | - | `MPE` |
  | BDE | - | `BDE` |
  - Special by code: `EE4080`->`FYP`; `EE3279`/`EE3920`->`INTERNSHIP`.
  - **Any row that doesn't map cleanly -> `needs_review=true` with a reason.**
    Never guess a category silently.

## The trust mechanism (the heart of the design)

1. **Per-course `needs_review`** — unmapped category, unrecognized grade token,
   AU that isn't an integer, or a duplicate code all set the flag. The review UI
   (follow-up) surfaces these first.
2. **CGPA cross-check** — the audit states its own `CGPA`, `Total AU for CGPA`,
   and `Total (Grade Point x AU)`. The parser extracts those, recomputes CGPA
   from the parsed letter-graded courses via the **existing** `compute_cgpa`, and
   sets `cgpa_matches`. A mismatch is a loud warning: the extraction is suspect.
   This makes the document validate its own parse.
3. **No auto-feed** — `parse_audit_*` returns data; it never calls FGO. Wiring to
   the optimizer (follow-up) goes through an editable review step.

## Data flow

PDF -> text -> parse -> `AuditParseResult` (courses + flags + cross-check) ->
[user review, follow-up] -> engine `/cgpa` `/fgo/*`.

## Error handling

- Unreadable/encrypted PDF, or no "Examination Results" section -> raise a clear
  error (CLI prints it; future endpoint -> 422).
- Unmapped category/grade -> `needs_review`, not a crash.
- Missing reported CGPA -> `cgpa_matches=None` (cross-check skipped, warned).

## Testing

- **Golden (pure):** `tests/fixtures/audit_sample.txt` — a **redacted** copy of
  the real audit's academic tables (NO name/matric/address/phone — PDPA).
  `parse_audit_text(fixture)` must recover the **32** letter-graded courses,
  recompute via `compute_cgpa` to **329.5 / 88 / 3.74**, set `cgpa_matches=True`,
  and detect the pending internship (`EE3920`, grade None).
- **Mapping unit tests:** each category-mapping branch + `needs_review` triggers
  (bad grade, unmapped type, dup code).
- **PDF smoke test (manual/local):** the user runs `python -m app.parser
  <their.pdf>` against the real binary; the `cgpa_matches=True` verdict confirms
  pdfplumber's extraction matches. The real PDF is **not** committed (gitignored,
  PDPA).

## Dependencies

- `pdfplumber` (pulls `pdfminer.six` + `Pillow`). Verify cp314 wheels install in
  the engine venv; if `Pillow` won't build on 3.14, fall back to `pypdf` for
  `extract_pdf_text` (pure-Python; the pure parser is unaffected).

## Non-goals / follow-ups

- Optimizer file-upload + `/parse` endpoint + editable review table.
- OCR / scanned PDFs (audit is text-based).
- Other universities' audit formats (pin NTU EEE first).
