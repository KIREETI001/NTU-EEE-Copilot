"""CLI:  python -m app.parser <degree_audit.pdf>

Prints the structured parse result as JSON and the CGPA cross-check verdict.
Nothing is sent anywhere — this only extracts a draft for you to review.
"""
from __future__ import annotations

import json
import sys

from ..rulebook import load_cohort
from .audit import parse_audit_pdf


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: python -m app.parser <degree_audit.pdf>", file=sys.stderr)
        raise SystemExit(2)

    gpa_scale = load_cohort("ntu", "eee", "ay2025-26")["grading"]["gpa_scale"]
    result = parse_audit_pdf(sys.argv[1], gpa_scale=gpa_scale)

    print(json.dumps(result.model_dump(), indent=2, default=str))

    verdict = (
        "MATCH — extraction corroborated by the audit's own CGPA"
        if result.cgpa_matches
        else "MISMATCH — review every row before trusting any number"
        if result.cgpa_matches is False
        else "could not cross-check (no reported CGPA found)"
    )
    print(
        f"\nCGPA cross-check: recomputed {result.recomputed_cgpa} vs reported "
        f"{result.reported_cgpa} -> {verdict}",
        file=sys.stderr,
    )
    needs = [c.code for c in result.courses if c.needs_review]
    if needs:
        print(f"{len(needs)} course(s) need review: {', '.join(needs)}", file=sys.stderr)


if __name__ == "__main__":
    main()
