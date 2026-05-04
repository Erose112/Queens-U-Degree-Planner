"""
Writes Program / Subplan / Program_Section / Section_Courses
objects to the database.

1.  Load a course_lookup dict (course_code → course_id) from the courses table.
    Fail immediately if the table is empty — course_writer must run first.
2.  Call build_all_programs() to convert the scraper DataFrame into ORM objects.
    Fail immediately if no programs were built.
3.  Clear existing program tables in FK-safe order (deepest children first).
4.  Add all Program objects and let cascade handle every child table.
"""

from __future__ import annotations

import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import engine
from app.models.course import Course
from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
    Subplan,
)
from app.services.program_builder import build_all_programs


def _load_course_lookup(session: Session) -> dict[str, int]:
    """
    Return a dict mapping normalized course_code → course_id for every row
    currently in the `courses` table.
    e.g. {"CISC121": 42, "MATH110": 17, ...}
    """
    rows = session.query(Course.course_code, Course.course_id).all()
    return {
        code.replace(" ", "").replace("\xa0", "").upper(): cid
        for code, cid in rows
    }


def _clear_program_tables(session: Session) -> None:
    """
    Delete all existing program-related rows in FK-safe order (deepest
    children first), then reset AUTO_INCREMENT counters.

    Delete order:
        section_courses  →  program_section  →  subplans  →  programs

    Raises SQLAlchemyError and rolls back if any step fails.
    """
    try:
        session.query(Section_Courses).delete()
        session.query(Program_Section).delete()
        session.query(Subplan).delete()
        session.query(Program).delete()
        session.commit()

        for table in (
            "section_courses",
            "program_section",
            "subplans",
            "programs",
        ):
            session.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1"))
        session.commit()

        print("[program_writer] Existing program data cleared.")

    except SQLAlchemyError:
        session.rollback()
        raise  # Propagate so the caller does not proceed to write


def write_all_programs_to_mysql(df: pd.DataFrame) -> None:
    """
    Convert *df* (the DataFrame returned by ``scrape_program_courses()``) into
    ORM objects and persist them.

    Parameters
    ----------
    df : pd.DataFrame
        Must contain the columns: program_name, program_code, program_type,
        total_credits, has_subplans, sections, subplans.

    Raises
    ------
    RuntimeError
        If the course lookup is empty (course_writer hasn't run yet) or if
        no valid programs could be built from the DataFrame.
    SQLAlchemyError
        If clearing existing data or committing new data fails. The session
        is always rolled back before the error is re-raised.
    """
    if df is None or df.empty:
        print("[program_writer] Received empty DataFrame — nothing to write.")
        return

    with Session(engine) as session:
        try:
            # Load course lookup — fail fast if courses table is empty
            course_lookup = _load_course_lookup(session)

            if not course_lookup:
                raise RuntimeError(
                    "[program_writer] course_lookup is empty — "
                    "run course_writer.py first before writing programs."
                )

            # Build ORM objects from the DataFrame
            programs: list[Program] = build_all_programs(df, course_lookup)

            # Fail before touching the DB if nothing was built
            if not programs:
                raise RuntimeError(
                    "[program_writer] No valid programs were built from the DataFrame. "
                    "The database was not modified."
                )

            # Clear existing program data
            _clear_program_tables(session)

            # Add all Program objects; cascades handle every child table
            session.add_all(programs)

            # Flush so auto-generated PKs are populated, then commit
            session.flush()
            session.commit()

            print(f"[program_writer] Successfully wrote {len(programs)} program(s).")

        except RuntimeError:
            print("[program_writer] RuntimeError:", flush=True)
            # RuntimeErrors are raised before any DB mutation — no rollback needed
            raise

        except SQLAlchemyError:
            session.rollback()
            raise