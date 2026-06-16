"""Rulebook loader.

Reads the versioned YAML rulebook for a (university, programme, cohort) and
returns plain dicts the engine consumes. This is the ONLY place that touches
the filesystem, keeping the engine functions pure and testable.
"""
from __future__ import annotations

import functools
from pathlib import Path

import yaml

# repo_root/rulebook  (this file is services/engine/app/rulebook.py)
RULEBOOK_ROOT = Path(__file__).resolve().parents[3] / "rulebook"

_FILES = ["meta", "degree", "grading", "specializations", "admissions", "careers"]


@functools.lru_cache(maxsize=32)
def load_cohort(university: str, programme: str, cohort: str) -> dict:
    """Load and merge all YAML files for one cohort into a single dict.

    Example: load_cohort("ntu", "eee", "ay2025-26")
    """
    base = RULEBOOK_ROOT / university / programme / cohort
    if not base.is_dir():
        raise FileNotFoundError(f"No rulebook at {base}")

    bundle: dict = {}
    for name in _FILES:
        path = base / f"{name}.yaml"
        if path.exists():
            with path.open(encoding="utf-8") as fh:
                bundle[name] = yaml.safe_load(fh)
    return bundle


def list_cohorts() -> list[dict]:
    """Discover every cohort the rulebook ships with (for a cohort picker)."""
    out: list[dict] = []
    if not RULEBOOK_ROOT.is_dir():
        return out
    for uni in sorted(p for p in RULEBOOK_ROOT.iterdir() if p.is_dir()):
        for prog in sorted(p for p in uni.iterdir() if p.is_dir()):
            for cohort in sorted(p for p in prog.iterdir() if p.is_dir()):
                if (cohort / "meta.yaml").exists():
                    out.append(
                        {"university": uni.name, "programme": prog.name, "cohort": cohort.name}
                    )
    return out
