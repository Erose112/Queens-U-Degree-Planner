"""
Plan generation service — main entry point.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code, get_free_electives_by_level, get_all_courses
from app.queries.program_queries import get_program_with_sections_and_courses
from app.schemas.plan import PlanResponse
from app.services.plan.constants import (
    CREDITS_PER_YEAR,
    DEFAULT_CREDITS,
    LOGIC_CHOOSE_COUNT,
    LOGIC_CHOOSE_CREDITS,
    LOGIC_REQUIRED,
    TOTAL_PLAN_CREDITS,
    MAX_YEARS,
)
from app.services.plan.elective_service import rank_electives, resolve_elective_prereqs
from app.services.plan.prereq_utils import (
    build_prereq_maps,
    course_level_floor,
    has_cycle_in_graph,
)
from app.services.plan.scheduler import schedule

logger = logging.getLogger(__name__)


# After section parsing completes, compute how many credits each year-floor
# already absorbs from required (non-completed) courses.
def _year_credits_used(
    codes: list[str],
    exclude: set[str],
    db: Session,
) -> dict[int, float]:
    usage: dict[int, float] = {}
    for code in codes:
        if code in exclude:
            continue
        c_obj = get_course_by_code(db, code)
        cr = float(c_obj.credits or DEFAULT_CREDITS) if c_obj else DEFAULT_CREDITS
        yr = course_level_floor(code)
        usage[yr] = usage.get(yr, 0.0) + cr
    return usage



def _get_credits(db: Session, code: str) -> float:
    course = get_course_by_code(db, code)
    return float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS



def _update_group_budgets(
    choice_groups: list[dict],
    selected_codes: list[str],
    db: Session,
    explicitly_selected: set[str] | None = None,
) -> None:
    """Reduce each group's credit_limit by the credits already consumed."""
    code_to_group: dict[str, dict] = {}
    for group in choice_groups:
        for code in group["codes"]:
            code_to_group[code] = group

    for code in selected_codes:
        if explicitly_selected is not None and code not in explicitly_selected:
            continue
        group = code_to_group.get(code)
        if group:
            course = get_course_by_code(db, code)
            cr = float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS
            group["credit_limit"] = max(0.0, group["credit_limit"] - cr)



def generate_plan(
    db: Session,
    program_id: int,
    completed_courses: list[str],
    favourites: list[str],
    interested: list[str],
    secondary_program_id: int | None = None,
) -> PlanResponse | None:

    logger.info(
        "[generate_plan] START — program_id=%d | completed=%d course(s) | favourites=%s | interested=%s",
        program_id, len(completed_courses), favourites, interested,
    )

    ALL_COURSES = set(get_all_courses(db))

    program = get_program_with_sections_and_courses(db, program_id)
    if not program:
        logger.warning("[generate_plan] Program %d not found. Aborting.", program_id)
        return None

    primary_program = program
    programs_to_process = [program]

    secondary_program = None

    if secondary_program_id:
        secondary_program = get_program_with_sections_and_courses(db, secondary_program_id)
        if secondary_program:
            programs_to_process.append(secondary_program)

    logger.info(
        "[generate_plan] Loaded program '%s' (%s) with %d section(s).",
        primary_program.program_name, primary_program.program_type, len(primary_program.sections),
    )

    completed_set: set[str] = set(completed_courses)
    choice_groups: list[dict] = []
    required_codes: list[str] = []

    core_credits = 0.0

    for program in programs_to_process:
        logger.info(
            "[generate_plan] Processing program '%s' (id=%d) — %d section(s).",
            program.program_name, program.program_id, len(program.sections),
        )
        for section in program.sections:
            logic = section.logic_rules[0] if section.logic_rules else None
            logic_type = logic.logic_type if logic else LOGIC_REQUIRED
            logic_value = logic.logic_value if logic else 0

            section_course_list = [
                sc.course for sc in section.section_courses if sc.course is not None
            ]
            n_courses = len(section_course_list)

            logger.info(
                "[generate_plan] Section %d — logic_type=%s | logic_value=%s | courses=%d: %s",
                section.section_id, logic_type, logic_value, n_courses,
                [c.course_code for c in section_course_list],
            )
            
            # All courses in a required section are added to the required list
            if logic_type == LOGIC_REQUIRED:
                newly_added = []
                for course in section_course_list:
                    units = float(course.credits or DEFAULT_CREDITS)
                    if course.course_code not in required_codes:
                        required_codes.append(course.course_code)
                        core_credits += units
                        newly_added.append(f"{course.course_code}({units}cr)")
                logger.info(
                    "[generate_plan] Section %d [REQUIRED] — added %d: %s",
                    section.section_id, len(newly_added), newly_added,
                )

            # For elective sections, create choice groups that will be resolved later
            elif logic_type == LOGIC_CHOOSE_COUNT:
                n_to_pick = int(logic_value or 1)
                if n_to_pick >= n_courses:
                    newly_added = []
                    for course in section_course_list:
                        units = float(course.credits or DEFAULT_CREDITS)
                        if course.course_code not in required_codes:
                            required_codes.append(course.course_code)
                            core_credits += units
                            newly_added.append(f"{course.course_code}({units}cr)")
                    logger.info(
                        "[generate_plan] Section %d [CHOOSE_COUNT all] — added %d: %s",
                        section.section_id, len(newly_added), newly_added,
                    )
                else:
                    group_codes = [c.course_code for c in section_course_list]
                    credits_to_pick = n_to_pick * DEFAULT_CREDITS  # approximate until ranked
                    choice_groups.append({
                        "codes": group_codes,
                        "credit_limit": n_to_pick * DEFAULT_CREDITS,  # temporary estimate
                        "n_to_pick": n_to_pick,      
                        "section_id": section.section_id,
                        "logic_type": logic_type,
                        "logic_value": logic_value,
                    })
                    logger.info(
                        "[generate_plan] Section %d [CHOOSE_COUNT %d of %d] — group: %s",
                        section.section_id, n_to_pick, n_courses, group_codes,
                    )

            # For credit-based sections, create choice groups with the specified credit limit
            elif logic_type == LOGIC_CHOOSE_CREDITS:
                credits_to_pick = float(logic_value or 0)
                group_codes = [c.course_code for c in section_course_list]
                choice_groups.append({
                    "codes": group_codes,
                    "credit_limit": credits_to_pick,
                    "section_id": section.section_id,
                    "logic_type": logic_type,
                    "logic_value": logic_value,
                })
                logger.info(
                    "[generate_plan] Section %d [CHOOSE_CREDITS %.1fcr from %d] — group: %s",
                    section.section_id, credits_to_pick, len(group_codes), group_codes,
                )

            else:
                logger.warning(
                    "[generate_plan] Section %d — unrecognised logic_type=%d. Skipping.",
                    section.section_id, logic_type,
                )

    # Collect all electives from choice groups for recommendation seeding and prerequisite resolution
    all_choice_group_codes = {code for g in choice_groups for code in g["codes"]}
    remaining_credit_gap = max(TOTAL_PLAN_CREDITS - core_credits, 0.0)

    committed_plan, _ = resolve_elective_prereqs(
        db,
        selected=required_codes,
        required_set=completed_set,
        elective_pool=set(required_codes) | all_choice_group_codes | ALL_COURSES,
        credit_budget=remaining_credit_gap,
    )

    # Separate out pulled prereqs and update group budgets + credit gap
    pulled_prereqs = [
        c for c in committed_plan
        if c not in set(required_codes) and c not in completed_set
    ]
    pulled_credits = sum(
        _get_credits(db, c) for c in pulled_prereqs
    )
    remaining_credit_gap = max(remaining_credit_gap - pulled_credits, 0.0)

    for code in pulled_prereqs:
            for group in choice_groups:
                if code in group["codes"]:
                    cr = _get_credits(db, code)
                    group["credit_limit"] = max(0.0, group["credit_limit"] - cr)
                    logger.info(
                        "[generate_plan] Phase 2 — '%s' pulled as prereq, satisfying %.1fcr "
                        "of group %d budget",
                        code, cr, group["section_id"],
                    )

    logger.info(
        "[generate_plan] Phase 2 complete — required=%d | pulled_prereqs=%d (%s) | "
        "remaining_gap=%.1f",
        len(required_codes), len(pulled_prereqs), pulled_prereqs, remaining_credit_gap,
    )

    all_choice_group_codes = {code for g in choice_groups for code in g["codes"]}

    for group in choice_groups:
        remaining_group_budget = group["credit_limit"]
        already_tried: set[str] = set()
        resolved_group_codes: list[str] = []

        while remaining_group_budget > 0:
            candidates = [
                c for c in group["codes"]
                if c not in set(committed_plan) and c not in already_tried
            ]

            if not candidates:
                logger.info(
                    "[generate_plan] Group %d — no remaining candidates. Stopping.",
                    group["section_id"],
                )
                break

            highest_rated = rank_electives(
                db,
                elective_codes=candidates,
                seed_codes=list(committed_plan) + favourites + interested,
                program_id=program_id,
                completed_courses=completed_courses,
                elective_credits_required=remaining_group_budget,
                year_credits_used=_year_credits_used(committed_plan, completed_set, db),
                choice_groups=[group],
            )

            if not highest_rated:
                logger.info(
                    "[generate_plan] Group %d — rank_electives returned nothing. Stopping.",
                    group["section_id"],
                )
                break

            # For CHOOSE_COUNT groups, enforce count cap and recompute actual credit total
            if group.get("logic_type") == LOGIC_CHOOSE_COUNT:
                n_to_pick = group["n_to_pick"]
                highest_rated = highest_rated[:n_to_pick]
                actual_credits = sum(_get_credits(db, c) for c in highest_rated)
                group["credit_limit"] = actual_credits
                remaining_group_budget = actual_credits
                logger.info(
                    "[generate_plan] Group %d [CHOOSE_COUNT] — capped to %d course(s) / %.1fcr",
                    group["section_id"], len(highest_rated), actual_credits,
                )

            resolved, remaining_group_budget = resolve_elective_prereqs(
                db,
                selected=highest_rated,
                required_set=set(committed_plan) | completed_set,
                elective_pool=all_choice_group_codes | ALL_COURSES,
                credit_budget=remaining_group_budget,
            )

            # Mark all attempted courses as tried regardless of outcome
            already_tried.update(highest_rated)

            if not resolved:
                logger.info(
                    "[generate_plan] Group %d — all top-ranked candidates failed prereq "
                    "resolution (%s). Retrying with remaining candidates.",
                    group["section_id"], highest_rated,
                )
                continue

            pulled = [c for c in resolved if c not in set(highest_rated)]
            _update_group_budgets(
                choice_groups, resolved, db,
                explicitly_selected=set(highest_rated),
            )

            new_codes = [c for c in resolved if c not in set(committed_plan)]
            committed_plan.extend(new_codes)
            resolved_group_codes.extend(new_codes)

            new_credits = sum(_get_credits(db, c) for c in new_codes)
            remaining_credit_gap = max(remaining_credit_gap - new_credits, 0.0)

            logger.info(
                "[generate_plan] Group %d — selected=%s | pulled=%s | "
                "group_budget_remaining=%.1f | committed_total=%d",
                group["section_id"],
                highest_rated,
                pulled,
                remaining_group_budget,
                len(committed_plan),
            )

            # CHOOSE_COUNT groups are fully resolved in one pass
            if group.get("logic_type") == LOGIC_CHOOSE_COUNT:
                break



    # Free Elective Backfill
    # Compute remaining gap after required + choice group phases
    committed_credits = sum(
        _get_credits(db, c) for c in committed_plan if c not in completed_set
    )
    remaining_credit_gap = max(TOTAL_PLAN_CREDITS - committed_credits, 0.0)

    if remaining_credit_gap > 0:
        all_group_codes = {code for g in choice_groups for code in g["codes"]}

        max_iterations = 5
        iteration = 0
        rejected: set[str] = set()

        while remaining_credit_gap > 0 and iteration < max_iterations:
            # Determine which year-level to backfill
            # Prefer filling lower years first

            current_committed = set(committed_plan) | completed_set
            ycu = _year_credits_used(committed_plan, completed_set, db)
            target_level = next(
                (yr * 100 for yr in range(1, MAX_YEARS + 1)
                if CREDITS_PER_YEAR - ycu.get(yr, 0.0) >= 3.0),
                100  # fallback to year 1
            )

            exclude = current_committed | all_group_codes | rejected
            free_pool = get_free_electives_by_level(db, level=target_level, exclude=exclude)
            free_pool_codes = [c.course_code for c in free_pool]

            if not free_pool_codes:
                break

            ranked = rank_electives(
                db,
                elective_codes=free_pool_codes,
                seed_codes=list(current_committed) + favourites + interested,
                program_id=program_id,
                completed_courses=completed_courses,
                elective_credits_required=remaining_credit_gap,
                year_credits_used=ycu,
                choice_groups=[],  # free electives have no group caps
            )

            if not ranked:
                break

            resolved, remaining_credit_gap = resolve_elective_prereqs(
                db,
                selected=ranked,
                required_set=current_committed,
                elective_pool=set(free_pool_codes),
                credit_budget=remaining_credit_gap,
            )

            # Track rejected so we don't retry them
            rejected.update(c for c in ranked if c not in set(resolved))

            if not resolved:
                iteration += 1
                continue

            new_codes = [c for c in resolved if c not in current_committed]
            committed_plan.extend(new_codes)
            current_committed.update(new_codes)

            iteration += 1

    logger.info(
        "[generate_plan] Phase 4 DONE — committed=%d courses | gap=%.1fcr",
        len(committed_plan), remaining_credit_gap,
    )


    # Phase 5 — Schedule and Build Response
    # Final dedup safety check
    all_to_schedule: list[str] = []
    seen: set[str] = set()
    scheduled_credits = 0.0

    for code in committed_plan:
        if code in seen or code in completed_set:
            continue
        course = get_course_by_code(db, code)
        course_cr = float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS
        if scheduled_credits + course_cr > TOTAL_PLAN_CREDITS:
            logger.warning(
                "[generate_plan] Phase 5 — '%s' would exceed %.0fcr hard cap, dropping.",
                code, TOTAL_PLAN_CREDITS,
            )
            continue
        seen.add(code)
        all_to_schedule.append(code)
        scheduled_credits += course_cr

    logger.info(
        "[generate_plan] Phase 5 — final schedule: %d course(s) / %.1fcr "
        "(excluded %d completed)",
        len(all_to_schedule), scheduled_credits, len(completed_set),
    )

    # Build prerequisite maps
    known_codes: set[str] = set(all_to_schedule) | completed_set
    prereq_map, full_edge_map = build_prereq_maps(db, all_to_schedule, known_codes)

    logger.info(
        "[generate_plan] Phase 5 — prereq_map=%d | full_edge_map=%d",
        len(prereq_map), len(full_edge_map),
    )

    if has_cycle_in_graph(prereq_map):
        logger.warning(
            "[generate_plan] Phase 5 — cycle detected in prereq graph for "
            "program %d. Scheduling may be incomplete.", program_id,
        )

    # Determine which codes are required vs elective for node labelling
    required_set: set[str] = set(required_codes)

    course_nodes, edges = schedule(
        db,
        codes_to_schedule=all_to_schedule,
        prereq_map=prereq_map,
        full_edge_map=full_edge_map,
        completed_set=completed_set,
        required_set=required_set,
    )

    logger.info(
        "[generate_plan] Phase 5 — scheduler returned %d node(s) | %d edge(s).",
        len(course_nodes), len(edges),
    )

    # Credit summary
    actual_core_credits = 0.0
    actual_elective_credits = 0.0

    for node in course_nodes:
        units = node.units or DEFAULT_CREDITS
        if node.is_required:
            actual_core_credits += units
        else:
            actual_elective_credits += units

    total_units = actual_core_credits + actual_elective_credits

    logger.info(
        "[generate_plan] Phase 5 DONE — total=%.1fcr | core=%.1fcr | elective=%.1fcr",
        total_units, actual_core_credits, actual_elective_credits,
    )

    # Resolve secondary program name safely
    second_name = None
    if secondary_program_id and len(programs_to_process) > 1:
        second_name = programs_to_process[1].program_name

    logger.info(
        "[generate_plan] DONE — returning PlanResponse for program_id=%d.", program_id
    )

    return PlanResponse(
        program_name=primary_program.program_name or "",
        second_program_name=second_name,
        program_code=primary_program.program_type or "",
        total_units=total_units,
        core_units=round(actual_core_credits, 1),
        elective_units=round(actual_elective_credits, 1),
        courses=course_nodes,
        edges=edges,
    )
