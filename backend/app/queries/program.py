"""
program_queries.py
Query helpers for program data from the database.
Use these from API routes or other services; do not put SQL strings in here.
"""

from __future__ import annotations

from collections import deque

from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload, contains_eager

from app.models.course import Course
from app.models.program import Program, Program_Section, Section_Courses, Subplan
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse

from app.services.section_parser import LOGIC_REQUIRED


def get_all_programs(db: Session) -> list[Program]:
    """Return all programs ordered by program_name."""
    return db.query(Program).order_by(Program.program_name).all()



def _program_section_options():
    """
    Shared eager-load options for a single Program_Section collection:
    section_courses → course.
    Extracted so both program and subplan load paths use identical options.
    """
    return (
        selectinload(Program_Section.section_courses)
        .joinedload(Section_Courses.course)
    )



def get_program_structure(db: Session, program_id: int) -> Program | None:
    """
    Load a program with ALL sections (top-level and subplan-owned),
    their courses, and section logic in as few round-trips as possible.
 
    Top-level sections  →  program.sections         (subplan_id IS NULL)
    Subplan sections    →  program.subplans[n].sections
    """
    return db.scalar(
        select(Program)
        .outerjoin(
            Program_Section,
            and_(
                Program_Section.program_id == Program.program_id,
                Program_Section.subplan_id.is_(None)
            )
        )
        .where(Program.program_id == program_id)
        .options(
            # Top-level sections only (subplan_id IS NULL)
            contains_eager(Program.sections)
            .options(_program_section_options()),
 
            # Subplan sections
            selectinload(Program.subplans)
            .selectinload(Subplan.sections)
            .options(_program_section_options()),
        )
        .distinct()
    )



def get_program_for_prereq_graph(db: Session, program_id: int) -> Program | None:
    """
    Load a program with all sections and section_courses for BFS traversal.
    Identical shape to get_program_structure — kept separate so each
    function's intent stays explicit.
    """
    return db.scalar(
        select(Program)
        .outerjoin(
            Program_Section,
            and_(
                Program_Section.program_id == Program.program_id,
                Program_Section.subplan_id.is_(None)
            )
        )
        .where(Program.program_id == program_id)
        .options(
            contains_eager(Program.sections)
            .options(_program_section_options()),
 
            selectinload(Program.subplans)
            .selectinload(Subplan.sections)
            .options(_program_section_options()),
        )
        .distinct()
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



def _all_sections(program: Program) -> list[Program_Section]:
    """
    Flatten top-level sections and all subplan sections into one list.
    This is the single place that knows about the two-path structure so
    callers don't have to repeat the logic.
    """
    top_level = list(program.sections)
    subplan_sections = [
        section
        for subplan in program.subplans
        for section in subplan.sections
    ]
    return top_level + subplan_sections



def bfs_prerequisite_graph(
    db: Session,
    program: Program,
) -> tuple[dict[int, str], dict[int, Course], dict[int, list[PrerequisiteSet]]]:
    """
    BFS outward from all courses in the program to collect the full
    prerequisite graph.
 
    Node type is derived from Program_Section.logic_type
        logic_type == LOGIC_REQUIRED (0)  →  all courses in section are "required"
        logic_type == LOGIC_CHOOSE_CREDITS (1) →  all courses in section are "choice"
 
    "required" takes precedence over "choice" if a course appears in both.
 
    Returns:
        section_course_type  — course_id → "required" | "choice" | "prereq"
        all_courses          — course_id → Course ORM object
        all_prereq_sets      — course_id → list[PrerequisiteSet]
    """
    section_course_type: dict[int, str] = {}
    all_courses: dict[int, Course] = {}
 
    # Iterate ALL sections — top-level and subplan-owned
    for section in _all_sections(program):
        node_type = "required" if section.logic_type == LOGIC_REQUIRED else "choice"
        for sc in section.section_courses:
            cid = sc.course_id
            # "required" wins if the same course appears in multiple sections
            if section_course_type.get(cid) != "required":
                section_course_type[cid] = node_type
            all_courses[cid] = sc.course
 
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
