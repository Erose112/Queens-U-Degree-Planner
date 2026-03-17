"""
Elective ranking and prerequisite resolution.
"""
from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code
from app.services.plan.constants import DEFAULT_CREDITS, CREDITS_PER_YEAR, MAX_YEARS
from app.services.plan.prereq_utils import course_level_floor, get_db_prereq_groups
from app.services.recommendation_services import get_recommendations_for_program

logger = logging.getLogger(__name__)

DEPT_CREDIT_CAP_RATIO = 0.40


# Elective ranker
def rank_electives(
    db: Session,
    elective_codes: list[str],
    seed_codes: list[str],
    program_id: int,
    completed_courses: list[str],
    elective_credits_required: float = 0.0,
    year_credits_used: dict[int, float] | None = None,
    choice_groups: list[dict] | None = None,
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
        elective_credits_map[code] = (
            float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS
        )

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

    year_budget: dict[int, float] = {
        yr: CREDITS_PER_YEAR - (year_credits_used or {}).get(yr, 0.0)
        for yr in range(1, MAX_YEARS + 1)
    }
    dept_credits_used: dict[str, float] = defaultdict(float)

    code_to_group: dict[str, dict] = {}
    for group in (choice_groups or []):
        for code in group["codes"]:
            code_to_group[code] = group

    logger.debug(
        "[rank_electives] Choice groups — %d group(s): %s",
        len(choice_groups or []),
        [{"section_id": g["section_id"], "credit_limit": g["credit_limit"], "codes": g["codes"]} 
        for g in (choice_groups or [])]
    )

    group_credits_used: dict[int, float] = defaultdict(float)

    for code in ordered:
        if credits_accumulated >= elective_credits_required:
            break
        cr = elective_credits_map.get(code, DEFAULT_CREDITS)
        yr = course_level_floor(code)
        available_in_year = year_budget.get(yr, CREDITS_PER_YEAR)

        if available_in_year < cr:
            continue  # this year is full try next candidate

        dept = code[:4]  # e.g. "STAT", "CISC", "MATH"
        dept_cap = max(
            elective_credits_required * DEPT_CREDIT_CAP_RATIO,
            DEFAULT_CREDITS,  # always allow at least one course per dept
        )

        if dept_credits_used[dept] + cr > dept_cap:
            continue

        group = code_to_group.get(code)
        if group:
            group_id = group["section_id"]
            if group_credits_used[group_id] + cr > group["credit_limit"]:
                continue

        selected_electives.append(code)
        credits_accumulated += cr
        year_budget[yr] = available_in_year - cr
        dept_credits_used[dept] += cr

        if group:
            group_credits_used[group["section_id"]] += cr


    # If the main loop selected nothing but credits are still needed, the year
    # budget was too tight (common when elective_credits_required is small).
    # Retry without the year cap, keeping all other constraints intact.
    if not selected_electives and elective_credits_required > 0:
        for code in ordered:
            if credits_accumulated >= elective_credits_required:
                break
            cr = elective_credits_map.get(code, DEFAULT_CREDITS)

            dept = code[:4]
            dept_cap = max(
                elective_credits_required * DEPT_CREDIT_CAP_RATIO,
                DEFAULT_CREDITS,
            )
            if dept_credits_used[dept] + cr > dept_cap:
                continue

            group = code_to_group.get(code)
            if group:
                group_id = group["section_id"]
                if group_credits_used[group_id] + cr > group["credit_limit"]:
                    continue

            selected_electives.append(code)
            credits_accumulated += cr
            dept_credits_used[dept] += cr

            if group:
                group_credits_used[group["section_id"]] += cr


    logger.info(
        "[rank_electives] DONE — selected %d elective(s) totalling %.1f credits: %s",
        len(selected_electives), credits_accumulated, selected_electives,
    )
    return selected_electives


# Elective prerequisite resolution
def resolve_elective_prereqs(
    db: Session,
    selected: list[str],
    required_set: set[str],
    elective_pool: set[str],
    credit_budget: float,
) -> tuple[list[str], float]:
    """
    Validates selected electives against their prerequisites within a credit budget.

    Budget mechanics:
      - Starts at credit_budget (the full elective credit gap)
      - Each course added (selected or pulled-in prereq) costs its credits
      - Courses dropped from `selected` do NOT cost credits, freeing room
        for prerequisite courses that need to be pulled in
      - If a prerequisite can't fit in the remaining budget, the course
        that needs it is dropped instead

    Returns the validated elective list and the remaining unused budget.
    """
    resolved: set[str] = set(required_set)
    result: list[str] = []
    remaining_budget = credit_budget

    rank_index: dict[str, int] = {c: i for i, c in enumerate(selected)}

    def get_units(code: str) -> float:
        course = get_course_by_code(db, code)
        return float(course.credits or DEFAULT_CREDITS) if course else DEFAULT_CREDITS




    def _prereq_cost(candidate: str, current_plan: set[str]) -> int:
        """Count how many of this candidate's prereqs are NOT yet in the plan.
        Lower = cheaper = prefer."""
        groups = get_db_prereq_groups(db, candidate)
        unsatisfied = sum(
            1 for g in groups
            if not any(c in current_plan for c in g)
        )
        return unsatisfied



    def try_add(
        code: str,
        plan: set[str],
        budget: float,
        depth: int = 0,
    ) -> tuple[bool, set[str], float]:
        """
        Recursively try to add `code` and all its missing prerequisites.
        Returns (success, updated_plan, updated_budget).
        Budget is only decremented when a course is successfully committed to plan.
        If resolution fails at any point, the original plan and budget are returned
        unchanged — no partial commits.
        """
        if code in plan:
            return True, plan, budget

        if depth > 10:
            logger.warning(
                "[resolve_elective_prereqs] Max recursion depth reached for '%s'; dropping.",
                code,
            )
            return False, plan, budget

        units = get_units(code)

        if budget < units:
            logger.debug(
                "[resolve_elective_prereqs] '%s' dropped — insufficient budget "
                "(need %.1f cr, have %.1f cr)",
                code, units, budget,
            )
            return False, plan, budget

        working_plan = plan
        working_budget = budget

        for group in get_db_prereq_groups(db, code):
            if any(c in working_plan for c in group):
                continue  # This group already satisfied

            candidates = sorted(
                [c for c in group if c in elective_pool],
                key=lambda c: (
                    _prereq_cost(c, working_plan),       # prefer already-satisfiable
                    rank_index.get(c, len(selected)),    # then by recommendation rank
                ),
            )

            if not candidates:
                logger.debug(
                "[resolve_elective_prereqs] '%s' dropped — prereq group %s has no "
                "candidates in pool",
                code, group,
            )
                return False, plan, budget

            satisfied = False
            for candidate in candidates:
                success, working_plan, working_budget = try_add(
                    candidate, working_plan, working_budget, depth + 1
                )
                if success:
                    satisfied = True
                    break

            if not satisfied:
                return False, plan, budget

        # All prereq groups satisfied — commit
        working_plan = working_plan | {code}
        working_budget -= units
        logger.debug(
            "[resolve_elective_prereqs] Committed '%s' (%.1f cr) at depth %d — "
            "budget remaining=%.1f",
            code, units, depth, working_budget,
        )
        return True, working_plan, working_budget

    for code in selected:
        success, resolved, remaining_budget = try_add(code, resolved, remaining_budget)
        if success and code not in required_set:
            result.append(code)


    def topo_order_pulled(codes: list[str], already_in_plan: set[str]) -> list[str]:
        """Return codes sorted so each course comes after its prerequisites."""
        code_set = set(codes)
        ordered: list[str] = []
        visited: set[str] = set()

        def visit(code: str) -> None:
            if code in visited:
                return
            visited.add(code)
            for group in get_db_prereq_groups(db, code):
                for dep in group:
                    if dep in code_set and dep not in already_in_plan:
                        visit(dep)
                        break
            ordered.append(code)

        for code in codes:
            visit(code)
        return ordered

    pulled_in_sorted = topo_order_pulled(
        [c for c in resolved if c not in required_set and c not in set(result)],
        already_in_plan=required_set,
    )
    final = pulled_in_sorted + result

    if pulled_in_sorted:
        logger.info(
            "[resolve_elective_prereqs] Pulled in %d prerequisite course(s) "
            "not in original selection: %s",
            len(pulled_in_sorted), pulled_in_sorted,
        )

    logger.info(
        "[resolve_elective_prereqs] DONE — %d elective(s) validated "
        "(%d pulled in as prereqs) | budget_used=%.1f / %.1f | remaining=%.1f",
        len(final), len(pulled_in_sorted),
        credit_budget - remaining_budget, credit_budget, remaining_budget,
    )
    return final, remaining_budget
