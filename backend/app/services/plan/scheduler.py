"""
Course scheduler: places courses into years respecting prerequisites and credit caps.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code
from app.schemas.plan import CourseEdge, CourseNode
from app.services.plan.constants import CREDITS_PER_YEAR, DEFAULT_CREDITS, MAX_YEARS
from app.services.plan.prereq_types import PrerequisiteRequirement
from app.services.plan.prereq_utils import are_prerequisites_met, course_level_floor

logger = logging.getLogger(__name__)


def _filter_to_nearest_prereq_edges(
    edges: list[CourseEdge],
    placement: dict[str, int],
) -> list[CourseEdge]:
    """
    For each course, only keep the edge from its nearest scheduled prerequisite.
    If ECON212 (year 2) is a prereq for ECON322 (year 4), suppress any year-1
    prereq edges to ECON322 that are already covered by the ECON212 link.
    """
    by_dest: dict[str, list[CourseEdge]] = defaultdict(list)
    for edge in edges:
        by_dest[edge.to_course].append(edge)

    result: list[CourseEdge] = []
    for dest, incoming in by_dest.items():
        dest_year = placement.get(dest, 0)
        sorted_incoming = sorted(
            incoming,
            key=lambda e: dest_year - placement.get(e.from_course, 0),
        )
        if not sorted_incoming:
            continue
        nearest_gap = dest_year - placement.get(sorted_incoming[0].from_course, 0)
        for edge in sorted_incoming:
            if dest_year - placement.get(edge.from_course, 0) == nearest_gap:
                result.append(edge)

    return result


def schedule(
    db: Session,
    codes_to_schedule: list[str],
    prereq_map: dict[str, PrerequisiteRequirement],
    full_edge_map: dict[str, set[str]],
    completed_set: set[str],
    required_set: set[str],
) -> tuple[list[CourseNode], list[CourseEdge]]:
    """
    Schedule courses into years 1–MAX_YEARS respecting:
      1. Prerequisite ordering
      2. Course-level year floor
      3. 30-credit cap per year (enforced in all years including year 4)
    """
    logger.info(
        "[schedule] START — courses_to_schedule=%d | completed=%d | required=%d",
        len(codes_to_schedule), len(completed_set), len(required_set),
    )

    placed: set[str] = set(completed_set)
    remaining = list(codes_to_schedule)

    min_year: dict[str, int] = {code: course_level_floor(code) for code in codes_to_schedule}
    logger.debug("[schedule] Year floors: %s", min_year)

    credit_cache: dict[str, float] = {}
    for code in codes_to_schedule:
        course = get_course_by_code(db, code)
        credit_cache[code] = float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS

    course_nodes: list[CourseNode] = []
    placement: dict[str, int] = {}
    year = 1
    credits_used = 0.0

    while remaining and year <= MAX_YEARS:
        eligible = [
            code for code in remaining
            if are_prerequisites_met(code, placed, prereq_map)
            and min_year.get(code, 1) <= year
        ]

        logger.debug(
            "[schedule] Year %d — remaining=%d | eligible=%d | credits_used=%.1f",
            year, len(remaining), len(eligible), credits_used,
        )

        if not eligible:
            if year < MAX_YEARS:
                logger.debug(
                    "[schedule] No eligible courses for year %d; advancing to year %d.",
                    year, year + 1,
                )
                year += 1
                credits_used = 0.0
                continue
            else:
                logger.warning(
                    "[schedule] Could not fully resolve prerequisites for: %s. "
                    "Forcing into year %d.",
                    remaining, year,
                )
                eligible = list(remaining)

        placed_this_round: list[str] = []
        skipped_this_round: list[str] = []
        not_found_this_round: list[str] = []

        for code in eligible:
            course_credits = credit_cache.get(code, DEFAULT_CREDITS)

            if credits_used + course_credits > CREDITS_PER_YEAR:
                if year < MAX_YEARS:
                    logger.debug(
                        "[schedule] Credit cap reached (%.1f + %.1f > %d); "
                        "advancing to year %d for '%s'.",
                        credits_used, course_credits, CREDITS_PER_YEAR, year + 1, code,
                    )
                    year += 1
                    credits_used = 0.0
                    break  # Recompute eligible for new year
                else:
                    logger.warning(
                        "[schedule] Year %d credit cap exceeded; skipping '%s' (%.1f cr). "
                        "Consider adding a 5th year or reducing electives.",
                        year, code, course_credits,
                    )
                    skipped_this_round.append(code)
                    continue

            course = get_course_by_code(db, code)
            if not course:
                logger.warning(
                    "[schedule] Course '%s' not found in DB; removing from schedule.", code
                )
                not_found_this_round.append(code)
                continue

            course_nodes.append(
                CourseNode(
                    course_code=course.course_code,
                    title=course.title or "",
                    units=float(course.credits) if course.credits else None,
                    year=year,
                    semester=None,
                    is_required=code in required_set,
                )
            )

            placement[code] = year
            placed.add(code)
            placed_this_round.append(code)
            credits_used += course_credits

            logger.debug(
                "[schedule] Placed '%s' in year %d (is_required=%s, credits=%.1f, running=%.1f)",
                code, year, code in required_set, course_credits, credits_used,
            )

        codes_to_remove = set(placed_this_round + skipped_this_round + not_found_this_round)
        for code in codes_to_remove:
            if code in remaining:
                remaining.remove(code)

    if remaining:
        logger.warning(
            "[schedule] %d course(s) could not be scheduled: %s", len(remaining), remaining
        )
    else:
        logger.info("[schedule] All courses placed successfully.")

    # Build edges — only emit edges where both endpoints are in the plan
    scheduled_set: set[str] = set(placement.keys()) | completed_set
    edges: list[CourseEdge] = []
    emitted: set[tuple[str, str]] = set()

    for code, prereqs in full_edge_map.items():
        for prereq_code in prereqs:
            if prereq_code not in scheduled_set:
                continue
            key = (prereq_code, code)
            if key not in emitted:
                emitted.add(key)
                edges.append(
                    CourseEdge(
                        from_course=prereq_code,
                        to_course=code,
                        edge_type="prerequisite",
                    )
                )

    edges = _filter_to_nearest_prereq_edges(edges, placement)
    logger.info("[schedule] Built %d edge(s).", len(edges))

    # Append completed course nodes
    for code in completed_set:
        course = get_course_by_code(db, code)
        if course:
            course_nodes.append(
                CourseNode(
                    course_code=course.course_code,
                    title=course.title or "",
                    units=float(course.credits) if course.credits else None,
                    year=0,
                    semester="Completed",
                    is_required=False,
                )
            )
        else:
            logger.warning(
                "[schedule] Completed course '%s' not found in DB; skipping.", code
            )

    logger.info(
        "[schedule] DONE — course_nodes=%d | edges=%d", len(course_nodes), len(edges)
    )
    return course_nodes, edges
