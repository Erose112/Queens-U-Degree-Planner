"""
Converts the DataFrame produced by the program scraper into a list of fully
populated SQLAlchemy ORM objects (Program → Program_Section →
Section_Courses).
"""

from __future__ import annotations

import pandas as pd

from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
)
from app.services.section_parser import parse_section_logic, LOGIC_REQUIRED


def normalize_code(raw: str) -> str:
    """
    Remove whitespace / non-breaking spaces and upper-case a course code.
    e.g. 'cisc 121' → 'CISC121'
    """
    return raw.replace("\xa0", "").replace(" ", "").upper().strip()


def build_section(
    raw_section: dict,
    program_section_index: int,
    course_lookup: dict[str, int],
) -> Program_Section | None:
    """
    Build a single Program_Section ORM object with its child
    Section_Courses.

    Returns None if the section is invalid or has no resolvable courses,
    so the caller can skip it rather than writing an empty section to the DB.

    Parameters
    ----------
    raw_section : dict
        One element of the 'sections' list from the scraper output, e.g.
        {
            "section_id":      2,
            "section_name":    "COMA Options",   # optional – generated if absent
            "section_credits": 6.0,
            "courses": [
                "CHEM109",                        # plain string → is_required=1
                {"code": "CISC121", "is_required": 0},  # dict form also accepted
                ...
            ]
        }
    program_section_index : int
        1-based display index within the parent program (used for naming / logging).
    course_lookup : dict[str, int]
        Mapping of normalized course_code → course_id already in the DB.

    Returns
    -------
    Program_Section | None
    """
    if not isinstance(raw_section, dict):
        return None

    raw_courses = raw_section.get("courses", [])
    if not isinstance(raw_courses, list):
        return None

    # ── section_name is required (NOT NULL) ──────────────────────────────────
    section_name: str = str(
        raw_section.get("section_name") or f"Section {program_section_index}"
    )[:100]  # trim to column width

    logic_info = parse_section_logic(raw_section)

    # is_required is section-wide: all courses are required when the logic is
    # LOGIC_REQUIRED; they are optional choices for LOGIC_CHOOSE_CREDITS.
    is_required = 1 if logic_info["logic_type"] == LOGIC_REQUIRED else 0

    section = Program_Section(
        section_name=section_name,
        logic_type=logic_info["logic_type"],
        credit_req=logic_info["credit_req"],
    )

    section_course_objects: list[Section_Courses] = []
    missing_codes: list[str] = []

    for raw_course in raw_courses:
        try:
            code = normalize_code(str(raw_course))
        except Exception:
            continue

        course_id = course_lookup.get(code)

        if course_id is None:
            missing_codes.append(code)
            continue

        section_course_objects.append(
            Section_Courses(course_id=course_id, is_required=is_required)
        )

    if missing_codes:
        print(
            f"[program_builder] Section {program_section_index} "
            f"('{section_name}'): "
            f"{len(missing_codes)} unresolved course(s): {missing_codes}"
        )

    # If no courses resolved at all, skip the entire section
    if not section_course_objects:
        return None

    section.section_courses = section_course_objects
    return section


def build_program(
    program_data: dict,
    course_lookup: dict[str, int],
) -> Program | None:
    """
    Build a single Program ORM object (with all children) from one scraper
    result dict.

    Parameters
    ----------
    program_data : dict
        One row from the scraper DataFrame converted to a dict, e.g.
        {
            "program_name":   "computing-mathematics-and-analytics",
            "program_type":   Either ["major, minor, specialization, general"],
            "total_credits":  120,
            "sections":       [...],
        }
    course_lookup : dict[str, int]
        Normalized course_code → course_id mapping from the database.

    Returns
    -------
    Program ORM object, or None if program_data is empty / invalid.
    """
    if not program_data or not isinstance(program_data, dict):
        return None

    program_name = program_data.get("program_name", "Unknown")
    program_type = program_data.get("program_type").title()
    raw_sections = program_data.get("sections")

    # Validate sections field
    if not isinstance(raw_sections, list):
        return None

    if not raw_sections:
        return None

    try:
        total_credits = int(float(program_data.get("total_credits") or 0))
    except (TypeError, ValueError):
        total_credits = 0

    program = Program(
        program_name=str(program_name),
        program_type=str(program_type) if program_type else None,
        total_credits=total_credits,
    )

    built_sections: list[Program_Section] = []
    for idx, raw_section in enumerate(raw_sections, start=1):
        section = build_section(raw_section, idx, course_lookup)
        if section is not None:
            built_sections.append(section)

    if not built_sections:
        print(
            f"[program_builder] Skipped program '{program_name}' — "
            f"no valid sections (course_lookup may be incomplete or sections are empty)."
        )
        return None

    program.sections = built_sections
    return program


def build_all_programs(
    df: pd.DataFrame,
    course_lookup: dict[str, int],
) -> list[Program]:
    """
    Convert the full scraper DataFrame into a list of Program ORM objects.

    The DataFrame is expected to have at minimum the columns that
    ``scrape_program_courses()`` produces:
        program_name, program_type, total_credits, sections

    Parameters
    ----------
    df : pd.DataFrame
    course_lookup : dict[str, int]
        Normalized course_code → course_id already persisted in the DB.

    Returns
    -------
    list[Program]  ready to be handed to program_writer.py
    """
    if df is None or df.empty:
        return []

    missing_cols = {"program_name", "sections"} - set(df.columns)
    if missing_cols:
        print(f"[program_builder] Missing required columns: {missing_cols}")
        return []

    programs: list[Program] = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            program = build_program(row.to_dict(), course_lookup)
            if program is not None:
                programs.append(program)
            else:
                skipped += 1
        except Exception as e:
            program_name = row.get("program_name", "unknown") if hasattr(row, "get") else "unknown"
            print(f"[program_builder] Exception building program '{program_name}': {e}")
            skipped += 1

    print(f"\n[program_builder] Done — {len(programs)} built, {skipped} skipped.")
    return programs
