"""
Plan generation service — main entry point.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code, get_free_electives_by_level
from app.queries.program_queries import get_program_with_sections_and_courses
from app.schemas.plan import PlanResponse
from app.services.plan.constants import (
    CREDITS_PER_YEAR,
    DEFAULT_CREDITS,
    LOGIC_CHOOSE_COUNT,
    LOGIC_CHOOSE_CREDITS,
    LOGIC_REQUIRED,
    PREREQ_PULLTHROUGH_BUFFER,
    TOTAL_PLAN_CREDITS,
)
from app.services.plan.elective_service import rank_electives, resolve_elective_prereqs
from app.services.plan.prereq_utils import (
    build_prereq_maps,
    course_level_floor,
    has_cycle_in_graph,
)
from app.services.plan.scheduler import schedule
from app.services.recommendation_services import get_recommendations_for_program

logger = logging.getLogger(__name__)


def generate_plan(
    db: Session,
    program_id: int,
    completed_courses: list[str],
    favourites: list[str],
    interested: list[str],
) -> PlanResponse | None:

    logger.info(
        "[generate_plan] START — program_id=%d | completed=%d course(s) | favourites=%s | interested=%s",
        program_id, len(completed_courses), favourites, interested,
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
            for code in (c.course_code for c in section_course_list):
                if code not in elective_codes:
                    elective_codes.append(code)
            elective_credits += credits_to_pick

        elif logic_type == LOGIC_CHOOSE_COUNT:
            n_to_pick = logic_value or 1
            if n_to_pick >= n_courses:
                for course in section_course_list:
                    units = float(course.credits or DEFAULT_CREDITS)
                    if course.course_code not in required_codes:
                        required_codes.append(course.course_code)
                    core_credits += units
            else:
                section_codes = [c.course_code for c in section_course_list]
                seed_codes_early = list(completed_set) + favourites + interested

                ranked = get_recommendations_for_program(
                    db,
                    program_id=program_id,
                    completed_course_codes=seed_codes_early,
                    top_k=len(section_codes),
                )
                ranked_section_codes = (
                    [c.course_code for c, _ in ranked if c.course_code in set(section_codes)]
                    if ranked else []
                )
                unranked = [c for c in section_codes if c not in set(ranked_section_codes)]
                ordered = ranked_section_codes + unranked
                picked = ordered[:n_to_pick]

                for code in picked:
                    if code not in required_codes:
                        required_codes.append(code)
                    course_obj = get_course_by_code(db, code)
                    core_credits += (
                        float(course_obj.credits or DEFAULT_CREDITS)
                        if course_obj else DEFAULT_CREDITS
                    )

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
        "elective_candidates=%d | core_credits=%.1f | elective_credits=%.1f",
        len(required_codes), len(elective_codes), core_credits, elective_credits,
    )



    # Credit budget
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
        "completed_required=%.1f | committed=%.1f | "
        "gap_for_electives=%.1f (section_elective_req=%.1f)",
        TOTAL_PLAN_CREDITS, required_credits, completed_required_credits,
        committed_credits, remaining_credit_gap, elective_credits,
    )



    # Interested courses
    interested_to_schedule: set[str] = set()
    for course in interested:
        course_obj = get_course_by_code(db, course)
        if not course_obj:
            logger.warning(
                "[generate_plan] Interested course '%s' not found in DB; skipping.", course
            )
            continue
        credit = float(course_obj.credits or DEFAULT_CREDITS)
        if (
            course not in completed_set
            and course not in set(required_codes)
            and remaining_credit_gap - credit >= 0
        ):
            interested_to_schedule.add(course)
            remaining_credit_gap -= credit



    # Early year-1 free-elective backfill
    # Must happen before rank_electives so the 120-credit cap isn't exhausted
    # by higher-year courses before year-1 slots are claimed.
    required_set: set[str] = set(required_codes)

    year1_required_credits = sum(
        float(c_obj.credits or DEFAULT_CREDITS)
        for code in required_codes
        if code not in completed_set
        and course_level_floor(code) == 1
        and (c_obj := get_course_by_code(db, code)) is not None
    )
    year1_elective_pool_credits = sum(
        float(c_obj.credits or DEFAULT_CREDITS)
        for code in elective_codes
        if code not in completed_set
        and course_level_floor(code) == 1
        and (c_obj := get_course_by_code(db, code)) is not None
    )

    free_elective_codes: list[str] = []
    year1_shortfall = max(
        0, CREDITS_PER_YEAR - year1_required_credits - year1_elective_pool_credits
    )

    if year1_shortfall > 0:
        logger.info(
            "[generate_plan] Year 1 projected shortfall of %.1f cr — "
            "reserving free electives before ranking.",
            year1_shortfall,
        )
        backfill_exclude = (
            required_set | set(interested_to_schedule) | completed_set | set(elective_codes)
        )
        backfill_pool = get_free_electives_by_level(db, level=100, exclude=backfill_exclude)
        backfill_accumulated = 0.0

        for fe_course in backfill_pool:
            if backfill_accumulated >= year1_shortfall:
                break
            units = float(fe_course.credits or DEFAULT_CREDITS)
            if backfill_accumulated + units > year1_shortfall:
                continue
            if units > remaining_credit_gap:
                continue
            free_elective_codes.append(fe_course.course_code)
            remaining_credit_gap -= units
            backfill_accumulated += units
            logger.debug(
                "[generate_plan] Reserved free elective '%s' (%.1f cr) — "
                "remaining shortfall=%.1f | remaining_credit_gap=%.1f",
                fe_course.course_code, units,
                year1_shortfall - backfill_accumulated, remaining_credit_gap,
            )

        logger.info(
            "[generate_plan] Early year-1 backfill: %d course(s) / %.1f cr reserved. "
            "remaining_credit_gap now %.1f",
            len(free_elective_codes), backfill_accumulated, remaining_credit_gap,
        )
    else:
        logger.debug(
            "[generate_plan] Year 1 projected credits (%.1f cr) meet target; "
            "no backfill needed.",
            year1_required_credits,
        )



    # Rank and resolve electives
    seed_codes = list(completed_set) + favourites

    logger.info(
        "[generate_plan] Ranking electives — candidates=%d | seed_codes=%d | "
        "elective_credits_required=%.1f",
        len(elective_codes), len(seed_codes), remaining_credit_gap,
    )

    ranked_electives = rank_electives(
        db,
        elective_codes,
        seed_codes,
        program_id,
        completed_courses,
        remaining_credit_gap - PREREQ_PULLTHROUGH_BUFFER,
    )

    ranked_electives, remaining_credit_gap = resolve_elective_prereqs(
        db,
        selected=ranked_electives,
        required_set=required_set | set(free_elective_codes),
        elective_pool=set(elective_codes),
        credit_budget=remaining_credit_gap,
    )


    max_backfill_iterations = 5  # safety valve
    iteration = 0

    while remaining_credit_gap > 0 and iteration < max_backfill_iterations:
        already_selected = (
            set(ranked_electives) | required_set | set(free_elective_codes) | completed_set
        )
        remaining_candidates = [c for c in elective_codes if c not in already_selected]
        if not remaining_candidates:
            break

        logger.info(
            "[generate_plan] Backfill iteration %d — gap=%.1f cr | candidates=%d",
            iteration + 1, remaining_credit_gap, len(remaining_candidates),
        )

        backfill = rank_electives(
            db, remaining_candidates, seed_codes, program_id,
            completed_courses, remaining_credit_gap,
        )
        if not backfill:
            break

        backfill, remaining_credit_gap = resolve_elective_prereqs(
            db,
            selected=backfill,
            required_set=required_set | set(free_elective_codes) | set(ranked_electives),
            elective_pool=set(elective_codes),
            credit_budget=remaining_credit_gap,
        )

        if not backfill:
            break  # no valid courses found this round — stop to avoid infinite loop

        ranked_electives = ranked_electives + backfill
        iteration += 1

    logger.info(
        "[generate_plan] rank_electives returned %d course(s): %s",
        len(ranked_electives), ranked_electives,
    )


    # Build schedule list without redundancy (enforce 120 cr hard limit)
    all_to_schedule: list[str] = []
    seen: set[str] = set()
    scheduled_credits = 0.0

    for code in (
        required_codes
        + list(interested_to_schedule)
        + free_elective_codes
        + ranked_electives
    ):
        if code in seen or code in completed_set:
            continue
        course = get_course_by_code(db, code)
        course_cr = float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS
        if scheduled_credits + course_cr > TOTAL_PLAN_CREDITS:
            continue
        seen.add(code)
        all_to_schedule.append(code)
        scheduled_credits += course_cr

    logger.info(
        "[generate_plan] Schedule list built — total_to_schedule=%d | "
        "scheduled_credits=%.1f / %d "
        "(required=%d | free_elective_backfill=%d | ranked_electives=%d, excl. %d completed)",
        len(all_to_schedule), scheduled_credits, TOTAL_PLAN_CREDITS,
        len(required_codes), len(free_elective_codes),
        len(ranked_electives), len(completed_set),
    )


    # Build prerequisite maps
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
            "Course scheduling may be incomplete.",
            program_id,
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



    # Credit summary
    actual_core_credits = 0.0
    actual_elective_credits = 0.0

    for node in course_nodes:
        if node.semester == "Completed":
            continue
        units = node.units or DEFAULT_CREDITS
        if node.is_required:
            actual_core_credits += units
        else:
            actual_elective_credits += units

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
