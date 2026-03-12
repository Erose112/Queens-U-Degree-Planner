"""
Data types for prerequisite modelling.
"""
from __future__ import annotations
from typing import NamedTuple


class PrerequisiteConstraint(NamedTuple):
    """
    Represents a single prerequisite requirement.

    For AND: and_set contains ALL required courses (all must be completed).
    For OR:  or_set contains candidate courses (at least one must be completed).
    """
    and_set: set[str]
    or_set: set[str]


class PrerequisiteRequirement(NamedTuple):
    """
    All prerequisites for a single course.
    Multiple constraints are ANDed together — every constraint must be satisfied.
    """
    constraints: list[PrerequisiteConstraint]