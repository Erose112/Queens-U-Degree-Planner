"""
Prerequisite utilities: cycle detection, scheduling helpers, and map builder.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code
from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse
from app.services.plan.constants import MAX_YEARS
from app.services.plan.prereq_types import PrerequisiteConstraint, PrerequisiteRequirement

logger = logging.getLogger(__name__)


# Cycle detection
def has_cycle_in_graph(prereq_requirements: dict[str, PrerequisiteRequirement]) -> bool:
    """
    Detect cycles in the prerequisite graph using depth-first search.

    Returns True if a cycle is detected, False otherwise.
    """
    graph: dict[str, set[str]] = {}

    for code, req in prereq_requirements.items():
        if code not in graph:
            graph[code] = set()
        for constraint in req.constraints:
            graph[code].update(constraint.and_set)
            graph[code].update(constraint.or_set)

    visited: set[str] = set()
    rec_stack: set[str] = set()

    def dfs(node: str) -> bool:
        visited.add(node)
        rec_stack.add(node)
        for neighbor in graph.get(node, set()):
            if neighbor not in visited:
                if dfs(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True
        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            if dfs(node):
                return True

    return False


# Scheduling helpers
def course_level_floor(course_code: str) -> int:
    """
    Derive the earliest year a course should be scheduled from its course code.
    e.g. ECON212 -> level 2, ECON311 -> level 3, capped at MAX_YEARS.
    """
    match = re.search(r'(\d+)$', course_code)
    if not match:
        return 1
    level = int(match.group(1)) // 100
    return min(max(level, 1), MAX_YEARS)


def are_prerequisites_met(
    code: str,
    placed: set[str],
    prereq_map: dict[str, PrerequisiteRequirement],
) -> bool:
    """
    Return True if all prerequisite constraints for a course are satisfied
    by the set of already-placed courses.
    """
    if code not in prereq_map:
        return True

    for constraint in prereq_map[code].constraints:
        if constraint.and_set and not constraint.and_set.issubset(placed):
            return False
        if constraint.or_set and not any(c in placed for c in constraint.or_set):
            return False

    return True



def get_db_prereq_groups(db: Session, code: str) -> list[set[str]]:
    """Return prerequisite OR-groups for a course as a list of sets."""
    course = get_course_by_code(db, code)
    if not course:
        return []
    psets = db.query(PrerequisiteSet).filter(
        PrerequisiteSet.course_id == course.course_id
    ).all()
    groups = []
    for pset in psets:
        pset_courses = db.query(PrerequisiteSetCourse).filter(
            PrerequisiteSetCourse.set_id == pset.set_id
        ).all()
        codes_in_set = set()
        for psc in pset_courses:
            prereq = db.query(Course).filter(
                Course.course_id == psc.required_course_id
            ).first()
            if prereq:
                codes_in_set.add(prereq.course_code)
        if codes_in_set:
            groups.append(codes_in_set)
    return groups



# Prerequisite map builder
def build_prereq_maps(
    db: Session,
    codes: list[str],
    known_codes: set[str],
) -> tuple[dict[str, PrerequisiteRequirement], dict[str, set[str]]]:
    """
    Build two maps:
      prereq_requirements — PrerequisiteRequirement objects for scheduling logic
      full_edge_map       — all DB prerequisites for edge rendering
    """
    logger.info(
        "[build_prereq_maps] START — courses=%d | known_codes=%d",
        len(codes), len(known_codes),
    )

    prereq_requirements: dict[str, PrerequisiteRequirement] = {}
    full_edge_map: dict[str, set[str]] = {}

    for code in codes:
        course = get_course_by_code(db, code)

        psets = db.query(PrerequisiteSet).filter(
            PrerequisiteSet.course_id == course.course_id
        ).all()

        if not psets:
            prereq_requirements[code] = PrerequisiteRequirement(constraints=[])
            full_edge_map[code] = set()
            continue

        constraints: list[PrerequisiteConstraint] = []
        all_prereqs: set[str] = set()

        for pset in psets:
            pset_courses = db.query(PrerequisiteSetCourse).filter(
                PrerequisiteSetCourse.set_id == pset.set_id
            ).all()

            set_course_codes: list[str] = []
            for psc in pset_courses:
                prereq_course = db.query(Course).filter(
                    Course.course_id == psc.required_course_id
                ).first()
                if prereq_course:
                    set_course_codes.append(prereq_course.course_code)

            all_prereqs.update(set_course_codes)

            is_and_set = pset.min_required is None or pset.min_required == 0
            in_known = set(c for c in set_course_codes if c in known_codes)

            if is_and_set:
                constraint = PrerequisiteConstraint(and_set=in_known, or_set=set())
                constraints.append(constraint)
            else:
                constraint = PrerequisiteConstraint(and_set=set(), or_set=in_known)
                constraints.append(constraint)

        prereq_requirements[code] = PrerequisiteRequirement(constraints=constraints)
        full_edge_map[code] = all_prereqs
        logger.debug(
            "[build_prereq_maps] '%s' — %d constraint(s)", code, len(constraints)
        )

    logger.info(
        "[build_prereq_maps] DONE — prereq_requirements=%d entries | full_edge_map=%d entries",
        len(prereq_requirements), len(full_edge_map),
    )
    return prereq_requirements, full_edge_map
