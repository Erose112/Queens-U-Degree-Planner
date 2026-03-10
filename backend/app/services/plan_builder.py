"""
Plan generation service.
"""
from __future__ import annotations
from typing import NamedTuple

import logging
import re
from collections import defaultdict

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code, get_free_electives_by_level
from app.queries.program_queries import get_program_with_sections_and_courses
from app.schemas.plan import (
    CourseEdge,
    CourseNode,
    PlanResponse,
)
from app.services.recommendation_services import get_recommendations_for_program
from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse


logger = logging.getLogger(__name__)

CREDITS_PER_YEAR = 30
MAX_YEARS = 4
TOTAL_PLAN_CREDITS = 120
DEFAULT_CREDITS = 3.0

# Logic type constants must match seeder contract
LOGIC_REQUIRED = 1
LOGIC_CHOOSE_CREDITS = 2
LOGIC_CHOOSE_COUNT = 3


# Data structures for prereq logic
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
                logger.warning(
                    "Cycle detected in prerequisite graph: %s -> %s", node, neighbor
                )
                return True
        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            if dfs(node):
                return True

    return False


# Helper functions
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


# Main entry point
def generate_plan(
    db: Session,
    program_id: int,
    completed_courses: list[str],
    favourites: list[str],
    interested: list[str]
) -> PlanResponse | None:

    logger.info(
        "[generate_plan] START — program_id=%d | completed=%d course(s) | favourites=%s | interested=%s",
        program_id, len(completed_courses), favourites, interested,
    )

    # Get program data
    program = get_program_with_sections_and_courses(db, program_id)
    if not program:
        logger.warning("[generate_plan] Program %d not found. Aborting.", program_id)
        return None

    logger.info(
        "[generate_plan] Loaded program '%s' (%s) with %d section(s).",
        program.program_name, program.program_type, len(program.sections),
    )

    completed_set: set[str] = set(completed_courses)

    required_codes: list[str] = []
    elective_codes: list[str] = []

    core_credits = 0.0
    elective_credits = 0.0
    

    # Section parsing
    for section in program.sections:
        logic = section.logic_rules[0] if section.logic_rules else None
        logic_type = logic.logic_type if logic else LOGIC_REQUIRED
        logic_value = logic.logic_value if logic else 0

        section_course_list = [
            sc.course for sc in section.section_courses if sc.course is not None
        ]
        n_courses = len(section_course_list)

        avg_credits = (
            sum(float(c.credits or DEFAULT_CREDITS) for c in section_course_list) / n_courses
            if n_courses > 0 else DEFAULT_CREDITS
        )

        logger.debug(
            "[generate_plan] Section %d — logic_type=%d | logic_value=%s | "
            "courses=%d | avg_credits=%.1f",
            section.section_id, logic_type, logic_value, n_courses, avg_credits,
        )

        if logic_type == LOGIC_REQUIRED:
            # Complete ALL — every course is required/core
            for course in section_course_list:
                units = float(course.credits or DEFAULT_CREDITS)
                if course.course_code not in required_codes:
                    required_codes.append(course.course_code)
                core_credits += units
            logger.debug(
                "[generate_plan] Section %d (REQUIRED) → added %d core course(s). "
                "Running core_credits=%.1f",
                section.section_id, n_courses, core_credits,
            )

        elif logic_type == LOGIC_CHOOSE_CREDITS:
            credits_to_pick = float(logic_value or 0)
            section_codes = [c.course_code for c in section_course_list]
            
            # Still add to flat pool for backward compat with rank_electives
            for code in section_codes:
                if code not in elective_codes:
                    elective_codes.append(code)
            
            elective_credits += credits_to_pick

        elif logic_type == LOGIC_CHOOSE_COUNT:
            n_to_pick = logic_value or 1
            if n_to_pick >= n_courses:
                # Must pick all, treat as core
                for course in section_course_list:
                    units = float(course.credits or DEFAULT_CREDITS)
                    if course.course_code not in required_codes:
                        required_codes.append(course.course_code)
                    core_credits += units
            else:
                # Rank candidates by recommendation score and pick top n
                section_codes = [c.course_code for c in section_course_list]
                seed_codes_early = list(completed_set) + favourites + interested

                ranked = get_recommendations_for_program(
                    db,
                    program_id=program_id,
                    completed_course_codes=seed_codes_early,
                    top_k=len(section_codes),
                )

                ranked_section_codes = [
                    c.course_code for c, _ in ranked
                    if c.course_code in set(section_codes)
                ] if ranked else []

                # Fall back to original order if recommender returns nothing
                unranked = [c for c in section_codes if c not in set(ranked_section_codes)]
                ordered = ranked_section_codes + unranked

                picked = ordered[:n_to_pick]
                for code in picked:
                    if code not in required_codes:
                        required_codes.append(code)
                    course_obj = get_course_by_code(db, code)
                    core_credits += float(course_obj.credits or DEFAULT_CREDITS) if course_obj else DEFAULT_CREDITS

                logger.debug(
                    "[generate_plan] Section %d (CHOOSE_COUNT pick-%d of %d) → picked: %s",
                    section.section_id, n_to_pick, n_courses, picked,
                )


        else:
            logger.warning(
                "[generate_plan] Section %d — unrecognised logic_type=%d | "
                "logic_value=%s | courses=%d. Section will be skipped.",
                section.section_id, logic_type, logic_value, n_courses,
            )

    logger.info(
        "[generate_plan] Section parsing complete — required_codes=%d | "
        "elective_candidates=%d | "
        "core_credits=%.1f | elective_credits=%.1f",
        len(required_codes), len(elective_codes),
        core_credits, elective_credits,
    )


    # Compute credit leftovers with accurate values
    required_credits = sum(
        float(course.credits or DEFAULT_CREDITS)
        for c in required_codes
        if (course := get_course_by_code(db, c)) is not None
    )
    completed_required_credits = sum(
        float(course.credits or DEFAULT_CREDITS)
        for c in completed_set
        if c in set(required_codes)
        if (course := get_course_by_code(db, c)) is not None
    )

    # Credits of courses added to plan
    committed_credits = required_credits - completed_required_credits

    elective_pool_credits = sum(
        float(course.credits or DEFAULT_CREDITS)
        for c in elective_codes
        if (course := get_course_by_code(db, c)) is not None
    )

    remaining_credit_gap = max(
        min(TOTAL_PLAN_CREDITS - committed_credits, elective_pool_credits),
        elective_credits,
        0.0,
    )

    logger.info(
        "[generate_plan] Credit budget — total_target=%d | required=%.1f | "
        " completed_required=%.1f | committed=%.1f | "
        "gap_for_electives=%.1f (section_elective_req=%.1f)",
        TOTAL_PLAN_CREDITS, required_credits,
        completed_required_credits, committed_credits,
        remaining_credit_gap, elective_credits,
    )


    interested_to_schedule: set[str] = set()
    for course in interested:
        course_obj = get_course_by_code(db, course)  # null check
        if not course_obj:
            logger.warning("[generate_plan] Interested course '%s' not found in DB; skipping.", course)
            continue
        credit = float(course_obj.credits or DEFAULT_CREDITS)
        if course not in completed_set and course not in set(required_codes) and remaining_credit_gap - credit >= 0:
            interested_to_schedule.add(course)
            remaining_credit_gap -= credit


    # Rank / select electives
    seed_codes = list(completed_set) + favourites

    logger.info(
        "[generate_plan] Ranking electives — candidates=%d | seed_codes=%d | "
        "elective_credits_required=%.1f",
        len(elective_codes), len(seed_codes), remaining_credit_gap,
    )

    ranked_electives = rank_electives(
        db, elective_codes, seed_codes, program_id, completed_courses, remaining_credit_gap
    )


    logger.info(
        "[generate_plan] rank_electives returned %d course(s): %s",
        len(ranked_electives), ranked_electives,
    )


    # Build deduplicated schedule list and enforce 120cr hard limit
    required_set: set[str] = set(required_codes)

    all_to_schedule: list[str] = []
    seen: set[str] = set()
    scheduled_credits = 0.0


    for code in required_codes + list(interested_to_schedule) + ranked_electives:
        if code in seen or code in completed_set:
            continue
        course = get_course_by_code(db, code)
        course_cr = float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS
        if scheduled_credits + course_cr > TOTAL_PLAN_CREDITS:
            break
        seen.add(code)
        all_to_schedule.append(code)
        scheduled_credits += course_cr

    logger.info(
        "[generate_plan] Schedule list built — total_to_schedule=%d | "
        "scheduled_credits=%.1f / %d "
        "(required=%d | ranked_electives=%d, excl. %d completed)",
        len(all_to_schedule), scheduled_credits, TOTAL_PLAN_CREDITS,
        len(required_codes), len(ranked_electives), len(completed_set),
    )

    credit_cache: dict[str, float] = {
        code: float(course.credits or DEFAULT_CREDITS)
        for code in all_to_schedule
        if (course := get_course_by_code(db, code)) is not None
    }

    year1_credits = sum(
        credit_cache.get(code, DEFAULT_CREDITS) for code in all_to_schedule
        if course_level_floor(code) == 1
    )

    if year1_credits < CREDITS_PER_YEAR:
        shortfall = CREDITS_PER_YEAR - year1_credits
        logger.info(
            "[generate_plan] Year 1 underloaded (%.1f / %d cr) — "
            "backfilling %.1f cr from free elective pool.",
            year1_credits, CREDITS_PER_YEAR, shortfall,
        )
        free_electives = get_free_electives_by_level(
            db, level=100, exclude=set(all_to_schedule) | completed_set
        )
        for course in free_electives:
            units = float(course.credits or DEFAULT_CREDITS)
            if shortfall <= 0 or scheduled_credits + units > TOTAL_PLAN_CREDITS:
                break

            scheduled_credits += units
            all_to_schedule.append(course.course_code)
            seen.add(course.course_code)
            shortfall -= units
            logger.debug(
                "[generate_plan] Backfilled '%s' (%.1f cr) — remaining shortfall=%.1f",
                course.course_code, units, shortfall,
            )


    # Prerequisite maps
    logger.info(
        "[generate_plan] Building prerequisite maps for %d course(s).", len(all_to_schedule)
    )
    known_codes: set[str] = set(all_to_schedule) | completed_set
    prereq_map, full_edge_map = build_prereq_maps(db, all_to_schedule, known_codes)
    logger.info(
        "[generate_plan] Prereq maps built — prereq_map entries=%d | full_edge_map entries=%d",
        len(prereq_map), len(full_edge_map),
    )

    if has_cycle_in_graph(prereq_map):
        logger.warning(
            "[generate_plan] Cycle detected in prerequisite graph for program %d. "
            "Course scheduling may be incomplete.", program_id,
        )
    else:
        logger.debug("[generate_plan] No cycles detected in prerequisite graph.")


    # Schedule
    logger.info("[generate_plan] Running scheduler.")
    course_nodes, edges = schedule(
        db,
        codes_to_schedule=all_to_schedule,
        prereq_map=prereq_map,
        full_edge_map=full_edge_map,
        completed_set=completed_set,
        required_set=required_set,
    )
    logger.info(
        "[generate_plan] Scheduler returned — course_nodes=%d | edges=%d",
        len(course_nodes), len(edges),
    )

    # Credit totals computed from actual scheduled courses
    actual_core_credits = 0.0
    actual_elective_credits = 0.0

    for node in course_nodes:
        if node.semester == "Completed":
            continue
        units = node.units or DEFAULT_CREDITS
        # Required courses and mandatory choice picks both count as core
        if node.is_required:
            actual_core_credits += units
        else:
            actual_elective_credits += units

    # Always derived total from what was actually scheduled
    total_units = actual_core_credits + actual_elective_credits

    logger.info(
        "[generate_plan] Credit summary — total=%.1f | core=%.1f | elective=%.1f",
        total_units, actual_core_credits, actual_elective_credits,
    )
    logger.info(
        "[generate_plan] DONE — returning PlanResponse for program_id=%d.", program_id
    )

    return PlanResponse(
        program_name=program.program_name or "",
        program_code=program.program_type or "",
        total_units=total_units,
        core_units=round(actual_core_credits, 1),
        elective_units=round(actual_elective_credits, 1),
        courses=course_nodes,
        edges=edges,
    )



# Elective ranking
def rank_electives(
    db: Session,
    elective_codes: list[str],
    seed_codes: list[str],
    program_id: int,
    completed_courses: list[str],
    elective_credits_required: float = 0.0,
) -> list[str]:
    """
    Select electives from the candidate pool to meet the required credit amount.
    Returns only enough electives to reach elective_credits_required.
    """
    logger.info(
        "[rank_electives] START — candidates=%d | seed_codes=%d | credits_required=%.1f",
        len(elective_codes), len(seed_codes), elective_credits_required,
    )

    if not elective_codes:
        logger.info("[rank_electives] No elective candidates provided. Returning [].")
        return []

    if elective_credits_required <= 0:
        logger.info("[rank_electives] No elective credits required. Returning [].")
        return []

    elective_credits_map: dict[str, float] = {}
    for code in elective_codes:
        course = get_course_by_code(db, code)
        if course:
            elective_credits_map[code] = float(course.credits or DEFAULT_CREDITS)
        else:
            elective_credits_map[code] = DEFAULT_CREDITS

    logger.debug("[rank_electives] Credit map built: %s", elective_credits_map)

    ranked = get_recommendations_for_program(
        db,
        program_id=program_id,
        completed_course_codes=seed_codes or completed_courses,
        top_k=len(elective_codes),
    )
    logger.info(
        "[rank_electives] Recommendation engine returned %d result(s).",
        len(ranked) if ranked else 0,
    )

    selected_electives: list[str] = []
    credits_accumulated = 0.0
    elective_set = set(elective_codes)

    if ranked:
        ranked_codes = [c.course_code for c, _ in ranked if c.course_code in elective_set]
        ranked_set = set(ranked_codes)
        unranked = [c for c in elective_codes if c not in ranked_set]
        ordered = ranked_codes + unranked
        logger.debug(
            "[rank_electives] Ordered pool — ranked=%d | unranked_fallback=%d",
            len(ranked_set), len(unranked),
        )
    else:
        logger.info("[rank_electives] No recommendations; falling back to original elective order.")
        ordered = elective_codes

    for code in ordered:
        if credits_accumulated >= elective_credits_required:
            break
        selected_electives.append(code)
        credits_accumulated += elective_credits_map.get(code, DEFAULT_CREDITS)
        logger.debug(
            "[rank_electives] Selected '%s' (%.1f cr) — accumulated=%.1f / required=%.1f",
            code, elective_credits_map.get(code, DEFAULT_CREDITS), credits_accumulated,
            elective_credits_required,
        )

    logger.info(
        "[rank_electives] DONE — selected %d elective(s) totalling %.1f credits: %s",
        len(selected_electives), credits_accumulated, selected_electives,
    )
    return selected_electives


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
        if not course:
            logger.warning(
                "[build_prereq_maps] Course '%s' not found in DB; skipping.", code
            )
            continue

        psets = db.query(PrerequisiteSet).filter(
            PrerequisiteSet.course_id == course.course_id
        ).all()

        if not psets:
            prereq_requirements[code] = PrerequisiteRequirement(constraints=[])
            full_edge_map[code] = set()
            logger.debug("[build_prereq_maps] '%s' — no prerequisite sets.", code)
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

            if not in_known:
                logger.debug(
                    "[build_prereq_maps] '%s' set %d — no in-plan courses found; skipping constraint.",
                    code, pset.set_id,
                )
                continue

            if is_and_set:
                constraint = PrerequisiteConstraint(and_set=in_known, or_set=set())
                constraints.append(constraint)
                logger.debug(
                    "[build_prereq_maps] '%s' set %d (AND) — blocking courses: %s",
                    code, pset.set_id, in_known,
                )
            else:
                min_req = pset.min_required or 1
                constraint = PrerequisiteConstraint(and_set=set(), or_set=in_known)
                constraints.append(constraint)
                logger.debug(
                    "[build_prereq_maps] '%s' set %d (OR, need %d) — options: %s",
                    code, pset.set_id, min_req, in_known,
                )

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




def _filter_to_nearest_prereq_edges(
    edges: list[CourseEdge],
    placement: dict[str, int],
) -> list[CourseEdge]:
    """
    For each course, only keep the edge from its nearest scheduled prerequisite.
    If ECON212 (year 2) is a prereq for ECON322 (year 4), suppress any year-1
    prereq edges to ECON322 that are already covered by the ECON212 link.
    """
    # Group edges by destination
    by_dest: dict[str, list[CourseEdge]] = defaultdict(list)
    for edge in edges:
        by_dest[edge.to_course].append(edge)

    result: list[CourseEdge] = []
    for dest, incoming in by_dest.items():
        dest_year = placement.get(dest, 0)

        # Sort by how close the source year is to the destination year
        sorted_incoming = sorted(
            incoming,
            key=lambda e: dest_year - placement.get(e.from_course, 0)
        )

        # Keep only edges from the nearest year(s)
        if not sorted_incoming:
            continue
        nearest_gap = dest_year - placement.get(sorted_incoming[0].from_course, 0)
        for edge in sorted_incoming:
            gap = dest_year - placement.get(edge.from_course, 0)
            if gap == nearest_gap:
                result.append(edge)

    return result




# Scheduler

def schedule(
    db: Session,
    codes_to_schedule: list[str],
    prereq_map: dict[str, PrerequisiteRequirement],
    full_edge_map: dict[str, set[str]],
    completed_set: set[str],
    required_set: set[str],
) -> tuple[list[CourseNode], list[CourseEdge]]:
    """
    Schedule courses into years 1 MAX_YEARS respecting:
      1. Prerequisite ordering
      2. Course-level year floor
      3. 30-credit cap per year (enforced in all years including year 4)
    """
    logger.info(
        "[schedule] START — courses_to_schedule=%d | completed=%d | "
        "required=%d",
        len(codes_to_schedule), len(completed_set),
        len(required_set),
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

        for code in eligible:
            course_credits = credit_cache.get(code, DEFAULT_CREDITS)

            if credits_used + course_credits > CREDITS_PER_YEAR:
                if year < MAX_YEARS:
                    # Advance year and recompute eligibility
                    logger.debug(
                        "[schedule] Credit cap reached (%.1f + %.1f > %d); "
                        "advancing to year %d for '%s'.",
                        credits_used, course_credits, CREDITS_PER_YEAR, year + 1, code,
                    )
                    year += 1
                    credits_used = 0.0
                    break  # Exit for-loop; outer while recomputes eligible
                else:
                    # Year 4: cannot advance skip this course
                    logger.warning(
                        "[schedule] Year %d credit cap exceeded; skipping '%s' (%.1f cr). "
                        "Consider adding a 5th year or reducing electives.",
                        year, code, course_credits,
                    )
                    remaining.remove(code)
                    continue

            course = get_course_by_code(db, code)
            if not course:
                logger.warning(
                    "[schedule] Course '%s' not found in DB; removing from schedule.", code
                )
                remaining.remove(code)
                continue

            is_required = code in required_set

            course_nodes.append(
                CourseNode(
                    course_code=course.course_code,
                    title=course.title or "",
                    units=float(course.credits) if course.credits else None,
                    year=year,
                    semester=None,
                    is_required=is_required,
                )
            )

            placement[code] = year
            placed.add(code)
            remaining.remove(code)
            credits_used += course_credits

            logger.debug(
                "[schedule] Placed '%s' in year %d "
                "(is_required=%s,, credits=%.1f, running=%.1f)",
                code, year, is_required, course_credits, credits_used,
            )

    if remaining:
        logger.warning(
            "[schedule] %d course(s) could not be scheduled: %s", len(remaining), remaining
        )
    else:
        logger.info("[schedule] All courses placed successfully.")


    # Build edges, only emit edges where both endpoints are in the plan
    scheduled_set: set[str] = set(placement.keys()) | completed_set

    edges: list[CourseEdge] = []
    emitted: set[tuple[str, str]] = set()

    for code, prereqs in full_edge_map.items():
        for prereq_code in prereqs:
            # Skip edges whose source is not in the plan (ghost courses)
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
        "[schedule] DONE — course_nodes=%d | edges=%d ",
        len(course_nodes), len(edges),
    )
    return course_nodes, edges
