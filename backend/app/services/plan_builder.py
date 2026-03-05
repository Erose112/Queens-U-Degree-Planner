"""
Plan generation service.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code
from app.queries.program_queries import get_program_with_sections_and_courses
from app.schemas.plan import (
    ChoiceNode,
    ChoiceOption,
    CourseEdge,
    CourseNode,
    PlanResponse,
)
from app.services.recommendation_services import get_highest_scored_courses
from app.services.recommendation_services import get_recommendations_for_program
from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse


logger = logging.getLogger(__name__)

CREDITS_PER_YEAR = 30
MAX_YEARS = 4
TOTAL_PLAN_CREDITS = 120


def has_cycle_in_graph(graph: dict[str, set[str]]) -> bool:
    """
    Detect cycles in a directed graph using depth-first search.
    """
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
                logger.warning("Cycle detected in prerequisite graph: %s -> %s", node, neighbor)
                return True

        rec_stack.remove(node)
        return False

    for node in graph:
        if node not in visited:
            if dfs(node):
                return True

    return False


def course_level_floor(course_code: str) -> int:
    """
    Derive minimum year from course code number.
    BCHM102 -> 1, CHEM211 -> 2, BCHM319 -> 3, BCHM432 -> 4
    """
    match = re.search(r'(\d)', course_code)
    if not match:
        return 1
    return min(max(int(match.group(1)), 1), MAX_YEARS)


def generate_plan(
    db: Session,
    program_id: int,
    completed_courses: list[str],
    interests: list[str],
) -> PlanResponse | None:
    logger.info(
        "[generate_plan] START — program_id=%d | completed=%d course(s) | interests=%s",
        program_id, len(completed_courses), interests,
    )

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
    choice_groups: dict[str, list[str]] = defaultdict(list)
    elective_codes: list[str] = []

    core_credits = 0.0
    elective_credits = 0.0

    #  Section parsing
    for section in program.sections:
        logic = section.logic_rules[0] if section.logic_rules else None
        logic_type = logic.logic_type if logic else 0
        logic_value = logic.logic_value if logic else 0

        section_course_list = [sc.course for sc in section.section_courses if sc.course is not None]
        n_courses = len(section_course_list)

        avg_credits = (
            sum(float(c.credits or 3) for c in section_course_list) / n_courses
            if n_courses > 0 else 3.0
        )

        logger.debug(
            "[generate_plan] Section %d — logic_type=%d | logic_value=%s | courses=%d | avg_credits=%.1f",
            section.section_id, logic_type, logic_value, n_courses, avg_credits,
        )

        if logic_type == 0:
            # Complete ALL — every course is required/core
            for course in section_course_list:
                units = float(course.credits or 3)
                if course.course_code not in required_codes:
                    required_codes.append(course.course_code)
                core_credits += units
            logger.debug(
                "[generate_plan] Section %d (ALL required) → added %d core course(s). Running core_credits=%.1f",
                section.section_id, n_courses, core_credits,
            )

        elif logic_type == 1:
            n_to_pick = logic_value or 1
            if n_to_pick >= n_courses:
                # Must pick all — treat as core
                for course in section_course_list:
                    units = float(course.credits or 3)
                    if course.course_code not in required_codes:
                        required_codes.append(course.course_code)
                    core_credits += units
                logger.debug(
                    "[generate_plan] Section %d (pick-%d of %d → all required) → added %d core course(s). Running core_credits=%.1f",
                    section.section_id, n_to_pick, n_courses, n_courses, core_credits,
                )
            else:
                # Pick-N group → resolved by recommendation system into resolved_choices.
                # Do NOT add to elective_codes — choice resolution handles scheduling.
                for course in section_course_list:
                    choice_groups[str(section.section_id)].append(course.course_code)
                # Credits = n_to_pick * credits of each chosen course (use avg as best estimate
                # before resolution; actual per-course credits are used at scheduling time).
                section_credit_req = float(section.credit_req or 0)
                added = section_credit_req if section_credit_req > 0 else n_to_pick * avg_credits
                core_credits += added   # choice group credits count toward core, not elective
                logger.debug(
                    "[generate_plan] Section %d (pick-%d of %d → choice group) → %d candidate(s). "
                    "core_credits += %.1f (running=%.1f)",
                    section.section_id, n_to_pick, n_courses, n_courses, added, core_credits,
                )

        else:
            for course in section_course_list:
                elective_codes.append(course.course_code)
            section_credit_req = float(section.credit_req or 0)
            added = section_credit_req if section_credit_req > 0 else len(section_course_list) * avg_credits
            elective_credits += added
            logger.debug(
                "[generate_plan] Section %d (open elective) → %d candidate(s) added. "
                "elective_credits += %.1f (running=%.1f)",
                section.section_id, n_courses, added, elective_credits,
            )

    logger.info(
        "[generate_plan] Section parsing complete — required_codes=%d | choice_groups=%d | "
        "elective_candidates=%d | core_credits=%.1f | elective_credits=%.1f",
        len(required_codes), len(choice_groups), len(elective_codes), core_credits, elective_credits,
    )

    # ------------------------------------------------------------------ #
    #  Rank / select electives to fill remaining credit gap               #
    # ------------------------------------------------------------------ #
    seed_codes = list(completed_set) + interests

    # Credits already committed by required + choice group courses
    committed_credits = core_credits
    # Subtract credits for completed courses so we don't over-fill
    completed_credits = sum(
        float((get_course_by_code(db, c) or type("", (), {"credits": 3})()).credits or 3)
        for c in completed_set
        if c in set(required_codes)  # only committed completed courses count
    )
    remaining_credit_gap = max(0.0, TOTAL_PLAN_CREDITS - committed_credits)

    logger.info(
        "[generate_plan] Credit budget — total_target=%d | committed_core=%.1f | "
        "gap_for_electives=%.1f",
        TOTAL_PLAN_CREDITS, committed_credits, remaining_credit_gap,
    )
    logger.info(
        "[generate_plan] Ranking electives — seed_codes=%d | elective_credits_required=%.1f",
        len(seed_codes), remaining_credit_gap,
    )
    ranked_electives = rank_electives(
        db, elective_codes, seed_codes, program_id, completed_courses, remaining_credit_gap
    )
    logger.info(
        "[generate_plan] rank_electives returned %d course(s): %s",
        len(ranked_electives), ranked_electives,
    )

    # ------------------------------------------------------------------ #
    #  Resolve choice groups                                              #
    # ------------------------------------------------------------------ #
    resolved_choices: list[str] = []
    choice_nodes: list[ChoiceNode] = []

    logger.info("[generate_plan] Resolving %d choice group(s).", len(choice_groups))
    for group_idx, (group_id, group_codes) in enumerate(choice_groups.items()):
        section_id = int(group_id)
        section = next((s for s in program.sections if s.section_id == section_id), None)
        logic = section.logic_rules[0] if section and section.logic_rules else None
        n_required = logic.logic_value if logic and logic.logic_value else 1

        logger.debug(
            "[generate_plan] Choice group '%s' (section %d) — %d candidate(s), need %d.",
            group_id, section_id, len(group_codes), n_required,
        )

        ranked = get_highest_scored_courses(db, group_codes, top_k=len(group_codes))
        if not ranked:
            logger.debug(
                "[generate_plan] No scored courses for group '%s'; falling back to raw lookup.",
                group_id,
            )
            ranked = [
                (get_course_by_code(db, code), 0.0)
                for code in group_codes
                if get_course_by_code(db, code)
            ]

        options = [
            ChoiceOption(
                course_code=c.course_code,
                title=c.title or "",
                units=float(c.credits) if c.credits else None,
            )
            for c, _ in ranked
            if c is not None
        ]

        picked = []
        for option in options[:n_required]:
            if option.course_code not in required_codes:
                resolved_choices.append(option.course_code)
                picked.append(option.course_code)

        logger.debug(
            "[generate_plan] Choice group '%s' resolved → picked: %s", group_id, picked,
        )

        choice_nodes.append(
            ChoiceNode(
                choice_id=f"choice_{group_id}",
                label=f"Pick {n_required} of {len(options)}",
                year=0,
                position=group_idx,
                required=True,
                options=options,
            )
        )

    logger.info(
        "[generate_plan] Choice resolution complete — resolved_choices=%d | choice_nodes=%d",
        len(resolved_choices), len(choice_nodes),
    )

    #  Build deduplicated schedule list — enforce 120cr hard limit        #
    required_set: set[str] = set(required_codes)
    resolved_set: set[str] = set(resolved_choices)

    all_to_schedule: list[str] = []
    seen: set[str] = set()
    scheduled_credits = 0.0

    # Priority order: required → choice-resolved → ranked electives
    # ranked_electives is already trimmed to the credit gap by rank_electives()
    for code in required_codes + resolved_choices + ranked_electives:
        if code in seen or code in completed_set:
            continue
        course = get_course_by_code(db, code)
        course_cr = float(course.credits or 3) if course else 3.0
        if scheduled_credits + course_cr > TOTAL_PLAN_CREDITS:
            logger.debug(
                "[generate_plan] Skipping '%s' (%.1f cr) — would exceed %d-credit plan limit (used=%.1f).",
                code, course_cr, TOTAL_PLAN_CREDITS, scheduled_credits,
            )
            continue
        seen.add(code)
        all_to_schedule.append(code)
        scheduled_credits += course_cr

    logger.info(
        "[generate_plan] Schedule list built — total_to_schedule=%d | scheduled_credits=%.1f / %d "
        "(required=%d | resolved=%d | ranked_electives=%d, excl. %d completed)",
        len(all_to_schedule), scheduled_credits, TOTAL_PLAN_CREDITS,
        len(required_codes), len(resolved_choices), len(ranked_electives), len(completed_set),
    )

    #  Prerequisite maps
    logger.info("[generate_plan] Building prerequisite maps for %d course(s).", len(all_to_schedule))
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

    #  Schedule                                                           #
    logger.info("[generate_plan] Running scheduler.")
    course_nodes, updated_choice_nodes, edges = schedule(
        db,
        codes_to_schedule=all_to_schedule,
        prereq_map=prereq_map,
        full_edge_map=full_edge_map,
        completed_set=completed_set,
        required_set=required_set,
        choice_nodes=choice_nodes,
        resolved_choices=resolved_set,
    )
    logger.info(
        "[generate_plan] Scheduler returned — course_nodes=%d | edges=%d | choice_nodes=%d",
        len(course_nodes), len(edges), len(updated_choice_nodes),
    )


    #  Append completed courses
    for code in completed_courses:
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
            logger.warning("[generate_plan] Completed course '%s' not found in DB; skipping.", code)


    #  Credit totals
    actual_core_credits = 0.0
    actual_elective_credits = 0.0

    for course in course_nodes:
        if course.semester == "Completed":
            continue
        units = course.units or 3.0
        if course.is_required:
            actual_core_credits += units
        else:
            actual_elective_credits += units

    total_units = (
        float(program.total_credits)
        if program.total_credits
        else actual_core_credits + actual_elective_credits
    )

    logger.info(
        "[generate_plan] Credit summary — total=%.1f | core=%.1f | elective=%.1f",
        total_units, actual_core_credits, actual_elective_credits,
    )
    logger.info("[generate_plan] DONE — returning PlanResponse for program_id=%d.", program_id)

    return PlanResponse(
        program_name=program.program_name or "",
        program_code=program.program_type or "",
        total_units=total_units,
        core_units=round(actual_core_credits, 1),
        elective_units=round(actual_elective_credits, 1),
        courses=course_nodes,
        choices=updated_choice_nodes,
        edges=edges,
    )


def rank_electives(
    db: Session,
    elective_codes: list[str],
    seed_codes: list[str],
    program_id: int,
    completed_courses: list[str],
    elective_credits_required: float = 0.0,
) -> list[str]:
    """
    Select electives to meet the required credit amount.
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
            elective_credits_map[code] = float(course.credits or 3.0)
        else:
            logger.warning("[rank_electives] Elective course '%s' not found in DB; defaulting to 3.0 credits.", code)
            elective_credits_map[code] = 3.0

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

    if ranked:
        ranked_codes = [c.course_code for c, _ in ranked if c.course_code in set(elective_codes)]
        ranked_set = set(ranked_codes)
        unranked = [c for c in elective_codes if c not in ranked_set]
        ranked_codes += unranked
        logger.debug(
            "[rank_electives] Ordered pool — ranked=%d | unranked_fallback=%d",
            len(ranked_set), len(unranked),
        )

        for code in ranked_codes:
            if credits_accumulated >= elective_credits_required:
                break
            selected_electives.append(code)
            credits_accumulated += elective_credits_map.get(code, 3.0)
            logger.debug(
                "[rank_electives] Selected '%s' (%.1f cr) — accumulated=%.1f / required=%.1f",
                code, elective_credits_map.get(code, 3.0), credits_accumulated, elective_credits_required,
            )
    else:
        logger.info("[rank_electives] No recommendations; falling back to original elective order.")
        for code in elective_codes:
            if credits_accumulated >= elective_credits_required:
                break
            selected_electives.append(code)
            credits_accumulated += elective_credits_map.get(code, 3.0)
            logger.debug(
                "[rank_electives] Selected '%s' (%.1f cr) — accumulated=%.1f / required=%.1f",
                code, elective_credits_map.get(code, 3.0), credits_accumulated, elective_credits_required,
            )

    logger.info(
        "[rank_electives] DONE — selected %d elective(s) totalling %.1f credits: %s",
        len(selected_electives), credits_accumulated, selected_electives,
    )
    return selected_electives


def build_prereq_maps(
    db: Session,
    codes: list[str],
    known_codes: set[str],
) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """
    Returns two maps:
    - prereq_map:    only prereqs inside known_codes (used for scheduling order)
    - full_edge_map: ALL prereqs from DB (used for building edges)
    """
    logger.info(
        "[build_prereq_maps] START — courses=%d | known_codes=%d",
        len(codes), len(known_codes),
    )

    prereq_map: dict[str, set[str]] = {}
    full_edge_map: dict[str, set[str]] = {}

    for code in codes:
        course = get_course_by_code(db, code)
        if not course:
            logger.warning("[build_prereq_maps] Course '%s' not found in DB; skipping.", code)
            continue

        psets = db.query(PrerequisiteSet).filter(
            PrerequisiteSet.course_id == course.course_id
        ).all()

        if not psets:
            prereq_map[code] = set()
            full_edge_map[code] = set()
            logger.debug("[build_prereq_maps] '%s' — no prerequisite sets.", code)
            continue

        scheduling_prereqs: set[str] = set()
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
            if is_and_set:
                for c in set_course_codes:
                    if c in known_codes:
                        scheduling_prereqs.add(c)
                logger.debug(
                    "[build_prereq_maps] '%s' set %d (AND) — courses=%s | scheduled_blockers=%s",
                    code, pset.set_id, set_course_codes,
                    [c for c in set_course_codes if c in known_codes],
                )
            else:
                in_known = [c for c in set_course_codes if c in known_codes]
                if in_known:
                    blocker = min(in_known, key=lambda c: course_level_floor(c))
                    scheduling_prereqs.add(blocker)
                    logger.debug(
                        "[build_prereq_maps] '%s' set %d (OR) — blocker selected: '%s' from %s",
                        code, pset.set_id, blocker, in_known,
                    )
                else:
                    logger.debug(
                        "[build_prereq_maps] '%s' set %d (OR) — no in-plan courses found; no blocker added.",
                        code, pset.set_id,
                    )

        prereq_map[code] = scheduling_prereqs
        full_edge_map[code] = all_prereqs
        logger.debug(
            "[build_prereq_maps] '%s' — scheduling_prereqs=%s | all_prereqs=%s",
            code, scheduling_prereqs, all_prereqs,
        )

    logger.info(
        "[build_prereq_maps] DONE — prereq_map=%d entries | full_edge_map=%d entries",
        len(prereq_map), len(full_edge_map),
    )
    return prereq_map, full_edge_map


def schedule(
    db: Session,
    codes_to_schedule: list[str],
    prereq_map: dict[str, set[str]],
    full_edge_map: dict[str, set[str]],
    completed_set: set[str],
    required_set: set[str],
    choice_nodes: list[ChoiceNode],
    resolved_choices: set[str],
) -> tuple[list[CourseNode], list[ChoiceNode], list[CourseEdge]]:
    """
    Schedule courses into years 1–MAX_YEARS respecting:
      1. Prerequisite ordering
      2. Course-level year floor
      3. Credit cap per year
    """
    logger.info(
        "[schedule] START — courses_to_schedule=%d | completed=%d | required=%d | resolved_choices=%d",
        len(codes_to_schedule), len(completed_set), len(required_set), len(resolved_choices),
    )

    placed: set[str] = set(completed_set)
    remaining = list(codes_to_schedule)

    min_year: dict[str, int] = {code: course_level_floor(code) for code in codes_to_schedule}
    logger.debug("[schedule] Year floors: %s", min_year)

    credit_cache: dict[str, float] = {}
    for code in codes_to_schedule:
        course = get_course_by_code(db, code)
        credit_cache[code] = float(course.credits or 3) if course else 3.0

    course_nodes: list[CourseNode] = []
    placement: dict[str, int] = {}

    year = 1
    credits_used = 0.0

    while remaining and year <= MAX_YEARS:
        eligible = [
            code for code in remaining
            if prereq_map.get(code, set()).issubset(placed)
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
                    "[schedule] Could not fully resolve prerequisites for: %s. Forcing into year %d.",
                    remaining, year,
                )
                eligible = list(remaining)

        for code in eligible:
            course_credits = credit_cache.get(code, 3.0)

            if credits_used + course_credits > CREDITS_PER_YEAR:
                if year < MAX_YEARS:
                    logger.debug(
                        "[schedule] Credit cap reached (%.1f + %.1f > %d); advancing to year %d for '%s'.",
                        credits_used, course_credits, CREDITS_PER_YEAR, year + 1, code,
                    )
                    year += 1
                    credits_used = 0.0

            course = get_course_by_code(db, code)
            if not course:
                logger.warning("[schedule] Course '%s' not found in DB; removing from schedule.", code)
                remaining.remove(code)
                continue

            is_required = code in required_set
            is_choice = code in resolved_choices
            course_nodes.append(
                CourseNode(
                    course_code=course.course_code,
                    title=course.title or "",
                    units=float(course.credits) if course.credits else None,
                    year=year,
                    semester=None,
                    is_required=is_required,
                    is_choice=is_choice,
                )
            )
            placement[code] = year
            placed.add(code)
            remaining.remove(code)
            credits_used += course_credits

            logger.debug(
                "[schedule] Placed '%s' in year %d (is_required=%s, is_choice=%s, credits=%.1f, running=%.1f)",
                code, year, is_required, is_choice, course_credits, credits_used,
            )

        if credits_used > 0 and credits_used < CREDITS_PER_YEAR and year < MAX_YEARS:
            logger.debug(
                "[schedule] Year %d filled (%.1f cr); advancing to year %d.",
                year, credits_used, year + 1,
            )
            year += 1
            credits_used = 0.0

    if remaining:
        logger.warning("[schedule] %d course(s) could not be scheduled: %s", len(remaining), remaining)
    else:
        logger.info("[schedule] All courses placed successfully.")

    # Build edges
    edges: list[CourseEdge] = []
    emitted: set[tuple[str, str]] = set()
    for code, prereqs in full_edge_map.items():
        for prereq_code in prereqs:
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

    logger.info("[schedule] Built %d edge(s).", len(edges))

    # Update ChoiceNode years
    updated_choice_nodes = []
    for cn in choice_nodes:
        resolved_year = 1
        if cn.options and len(cn.options) > 0:
            first_course_code = cn.options[0].course_code
            if first_course_code and first_course_code in placement:
                resolved_year = min(placement[first_course_code], MAX_YEARS)
        logger.debug(
            "[schedule] ChoiceNode '%s' assigned to year %d.", cn.choice_id, resolved_year,
        )
        updated_choice_nodes.append(
            ChoiceNode(
                choice_id=cn.choice_id,
                label=cn.label,
                year=resolved_year,
                position=cn.position,
                required=cn.required,
                options=cn.options,
            )
        )

    logger.info(
        "[schedule] DONE — course_nodes=%d | edges=%d | choice_nodes=%d",
        len(course_nodes), len(edges), len(updated_choice_nodes),
    )
    return course_nodes, updated_choice_nodes, edges
