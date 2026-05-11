"""
Converts raw section dicts produced by the program scraper into structured
logic descriptors
"""

from __future__ import annotations

LOGIC_REQUIRED       = 0   # All courses in the section are mandatory
LOGIC_CHOOSE_CREDITS = 1   # Choose enough courses to reach `credit_req` credits


def parse_section_logic(section: dict) -> dict:
    """
    Return a logic descriptor for a single section dict.
    """
    raw_credits = section.get("section_credits", 0) or 0

    try:
        _credits = float(str(raw_credits).strip().split()[0])  # handles "6.0 units"
    except (TypeError, ValueError, IndexError):
        _credits = 0.0

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
