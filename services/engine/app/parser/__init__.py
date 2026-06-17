"""Degree Audit PDF parser.

⚠ TRUST-CRITICAL. Output is a DRAFT for the student to review and correct before
any CGPA/FGO computation — NEVER auto-fed to FGO. See
docs/superpowers/specs/2026-06-17-degree-audit-parser-design.md.
"""
from .audit import extract_pdf_text, parse_audit_pdf, parse_audit_text

__all__ = ["parse_audit_text", "parse_audit_pdf", "extract_pdf_text"]
