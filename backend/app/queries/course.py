"""
Query helpers for course data from the database.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session, selectinload

from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse
from collections import deque
from sqlalchemy import select


def get_course_by_code(db: Session, course_code: str) -> Course | None:
    """Return a course by course_code (e.g. 'BIOL102'), or None if not found."""
    return (
        db.query(Course)
        .filter(Course.course_code == course_code.strip())
        .one_or_none()
    )


def get_all_courses(db: Session) -> list[Course]:
    """Return all courses. Use with care on large datasets."""
    return db.query(Course).order_by(Course.course_code).all()



def get_course_with_prerequisites(db: Session, course_id: int) -> Course | None:
    return (
        db.query(Course)
        .options(
            selectinload(Course.prerequisite_sets)
            .selectinload(PrerequisiteSet.required_courses)
            .selectinload(PrerequisiteSetCourse.required_course)
        )
        .filter(Course.course_id == course_id)
        .one_or_none()
    )



def get_prerequisite_graph_data(
    db: Session,
    root_course_id: int,
) -> tuple[dict[int, Course], dict[int, list[PrerequisiteSet]]]:
    """
    BFS from root_course_id outward through all transitive prerequisites.

    Returns:
        all_courses:      {course_id: Course}              — every node in the graph
        all_prereq_sets:  {course_id: list[PrerequisiteSet]} — edges/sets per course
    """
    all_courses: dict[int, Course] = {}
    all_prereq_sets: dict[int, list[PrerequisiteSet]] = {}

    visited: set[int] = set()
    queue: deque[int] = deque([root_course_id])

    while queue:
        # Batch-fetch everything in the current frontier in one query
        frontier: list[int] = []
        while queue:
            cid = queue.popleft()
            if cid not in visited:
                visited.add(cid)
                frontier.append(cid)

        if not frontier:
            break

        # Single query: fetch courses + their prereq sets + the join rows
        courses = (
            db.execute(
                select(Course)
                .where(Course.course_id.in_(frontier))
                .options(
                    selectinload(Course.prerequisite_sets).selectinload(
                        PrerequisiteSet.required_courses
                    )
                )
            )
            .scalars()
            .all()
        )

        for course in courses:
            all_courses[course.course_id] = course

            if course.prerequisite_sets:
                all_prereq_sets[course.course_id] = course.prerequisite_sets

                # Enqueue prerequisite courses not yet visited
                for ps in course.prerequisite_sets:
                    for psc in ps.required_courses:
                        if psc.required_course_id not in visited:
                            queue.append(psc.required_course_id)
            else:
                # Leaf node — include it in the graph with an empty list
                all_prereq_sets[course.course_id] = []

    return all_courses, all_prereq_sets



def get_free_electives_by_level(
    db: Session,
    level: int,
    exclude: set[str],
    limit: int = 20,
) -> list[Course]:
    """
    Return courses at the given level (e.g. 100 = course codes 100-199)
    that are not in the exclude set and have no prerequisites.
    """
    has_prereqs = (
        db.query(PrerequisiteSet.course_id)
        .distinct()
        .scalar_subquery()
    )

    # Fetch all courses with no prerequisites, excluding already-scheduled ones
    candidates = (
        db.query(Course)
        .filter(
            ~Course.course_code.in_(exclude),
            ~Course.course_id.in_(has_prereqs),
        )
        .order_by(Course.course_code)
        .all()
    )

    # Filter by level in Python using the same logic as course_level_floor
    level_min = level
    level_max = level + 99

    results = []
    for course in candidates:
        match = re.search(r'(\d+)$', course.course_code)
        if not match:
            continue
        course_num = int(match.group(1))
        if level_min <= course_num <= level_max:
            results.append(course)
        if len(results) >= limit:
            break

    return results
