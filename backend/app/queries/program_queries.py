"""
Query helpers for program data from the database.
Use these from API routes or other services; do not put SQL strings in here.
"""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models.course import Course
from app.models.program import Program, Program_Section, Section_Courses


def get_program_by_id(db: Session, program_id: int) -> Program | None:
    """Return a program by primary key, or None if not found."""
    return db.query(Program).filter(Program.program_id == program_id).one_or_none()


def get_program_by_name(db: Session, program_name: str) -> Program | None:
    """Return the first program matching program_name (exact), or None."""
    return (
        db.query(Program)
        .filter(Program.program_name == program_name.strip())
        .one_or_none()
    )


def get_all_programs(db: Session) -> list[Program]:
    """Return all programs ordered by program_name."""
    return db.query(Program).order_by(Program.program_name).all()


def get_program_with_sections(db: Session, program_id: int) -> Program | None:
    """
    Return a program by id with sections and section_courses loaded.
    """
    return (
        db.query(Program)
        .options(
            joinedload(Program.sections).joinedload(
                Program_Section.section_courses
            )
        )
        .filter(Program.program_id == program_id)
        .one_or_none()
    )


def get_program_with_sections_and_courses(db: Session, program_id: int) -> Program | None:
    return (
        db.query(Program)
        .options(
            joinedload(Program.sections)
            .joinedload(Program_Section.section_courses)
            .joinedload(Section_Courses.course),
            joinedload(Program.sections)
            .joinedload(Program_Section.logic_rules),
        )
        .filter(Program.program_id == program_id)
        .one_or_none()
    )


def get_courses_in_program(db: Session, program_id: int) -> list[Course]:
    return (
        db.query(Course)
        .join(Section_Courses, Section_Courses.course_id == Course.course_id)
        .join(Program_Section, Program_Section.section_id == Section_Courses.section_id)
        .filter(Program_Section.program_id == program_id)
        .distinct()
        .order_by(Course.course_code)
        .all()
    )
