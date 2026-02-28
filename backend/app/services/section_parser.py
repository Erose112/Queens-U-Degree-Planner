"""
section_parser.py
-----------------
Converts raw section dicts produced by the program scraper into structured
logic descriptors that map directly onto the Program_Section_Logic model.

Logic Types
-----------
  LOGIC_REQUIRED     (1) Every course in the section is mandatory.
                           section_credits == 0 in the scraper output signals
                           this: the student must complete *all* listed courses.

  LOGIC_CHOOSE_CREDITS (2) The student must accumulate exactly `logic_value`
                           credits from the courses listed in the section.
                           section_credits > 0 in the scraper output signals this.

  LOGIC_CHOOSE_COUNT  (3) Reserved for future use: choose N courses from the
                           section regardless of credit weight.

Data contract
-------------
Input  (from scraper):
    {
        "section_id":      int,          # local index, reassigned by the writer
        "section_credits": float | 0,    # 0  → all courses required, >0 → choose-up-to
        "courses":         list[str],    # e.g. ["CISC121", "MATH110"]
    }

Output (one dict per section):
    {
        "logic_type":  int,   # LOGIC_* constant
        "logic_value": int,   # credits required (0 when type == REQUIRED)
    }
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Constants – stored in the logic_type column of Program_Section_Logic
# ---------------------------------------------------------------------------
LOGIC_REQUIRED       = 1   # All courses in the section are mandatory
LOGIC_CHOOSE_CREDITS = 2   # Choose enough courses to reach `logic_value` credits
LOGIC_CHOOSE_COUNT   = 3   # Choose exactly `logic_value` courses (reserved)


def parse_section_logic(section: dict) -> dict:
    """
    Return a logic descriptor for a single section dict.

    Parameters
    ----------
    section : dict
        A section dict as produced by the scraper, e.g.
        {"section_id": 2, "section_credits": 6.0, "courses": ["CHEM109", ...]}

    Returns
    -------
    dict with keys ``logic_type`` (int) and ``logic_value`` (int).
    """
    raw_credits = section.get("section_credits", 0) or 0

    try:
        credits = float(str(raw_credits).strip().split()[0])  # handles "6.0 units"
    except (TypeError, ValueError, IndexError):
        credits = 0.0
        print(f"[section_parser] Warning: could not parse section_credits "
            f"value '{raw_credits}', defaulting to REQUIRED logic.")

    if credits > 0:
        return {
            "logic_type":  LOGIC_CHOOSE_CREDITS,
            "logic_value": int(credits),
        }

    # Default: all courses in this section are required
    return {
        "logic_type":  LOGIC_REQUIRED,
        "logic_value": 0,
    }


def parse_all_sections(sections: list[dict]) -> list[dict]:
    """
    Convenience wrapper: parse logic for every section in a program.

    Returns a parallel list of logic descriptor dicts (same order as input).
    """
    return [parse_section_logic(s) for s in sections]
