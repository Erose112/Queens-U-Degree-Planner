"""
program_queries.py
Query helpers for program data from the database.
Use these from API routes or other services; do not put SQL strings in here.
"""

from __future__ import annotations

from collections import deque

from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.course import Course
from app.models.program import Program, Program_Section, Section_Courses
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse


def get_all_programs(db: Session) -> list[Program]:
    """Return all programs ordered by program_name."""
    return db.query(Program).order_by(Program.program_name).all()



def get_program_structure(db: Session, program_id: int) -> Program | None:
    """
    Load a program with all sections, their courses (via Section_Courses),
    and section logic rules in a single round-trip.
    """
    return db.scalar(
        select(Program)
        .where(Program.program_id == program_id)
        .options(
            selectinload(Program.sections)
            .selectinload(Program_Section.section_courses)
            .joinedload(Section_Courses.course),
        )
    )



def get_program_for_prereq_graph(db: Session, program_id: int) -> Program | None:
    """Load a program with sections and section_courses for BFS traversal."""
    return db.scalar(
        select(Program)
        .where(Program.program_id == program_id)
        .options(
            selectinload(Program.sections)
            .selectinload(Program_Section.section_courses)
            .joinedload(Section_Courses.course),
        )
    )


def get_prereq_sets_for_course(db: Session, course_id: int) -> list[PrerequisiteSet]:
    """Return all prerequisite sets for a course, with member courses loaded."""
    return db.scalars(
        select(PrerequisiteSet)
        .where(PrerequisiteSet.course_id == course_id)
        .options(
            selectinload(PrerequisiteSet.required_courses)
            .joinedload(PrerequisiteSetCourse.required_course)
        )
    ).all()


def bfs_prerequisite_graph(
    db: Session,
    program: Program,
) -> tuple[dict[int, str], dict[int, Course], dict[int, list[PrerequisiteSet]]]:
    """
    BFS outward from all courses in the program to collect the full
    prerequisite graph.

    Returns:
        section_course_type  — course_id → "required" | "choice" | "prereq"
        all_courses          — course_id → Course ORM object
        all_prereq_sets      — course_id → list[PrerequisiteSet]
    """
    # Map course_id → node_type for every course directly in the program.
    # "required" takes precedence over "choice".
    section_course_type: dict[int, str] = {}
    for section in program.sections:
        for sc in section.section_courses:
            cid = sc.course_id
            incoming = "required" if sc.is_required else "choice"
            if section_course_type.get(cid) != "required":
                section_course_type[cid] = incoming

    all_courses: dict[int, Course] = {
        sc.course_id: sc.course
        for section in program.sections
        for sc in section.section_courses
    }
    all_prereq_sets: dict[int, list[PrerequisiteSet]] = {}

    queue: deque[int] = deque(section_course_type.keys())
    visited: set[int] = set(section_course_type.keys())

    while queue:
        cid = queue.popleft()
        prereq_sets = get_prereq_sets_for_course(db, cid)

        if not prereq_sets:
            continue

        all_prereq_sets[cid] = list(prereq_sets)

        for ps in prereq_sets:
            for psc in ps.required_courses:
                req_cid = psc.required_course_id
                if req_cid not in visited:
                    visited.add(req_cid)
                    queue.append(req_cid)
                    all_courses[req_cid] = psc.required_course
                    if req_cid not in section_course_type:
                        section_course_type[req_cid] = "prereq"

    return section_course_type, all_courses, all_prereq_sets
