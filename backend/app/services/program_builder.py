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
    ProgramCourseLists,
)
from app.services.section_parser import parse_section_logic, LOGIC_REQUIRED

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


def calculate_program_credits(sections: list[Program_Section], course_credits_lookup: dict[int, int]) -> int:
    """
    Calculate credits by summing credits from top-level sections only.
    """
    total = 0

    for section in sections:
        if section.logic_type == LOGIC_REQUIRED:
            # Sum all course credits in this section
            course_sum = sum(
                course_credits_lookup.get(section_course.course_id, 0)
                for section_course in section.section_courses
            )
            if course_sum == 0:
                # Wildcard-only section
                total += section.credit_req or 0
            elif section.credit_req and section.credit_req < course_sum:
                total += section.credit_req
            else:
                total += course_sum
        else:
            if section.credit_req:
                total += section.credit_req

    return total



def build_list(
    raw_list: list[dict],
    course_lookup: dict[str, int],
) -> list[ProgramCourseLists]:
    """
    Build a list of ProgramCourseLists objects from scraped course_lists.
    
    Converts flat list structure from scraper into ORM objects.
    Each scraped list like {"list_name": "GPHY_Physical", "courses": ["GPHY102", ...]}
    becomes multiple ProgramCourseLists rows (one per course), where all courses
    in the same list_name share the same list_id.
    
    Parameters
    ----------
    raw_list : list[dict]
        Raw course_lists from scraper, each with 'list_name' and 'courses' keys.
    course_lookup : dict[str, int]
        Normalised course_code → course_id mapping.
    
    Returns
    -------
    list[ProgramCourseLists]
        ORM objects ready to be assigned to program.course_lists.
    """
    course_list_objects: list[ProgramCourseLists] = []

    raw_list = _parse_list_field(raw_list)
    if not raw_list:
        return []

    # Track list_name -> list_id mapping to group courses by list_name
    list_name_to_id: dict[str, int] = {}
    next_list_id = 1

    for raw_list_dict in raw_list:
        if not isinstance(raw_list_dict, dict):
            continue

        list_name = str(raw_list_dict.get("list_name", "")).strip()
        if not list_name:
            continue

        # Assign list_id if this is the first time seeing this list_name
        if list_name not in list_name_to_id:
            list_name_to_id[list_name] = next_list_id
            next_list_id += 1

        list_id = list_name_to_id[list_name]

        courses = raw_list_dict.get("courses", [])
        if not isinstance(courses, list):
            courses = []

        # Create one ProgramCourseLists row per course in this list
        for raw_course in courses:
            try:
                code = normalize_code(str(raw_course))
            except Exception:
                continue

            course_id = course_lookup.get(code)
            if course_id is None:
                continue

            course_list_objects.append(
                ProgramCourseLists(list_id=list_id, list_name=list_name, course_id=course_id)
            )

    return course_list_objects




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
    course_credits_lookup: dict[int, int],
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
        # Generate a code from the name for option-list style subplans
        subplan_code = subplan_name.upper().replace(" ", "_")[:4]

    subplan = Subplan(
        subplan_code=subplan_code,
        subplan_name=subplan_name,
        subplan_credits=0,
    )

    # Convert to int or None (NULL in database)
    raw_credits = raw_subplan.get("subplan_credits")
    subplan_credits = int(raw_credits) if raw_credits else None

    raw_sections = _parse_list_field(raw_subplan.get("sections"))
    built_sections: list[Program_Section] = []
    for idx, raw_section in enumerate(raw_sections, start=1):
        section = build_section(raw_section, idx, course_lookup)
        if section is not None:
            built_sections.append(section)

    calculate_credits = calculate_program_credits(built_sections, course_credits_lookup)

    if subplan_credits is not None and calculate_credits != subplan_credits:
        print(
            f"[program_builder]   Warning: calculated subplan credits ({calculate_credits}) "
            f"does not match scraper subplan_credits ({subplan_credits}) for '{subplan_code}'"
        )

    subplan.subplan_credits = calculate_credits
    subplan.sections = built_sections

    return subplan



def build_program(
    program_data: dict,
    course_lookup: dict[str, int],
    course_credits_lookup: dict[int, int],
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
            program_name, program_code, program_type, program_credits,
            num_subplans_required, sections, subplans
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
    num_subplans_required = int(program_data.get("num_subplans_required", 0))

    if not program_code:
        print(f"[program_builder] Skipped '{program_name}' — missing program_code.")
        return None

    program = Program(
        program_code=program_code,
        program_name=program_name,
        program_type=str(program_type) if program_type else "Unknown",
        program_link=program_link,
        program_credits=0,
        num_subplans_required=num_subplans_required,
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

    # Subplans (and their own sections)
    built_subplans: list[Subplan] = []

    if num_subplans_required > 0:
        raw_subplans = _parse_list_field(program_data.get("subplans"))

        for raw_subplan in raw_subplans:
            subplan = build_subplan(raw_subplan, course_lookup, course_credits_lookup)
            if subplan is not None:
                built_subplans.append(subplan)

    # Setting via relationship populates program_id on Subplan rows on flush
    program.subplans = built_subplans

    for subplan in built_subplans:
        for section in subplan.sections:
            section.program = program

    # Build course lists
    raw_course_lists = _parse_list_field(program_data.get("course_lists"))
    built_course_lists: list[ProgramCourseLists] = build_list(raw_course_lists, course_lookup)
    program.course_lists = built_course_lists

    # A program is valid if it has at least one top-level section OR subplan
    if not built_sections and not built_subplans:
        print(
            f"[program_builder] Skipped program '{program_name}' — "
            f"no valid sections or subplans."
        )
        return None

    print(f"[program_builder] Built program '{program_code}' with "
          f"{len(built_sections)} top-level section(s) and "
          f"{len(built_subplans)} subplan(s).")

    calculated_credits = calculate_program_credits(built_sections, course_credits_lookup)
    if calculated_credits != program_data.get("program_credits", 0):
        print(
            f"[program_builder]   Warning: calculated credits ({calculated_credits}) "
            f"does not match scraper program_credits ({program_data.get('program_credits')})"
        )
    program.program_credits = calculated_credits
    return program



def build_all_programs(
    df: pd.DataFrame,
    course_lookup: dict[str, int],
    course_credits_lookup: dict[int, int],
) -> list[Program]:
    """
    Convert the full scraper DataFrame into a list of Program ORM objects.

    Expected DataFrame columns (at minimum):
        program_name, program_code, program_type, program_credits,
        num_subplans_required, sections, subplans

    Parameters
    ----------
    df : pd.DataFrame
    course_lookup : dict[str, int]
        Normalised course_code → course_id already persisted in the DB.
    course_credits_lookup : dict[int, int]
        Maps course_id -> credits for calculating program totals.

    Returns
    -------
    list[Program]  ready to be handed to program_writer.py
    """
    if df is None or df.empty:
        return []

    missing_cols = {"program_name", "program_code", "sections", "num_subplans_required", "program_credits"} - set(df.columns)
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
            program = build_program(row_dict, course_lookup, course_credits_lookup)
            if program is not None:
                programs.append(program)
            else:
                skipped += 1
        except Exception as e:
            print(f"[program_builder] Exception building '{program_name}': {e}")
            skipped += 1

    print(f"\n[program_builder] Done — {len(programs)} built, {skipped} skipped.")
    return programs
