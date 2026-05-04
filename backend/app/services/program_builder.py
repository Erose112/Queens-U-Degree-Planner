"""
Converts the DataFrame produced by the program scraper into a list of fully
populated SQLAlchemy ORM objects:
    Program → Program_Section → Section_Courses
    Program → Subplan → Program_Section → Section_Courses
"""

from __future__ import annotations

import ast
import pandas as pd

from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
    Subplan,
)
from app.services.section_parser import parse_section_logic

def normalize_code(raw: str) -> str:
    """
    Remove whitespace / non-breaking spaces and upper-case a course code.
    e.g. 'cisc 121' → 'CISC121'
    """
    return raw.replace("\xa0", "").replace(" ", "").upper().strip()


def _parse_list_field(value) -> list:
    """
    Safely coerce a DataFrame field that may already be a list, or may be a
    stringified list/None, into an actual Python list.
    """
    if isinstance(value, list):
        return value
    if not value or isinstance(value, float):   # NaN / None
        return []
    if isinstance(value, str):
        try:
            parsed = ast.literal_eval(value)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []



def build_section(
    raw_section: dict,
    program_section_index: int,
    course_lookup: dict[str, int],
) -> Program_Section | None:
    """
    Build a single Program_Section ORM object with its child Section_Courses.

    ``program_id`` and ``subplan_id`` are intentionally left unset here.
    The caller (build_program) assigns them by setting the ORM relationships
    on the parent Program / Subplan objects, which lets SQLAlchemy populate
    the FK columns automatically on flush.

    A section with no resolvable courses but a non-null wildcard is still
    valid and is written with an empty section_courses list (the wildcard
    captures open-ended requirements resolved at advising time).
    Only sections with neither courses nor a wildcard are skipped.

    Parameters
    ----------
    raw_section : dict
        One element of the 'sections' list from the scraper output.
    program_section_index : int
        1-based display index within the parent (used for logging).
    course_lookup : dict[str, int]
        Normalised course_code → course_id already in the DB.

    Returns
    -------
    Program_Section | None
    """
    if not isinstance(raw_section, dict):
        return None

    raw_courses = raw_section.get("courses", [])
    if not isinstance(raw_courses, list):
        raw_courses = []

    wildcard: str | None = raw_section.get("wildcard") or None  # keep None, not ""


    logic_info = parse_section_logic(raw_section)

    section = Program_Section(
        logic_type=logic_info["logic_type"],
        credit_req=logic_info["credit_req"],
        wildcard=wildcard,
        # program_id and subplan_id are set via relationships in the caller
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
            Section_Courses(course_id=course_id)
        )

    if missing_codes:
        print(
            f"[program_builder]   Section {program_section_index} "
            f"{len(missing_codes)} unresolved course(s): {missing_codes}"
        )

    # Skip sections with neither resolved courses nor a wildcard
    if not section_course_objects and wildcard is None:
        print(
            f"[program_builder]   Section {program_section_index} "
        )
        return None

    section.section_courses = section_course_objects
    return section



def build_subplan(
    raw_subplan: dict,
    course_lookup: dict[str, int],
) -> Subplan | None:
    """
    Build a single Subplan ORM object with its child Program_Sections.

    ``program_id`` on each child Program_Section is set by build_program
    after this function returns, by assigning ``section.program = program``
    on the fully-assembled Program object.  This ensures program_id is
    never NULL on flush despite the integer PK not being available at
    build time.

    Parameters
    ----------
    raw_subplan : dict
        One element of the 'subplans' list from the scraper output, e.g.
        {
            "subplan_name": "i. Biomedical Discovery (BMDS-O) (36.00 units)",
            "subplan_code": "BMDS",
            "subplan_credits": 36,
            "sections":     [...],
        }
    course_lookup : dict[str, int]
        Normalised course_code → course_id mapping.

    Returns
    -------
    Subplan | None
    """
    if not isinstance(raw_subplan, dict):
        return None

    subplan_name = str(raw_subplan.get("subplan_name") or "Unknown Subplan")[:100]
    subplan_code = str(raw_subplan.get("subplan_code") or "").strip().upper()

    if not subplan_code:
        print(f"[program_builder]   Skipped subplan '{subplan_name}' — missing code.")
        return None

    # Parse optional credit count out of the name, e.g. "(36.00 units)"
    subplan_credits = str(raw_subplan.get("subplan_credits") or "").strip()
    raw_sections = _parse_list_field(raw_subplan.get("sections"))

    subplan = Subplan(
        subplan_code=subplan_code,
        subplan_name=subplan_name,
        subplan_credits=subplan_credits,
        # program_id set via relationship in build_program
    )

    built_sections: list[Program_Section] = []
    for idx, raw_section in enumerate(raw_sections, start=1):
        section = build_section(raw_section, idx, course_lookup)
        if section is not None:
            built_sections.append(section)

    # Assigning via the relationship populates subplan_id on flush.
    # program_id is populated separately in build_program (see below).
    subplan.sections = built_sections

    print(
        f"[program_builder]   Subplan '{subplan_code}' — "
        f"{len(built_sections)} section(s) built."
    )
    return subplan



def build_program(
    program_data: dict,
    course_lookup: dict[str, int],
) -> Program | None:
    """
    Build a single Program ORM object (with all children) from one scraper
    result dict.

    After assembling the full tree, every Program_Section that belongs to a
    Subplan has its ``program`` relationship set to the parent Program object.
    This ensures SQLAlchemy can resolve ``program_id`` (nullable=False) on
    flush without requiring the integer PK to be known at build time.

    Parameters
    ----------
    program_data : dict
        One row from the scraper DataFrame converted to a dict.  Expected keys:
            program_name, program_code, program_type, total_credits,
            has_subplans, sections, subplans
    course_lookup : dict[str, int]
        Normalised course_code → course_id mapping from the database.

    Returns
    -------
    Program ORM object, or None if program_data is empty / invalid.
    """
    if not program_data or not isinstance(program_data, dict):
        return None

    program_name = str(program_data.get("program_name") or "Unknown")
    program_code = str(program_data.get("program_code") or "").strip().upper()
    program_type = (str(program_data.get("program_type") or "")).title() or None
    program_link = str(program_data.get("program_link") or "").strip() or None
    has_subplans = bool(program_data.get("has_subplans", False))

    if not program_code:
        print(f"[program_builder] Skipped '{program_name}' — missing program_code.")
        return None

    try:
        total_credits = int(float(program_data.get("total_credits") or 0))
    except (TypeError, ValueError):
        total_credits = 0

    program = Program(
        program_code=program_code,
        program_name=program_name,
        program_type=str(program_type) if program_type else "Unknown",
        program_link=program_link,
        total_credits=total_credits,
        has_subplans=has_subplans,
    )

    # ── Top-level sections (belong directly to the program) ─────────────────
    raw_sections = _parse_list_field(program_data.get("sections"))
    built_sections: list[Program_Section] = []

    for idx, raw_section in enumerate(raw_sections, start=1):
        section = build_section(raw_section, idx, course_lookup)
        if section is not None:
            built_sections.append(section)

    # Setting via relationship populates program_id on flush
    program.sections = built_sections

    # ── Subplans (and their own sections) 
    built_subplans: list[Subplan] = []

    if has_subplans:
        raw_subplans = _parse_list_field(program_data.get("subplans"))

        for raw_subplan in raw_subplans:
            subplan = build_subplan(raw_subplan, course_lookup)
            if subplan is not None:
                built_subplans.append(subplan)

    # Setting via relationship populates program_id on Subplan rows on flush
    program.subplans = built_subplans

    for subplan in built_subplans:
        for section in subplan.sections:
            section.program = program

    # A program is valid if it has at least one top-level section OR subplan
    if not built_sections and not built_subplans:
        print(
            f"[program_builder] Skipped program '{program_name}' — "
            f"no valid sections or subplans."
        )
        return None

    print(
        f"[program_builder] Built '{program_code}' — "
        f"{len(built_sections)} top-level section(s), "
        f"{len(built_subplans)} subplan(s)."
    )
    return program



def build_all_programs(
    df: pd.DataFrame,
    course_lookup: dict[str, int],
) -> list[Program]:
    """
    Convert the full scraper DataFrame into a list of Program ORM objects.

    Expected DataFrame columns (at minimum):
        program_name, program_code, program_type, total_credits,
        has_subplans, sections, subplans

    Parameters
    ----------
    df : pd.DataFrame
    course_lookup : dict[str, int]
        Normalised course_code → course_id already persisted in the DB.

    Returns
    -------
    list[Program]  ready to be handed to program_writer.py
    """
    if df is None or df.empty:
        return []

    missing_cols = {"program_name", "program_code", "sections"} - set(df.columns)
    if missing_cols:
        print(f"[program_builder] Missing required columns: {missing_cols}")
        return []

    programs: list[Program] = []
    skipped = 0

    for _, row in df.iterrows():
        program_name = "unknown"
        try:
            row_dict = row.to_dict()
            program_name = row_dict.get("program_name", "unknown")
            program = build_program(row_dict, course_lookup)
            if program is not None:
                programs.append(program)
            else:
                skipped += 1
        except Exception as e:
            print(f"[program_builder] Exception building '{program_name}': {e}")
            skipped += 1

    print(f"\n[program_builder] Done — {len(programs)} built, {skipped} skipped.")
    return programs
