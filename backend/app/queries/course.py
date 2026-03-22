"""
Query helpers for course data from the database.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session, selectinload, joinedload

from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse


def get_course_by_id(db: Session, course_id: int) -> Course | None:
    """Return a course by primary key, or None if not found."""
    return db.query(Course).filter(Course.course_id == course_id).one_or_none()


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


def get_courses_by_ids(db: Session, course_ids: list[int]) -> list[Course]:
    """Return courses whose course_id is in the given list, in id order."""
    if not course_ids:
        return []
    return (
        db.query(Course)
        .filter(Course.course_id.in_(course_ids))
        .order_by(Course.course_id)
        .all()
    )


def get_courses_by_codes(db: Session, course_codes: list[str]) -> list[Course]:
    """Return courses whose course_code is in the given list."""
    if not course_codes:
        return []
    codes = [c.strip() for c in course_codes if c and c.strip()]
    if not codes:
        return []
    return db.query(Course).filter(Course.course_code.in_(codes)).all()


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


def get_course_with_exclusions(db: Session, course_id: int) -> Course | None:
    """Return a course by id with exclusions loaded."""
    return (
        db.query(Course)
        .options(joinedload(Course.exclusions))
        .filter(Course.course_id == course_id)
        .one_or_none()
    )



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