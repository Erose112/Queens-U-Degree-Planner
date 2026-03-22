"""
Converts raw section dicts produced by the program scraper into structured
logic descriptors

Logic Types
-----------
  LOGIC_REQUIRED     (1) Every course in the section is mandatory.
                           section_credits == 0 in the scraper output signals
                           this: the student must complete *all* listed courses.

  LOGIC_CHOOSE_CREDITS (2) The student must accumulate exactly `credit_req`
                           credits from the courses listed in the section.
                           section_credits > 0 in the scraper output signals this.


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
        "credit_req":  int,   # credit requirement (0 when type == REQUIRED)
    }
"""

from __future__ import annotations

LOGIC_REQUIRED       = 1   # All courses in the section are mandatory
LOGIC_CHOOSE_CREDITS = 2   # Choose enough courses to reach `credit_req` credits


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
    dict with keys ``logic_type`` (int) and ``credit_req`` (int).
    """
    raw_credits = section.get("section_credits", 0) or 0

    try:
        _credits = float(str(raw_credits).strip().split()[0])  # handles "6.0 units"
    except (TypeError, ValueError, IndexError):
        _credits = 0.0
        print(f"[section_parser] Warning: could not parse section_credits "
            f"value '{raw_credits}', defaulting to REQUIRED logic.")

    if _credits > 0:
        return {
            "logic_type":  LOGIC_CHOOSE_CREDITS,
            "credit_req":  int(_credits),
        }

    # Default: all courses in this section are required
    return {
        "logic_type":  LOGIC_REQUIRED,
        "credit_req":  0,
    }



def parse_all_sections(sections: list[dict]) -> list[dict]:
    """
    Convenience wrapper: parse logic for every section in a program.

    Returns a parallel list of logic descriptor dicts (same order as input).
    """
    return [parse_section_logic(s) for s in sections]
