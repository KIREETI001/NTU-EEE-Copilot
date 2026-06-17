"""Pure rule-engine functions: CGPA, FGO, specialization, honours."""
from .cgpa import compute_cgpa
from .fgo import quota_status, simulate_fgo, suggest_fgo_candidates
from .specialization import check_specialization, plan_specialization
from .honours import classify_honours

__all__ = [
    "compute_cgpa",
    "quota_status",
    "simulate_fgo",
    "suggest_fgo_candidates",
    "check_specialization",
    "plan_specialization",
    "classify_honours",
]
