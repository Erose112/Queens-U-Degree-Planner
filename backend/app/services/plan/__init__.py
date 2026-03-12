"""
Plan generation package.

Public API:
    generate_plan - sole entry point for callers outside this package.
"""
from app.services.plan.plan_service import generate_plan

__all__ = ["generate_plan"]
