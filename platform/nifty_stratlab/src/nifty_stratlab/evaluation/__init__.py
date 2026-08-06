"""Rules-of-engagement evaluation primitives."""

from .roe import classify_result_type, classify_trend, evaluate_rankability

__all__ = ["classify_result_type", "classify_trend", "evaluate_rankability"]
