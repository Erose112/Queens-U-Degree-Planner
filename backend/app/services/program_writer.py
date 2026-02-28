"""
program_builder.py
------------------
Converts the DataFrame produced by the program scraper into a list of fully
populated SQLAlchemy ORM objects (Program → Program_Section →
Section_Courses + Program_Section_Logic).

No database I/O happens here; the resulting objects are passed to
program_writer.py for persistence.

Typical usage
-------------
    from app.services.program_builder import build_all_programs

    # `df` is the DataFrame returned by scrape_program_courses()
    # `course_lookup` maps normalized course_code → course_id from the DB
    programs = build_all_programs(df, course_lookup)
"""

from __future__ import annotations

import pandas as pd

from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
    Program_Section_Logic,
)
from app.services.section_parser import parse_section_logic



def _normalize_code(raw: str) -> str:
    """
    Remove whitespace / non-breaking spaces and upper-case a course code.
    e.g. 'cisc 121' → 'CISC121'
    """
    return raw.replace("\xa0", "").replace(" ", "").upper().strip()


def _build_section(
    raw_section: dict,
    program_section_index: int,
    course_lookup: dict[str, int],
) -> Program_Section | None:
    """
    Build a single Program_Section ORM object with its child
    Section_Courses and Program_Section_Logic children.

    Returns None if the section is invalid or has no resolvable courses,
    so the caller can skip it rather than writing an empty section to the DB.

    Parameters
    ----------
    raw_section : dict
        One element of the 'sections' list from the scraper output, e.g.
        {"section_id": 2, "section_credits": 6.0, "courses": ["CHEM109", ...]}
    program_section_index : int
        1-based display index within the parent program (used for logging).
    course_lookup : dict[str, int]
        Mapping of normalized course_code → course_id already in the DB.

    Returns
    -------
    Program_Section | None
    """
    if not isinstance(raw_section, dict):
        print(
            f"  [program_builder] Section {program_section_index}: "
            f"invalid format (expected dict, got {type(raw_section).__name__}) — skipping."
        )
        return None

    raw_courses = raw_section.get("courses", [])
    if not isinstance(raw_courses, list):
        print(
            f"  [program_builder] Section {program_section_index}: "
            f"'courses' field is not a list — skipping section."
        )
        return None

    logic_info = parse_section_logic(raw_section)

    section = Program_Section(
        credit_req=int(raw_section.get("section_credits") or 0),
    )

    # --- Section_Courses rows -------------------------------------------------
    section_course_objects: list[Section_Courses] = []
    missing_codes: list[str] = []

    for raw_code in raw_courses:
        try:
            code = _normalize_code(str(raw_code))
        except Exception:
            print(
                f"  [program_builder] Section {program_section_index}: "
                f"could not normalize course code '{raw_code}' — skipping course."
            )
            continue

        course_id = course_lookup.get(code)

        if course_id is None:
            missing_codes.append(code)
            continue

        section_course_objects.append(Section_Courses(course_id=course_id))

    if missing_codes:
        print(
            f"  [program_builder] Section {program_section_index}: "
            f"{len(missing_codes)} course(s) not found in DB and skipped: {missing_codes}"
        )

    # If no courses resolved at all, skip the entire section
    if not section_course_objects:
        print(
            f"  [program_builder] Section {program_section_index}: "
            f"no courses resolved — section skipped."
        )
        return None

    section.section_courses = section_course_objects

    # --- Program_Section_Logic row (one per section) -------------------------
    # sc_id is intentionally omitted — this is a section-level rule.
    # The DB writer can back-fill it after flushing if needed.
    section.logic_rules = [
        Program_Section_Logic(
            logic_type=logic_info["logic_type"],
            logic_value=logic_info["logic_value"],
        )
    ]

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
            "program_type":   None,
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
        print(
            "[program_builder] Skipping invalid program_data entry "
            f"(expected dict, got {type(program_data).__name__})."
        )
        return None

    program_name = program_data.get("program_name", "Unknown")
    program_type = program_data.get("program_type")
    raw_sections = program_data.get("sections")

    # Validate sections field
    if not isinstance(raw_sections, list):
        print(
            f"[program_builder] '{program_name}': 'sections' is missing or not a list "
            f"(got {type(raw_sections).__name__}) — skipping program."
        )
        return None

    if not raw_sections:
        print(f"[program_builder] '{program_name}': sections list is empty — skipping program.")
        return None

    # Safely parse total_credits
    try:
        total_credits = int(program_data.get("total_credits") or 0)
    except (TypeError, ValueError):
        total_credits = 0
        print(
            f"[program_builder] '{program_name}': could not parse total_credits "
            f"— defaulting to 0."
        )

    program = Program(
        program_name=str(program_name),
        program_type=str(program_type) if program_type else None,
        total_credits=total_credits,
    )

    built_sections: list[Program_Section] = []
    for idx, raw_section in enumerate(raw_sections, start=1):
        section = _build_section(raw_section, idx, course_lookup)
        if section is not None:
            built_sections.append(section)

    # If every section was skipped, don't write a shell program to the DB
    if not built_sections:
        print(
            f"[program_builder] '{program_name}': all sections were skipped "
            f"— program not built."
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
        print("[program_builder] DataFrame is empty — no programs to build.")
        return []

    missing_cols = {"program_name", "sections"} - set(df.columns)
    if missing_cols:
        print(f"[program_builder] DataFrame is missing required columns: {missing_cols}")
        return []

    programs: list[Program] = []
    skipped = 0

    for _, row in df.iterrows():
        try:
            program = build_program(row.to_dict(), course_lookup)
            if program is not None:
                programs.append(program)
                print(
                    f"[program_builder] Built: '{program.program_name}' "
                    f"({len(program.sections)} section(s))"
                )
            else:
                skipped += 1
        except Exception as e:
            skipped += 1
            print(
                f"[program_builder] Unexpected error on "
                f"'{row.get('program_name', 'unknown')}': {e} — skipping."
            )

    print(f"\n[program_builder] Done — {len(programs)} built, {skipped} skipped.")
    return programs
