"""
Query helpers for course data from the database.
"""

from __future__ import annotations

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
