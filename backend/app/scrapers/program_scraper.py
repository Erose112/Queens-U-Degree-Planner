"""
scraper.py — Queen's University Academic Calendar Program Scraper
=================================================================

Scrapes degree program requirements from queensu-ca-public.courseleaf.com,
producing a structured dict per program that captures:

  - Top-level required sections  (no subplan)
  - Subplans (A / B / C …)       each with their own sections
  - Wildcard requirements         e.g. "ECON at the 300-level or above"
  - Specific course codes         scraped from bubblelink anchors

Output shape per program
------------------------
{
    "program_name":  str,
    "program_type":  str,          # major | minor | specialization | general
    "total_credits": int,
    "program_code":  str,          # e.g. "ECON" (empty string if undetectable)
    "has_subplans":  bool,
    "sections": [                  # top-level sections (empty when has_subplans=True)
        {
            "section_id":      int,
            "section_credits": float,  # 0.0 → all required; >0 → choose up to
            "courses":         list[str],
            "wildcard":        str | None,
        },
        ...
    ],
    "subplans": [
        {
            "subplan_name": str,
            "subplan_code": str,   # e.g. "ECPP-O"  (empty string if undetectable)
            "sections": [ ... ],   # same shape as top-level sections
        },
        ...
    ],
}
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from requests.exceptions import RequestException



_SUBPLAN_HEADING_RE = re.compile(
    r"^(?:[A-Z]|[ivxIVX]+)\.\s+(.+?)\s+\([A-Z0-9]+-[A-Z0-9]+\)\s+\(\d+(?:\.\d+)?\s+[Uu]nits?\)$",
    re.IGNORECASE
)

_SUBPLAN_HEADING_NAMED_RE = re.compile(
    r"(?:concentration|stream|focus|pathway|option|sub-?plan|track)",
    re.IGNORECASE
)

# Captures the plan code inside the first parenthetical, e.g. "ECPP-O"
_SUBPLAN_CODE_RE = re.compile(r"\(([A-Z0-9]+)-[A-Z0-9]+\)")

_PLAN_CODE_RE = re.compile(r'\b([A-Z]{2,6})\b')

# Regex to pull total credits from text like "Plan: 42.00 units"
_CREDITS_RE = re.compile(r"(\d+(?:\.\d+)?)")

_SUBPLAN_CREDITS_RE = re.compile(r'\((\d+(?:\.\d+)?)\s+[Uu]nits?\)')

_DEGREE_KEYWORDS = ["major", "minor", "specialization", "general"]

_JUNK_WILDCARD_RE = re.compile(
    r'^[\s–\-—]+[A-Z\s]+[\s–\-—]+$'  # matches "– COMPUTING –" style decorators
)

JUNK_WILDCARDS = {"or", "and", "and/or", "-", "–", ""}

_SESSION_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Referer": (
        "https://queensu-ca-public.courseleaf.com/"
        "arts-science/schools-departments-programs/"
    ),
}



def get_degree_type(slug: str) -> str:
    slug_lower = slug.lower()
    for kw in _DEGREE_KEYWORDS:
        if kw in slug_lower:
            return kw
    return "unknown"


def format_program_name(slug: str) -> str:
    return slug.replace("-", " ").title()


def _make_empty_section(section_id: int, s_credits: float) -> dict[str, Any]:
    return {
        "section_id":      section_id,
        "section_credits": s_credits,
        "courses":         [],
        "wildcard":        None,
    }


def _is_subplan_heading(text: str, tag_level: str) -> bool:
    t = text.strip()
    if _SUBPLAN_HEADING_RE.match(t):
        return True
    if tag_level == "h3" and _SUBPLAN_HEADING_NAMED_RE.search(t):
        if re.search(r'\d+(?:\.\d+)?\s+[Uu]nits?', t):
            return True
    return False

def _parse_subplan_name(text: str) -> str:
    """Extract 'Economics' from 'A. Economics (ECPP-O) (84.00 Units)'."""
    match = _SUBPLAN_HEADING_RE.match(text.strip())
    return match.group(1) if match else text.strip()

def _parse_subplan_code(text: str) -> str:
    """Extract 'ECPP-O' from 'A. Economics (ECPP-O) (84.00 Units)'."""
    match = _SUBPLAN_CODE_RE.search(text)
    return match.group(1) if match else ""


def _parse_subplan_credits(text: str) -> int:
    """Extract 84 from 'A. Economics (ECPP-O) (84.00 Units)'."""
    matches = _SUBPLAN_CREDITS_RE.findall(text)
    # Take the LAST match — the credits count is always the final parenthetical
    return int(float(matches[-1])) if matches else 0


def _parse_section_credits(row: Tag) -> float:
    hours_td = row.find("td", class_="hourscol")
    if hours_td and isinstance(hours_td, Tag):
        raw = hours_td.get_text(strip=True)
        if raw:
            try:
                return float(raw.split()[0])
            except (ValueError, IndexError):
                pass
    return 0.0


def _parse_section_name(row: Tag) -> str:
    """
    Pull the human-readable name from an areaheader row.
    Falls back to an empty string so the caller can supply a default.
    """
    for td in row.find_all("td"):
        if isinstance(td, Tag) and "hourscol" not in td.get("class", []):
            text = td.get_text(separator=" ", strip=True)
            if text:
                return text[:200]
    return ""


def _scrape_courses_from_row(row: Tag) -> list[str]:
    """Return all course codes found in a course row's codecol."""
    code_td = row.find("td", class_="codecol")
    if not isinstance(code_td, Tag):
        return []

    codes: list[str] = []
    for link in code_td.find_all("a", class_="bubblelink code"):
        raw = link.get_text(strip=True).replace("\xa0", "").replace(" ", "")
        if raw:
            codes.append(raw)
    return codes


def _scrape_wildcard_from_row(row: Tag) -> str | None:
    # Check codecol first, then fall back to any non-hourscol td
    for td in row.find_all("td"):
        if not isinstance(td, Tag):
            continue
        td_classes = td.get("class", [])
        if "hourscol" in td_classes:
            continue
        if td.find("a", class_="bubblelink code"):
            return None  # Has real courses, not a wildcard
        text = td.get_text(separator=" ", strip=True)
        if text and not _is_junk_wildcard(text):
            return text
    return None



def _is_junk_wildcard(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    if t.lower() in JUNK_WILDCARDS:
        return True
    if _JUNK_WILDCARD_RE.match(t):
        return True
    return False


def _renumber_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for i, section in enumerate(sections, start=1):
        section["section_id"] = i
    return sections


def _deduplicate_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Remove sections whose course list is an exact duplicate of a previously
    seen section.  Sections with no courses but a wildcard are kept as-is.
    """
    seen: set[frozenset[str]] = set()
    unique: list[dict[str, Any]] = []

    for section in sections:
        key = frozenset(section["courses"])
        if key and key in seen:
            continue
        seen.add(key)
        unique.append(section)

    return unique



def _deduplicate_subplans(subplans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove subplans with duplicate codes or names."""
    seen_codes: set[str] = set()
    seen_names: set[str] = set()
    unique: list[dict[str, Any]] = []

    for sp in subplans:
        code = sp.get("subplan_code", "")
        name = sp.get("subplan_name", "")
        # Use code as primary key, fall back to name if code is empty
        key = code if code else name
        if key and key in seen_codes:
            continue
        seen_codes.add(key)
        seen_names.add(name)
        unique.append(sp)

    return unique



def _flush_section(
    current_section: dict[str, Any] | None,
    target_sections: list[dict[str, Any]],
) -> None:
    """Append current_section to target_sections if it has any content."""
    if current_section is None:
        return
    if current_section["courses"] or current_section["wildcard"]:
        target_sections.append(current_section)


def extract_data(
    url: str,
    session: requests.Session,
    program: str,
    retries: int = 3,
    retry_delay: int = 15,
) -> dict[str, Any]:
    """
    Fetch one program page and return a fully structured program dict.
    Returns an empty dict on failure.
    """
    # Fetch with retry 
    response = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=10)
            print(f"[{url}] Status: {response.status_code} (attempt {attempt})")
            if response.status_code == 200:
                break
            print(f"  Non-200 response. Retrying in {retry_delay}s…")
            time.sleep(retry_delay)
        except RequestException as exc:
            print(f"  Request error on attempt {attempt}: {exc}")
            if attempt < retries:
                time.sleep(retry_delay)
    else:
        print(f"  Failed after {retries} attempts: {url}")
        return {}

    if response is None or response.status_code != 200:
        return {}

    # Parse 
    try:
        soup = BeautifulSoup(response.text, "lxml")
    except Exception as exc:
        print(f"  BeautifulSoup error: {exc}")
        return {}

    program_data: dict[str, Any] = {
        "program_name":  format_program_name(program),
        "program_type":  get_degree_type(program),
        "total_credits": 0,
        "program_code":   "",
        "has_subplans":  False,
        "sections":      [],
        "subplans":      [],
    }

    # Total credits 
    for strong in soup.find_all("strong"):
        if isinstance(strong, Tag) and "Plan" in strong.get_text():
            sibling = strong.next_sibling
            if isinstance(sibling, NavigableString):
                m = _CREDITS_RE.search(str(sibling))
                if m:
                    program_data["total_credits"] = int(float(m.group(1)))
                    break
     
    # Plan Code
    for strong in soup.find_all("strong"):
        if isinstance(strong, Tag) and "Plan Code" in strong.get_text():
            # The plan code may be in the sibling text or in the next <td>/<p>
            sibling = strong.next_sibling
            raw = str(sibling).strip() if isinstance(sibling, NavigableString) else ""
            if not raw:
                # Fallback: check the parent element's full text
                parent = strong.parent
                raw = parent.get_text(separator=" ", strip=True) if parent else ""
            m = _PLAN_CODE_RE.search(raw)
            if m:
                program_data["program_code"] = m.group(1)
            break

    # Find content root 
    content_root: Tag | None = (
        soup.find("div", id="contentarea")          # type: ignore[assignment]
        or soup.find("div", id="content")           # type: ignore[assignment]
        or soup.find("main")                        # type: ignore[assignment]
        or soup.body                                # type: ignore[assignment]
    )
    if content_root is None:
        print("  Could not locate content root.")
        return {}

    # Walk the DOM
    current_subplan:  dict[str, Any] | None = None
    current_section:  dict[str, Any] | None = None
    section_counter = 0
    expecting_subplan_list = False
    section_counter = 0

    def active_sections() -> list[dict[str, Any]]:
        """Return the section list we are currently writing into."""
        if current_subplan is not None:
            return current_subplan["sections"]  # type: ignore[return-value]
        return program_data["sections"]         # type: ignore[return-value]

    for element in content_root.descendants:
        if not isinstance(element, Tag):
            continue

        tag = element.name

        # Subplan boundary: <h2> / <h3>
        if tag in ("h2", "h3"):
            heading_text = element.get_text(separator=" ", strip=True)

            if not _is_subplan_heading(heading_text, tag):
                continue

            # Flush whatever section was open
            _flush_section(current_section, active_sections())
            current_section = None

            program_data["has_subplans"] = True
            current_subplan = {
                "subplan_name": _parse_subplan_name(heading_text),
                "subplan_code": _parse_subplan_code(heading_text),
                "subplan_credits": _parse_subplan_credits(heading_text),
                "sections":     [],
            }
            program_data["subplans"].append(current_subplan)
            continue

        # Table rows
        if tag != "tr":
            continue

        row_classes: list[str] = element.get("class", [])  # type: ignore[assignment]

        # Skip the "remaining electives" footer row
        if "areaheader" in row_classes and "lastrow" in row_classes:
            continue

        # Section header row
        if "areaheader" in row_classes:
            _flush_section(current_section, active_sections())
            current_section = None

            # Switch to next waiting subplan when current one already has sections
            if program_data["has_subplans"]:
                for sp in program_data["subplans"]:
                    if not sp["sections"] and sp is not current_subplan:
                        if current_subplan is None or current_subplan["sections"]:
                            current_subplan = sp
                            break

            section_counter += 1
            raw_name = _parse_section_name(element)
            s_credits   = _parse_section_credits(element)

            if "sub-plan" in raw_name.lower() or "sub plan" in raw_name.lower():
                expecting_subplan_list = True
                continue

            current_section = _make_empty_section(
                section_id=section_counter,
                s_credits=s_credits,
            )
            continue

        # Course / content row
        if "even" not in row_classes and "odd" not in row_classes:
            continue

        if current_section is None and not expecting_subplan_list:
            continue

        if expecting_subplan_list:
            wildcard = _scrape_wildcard_from_row(element)
            if wildcard and _SUBPLAN_HEADING_RE.match(wildcard):
                code_match = _SUBPLAN_CODE_RE.search(wildcard)
                subplan_code = code_match.group(1) if code_match else ""
                subplan_name = _parse_subplan_name(wildcard)
                subplan_credits = _parse_subplan_credits(wildcard)

                # ── Check if already registered before appending ──
                existing = next(
                    (sp for sp in program_data["subplans"]
                    if sp["subplan_code"] == subplan_code
                    or sp["subplan_name"] == subplan_name),
                    None
                )
                if existing:
                    current_subplan = existing
                else:
                    new_subplan = {
                        "subplan_name": subplan_name,
                        "subplan_code": subplan_code,
                        "subplan_credits": subplan_credits,
                        "sections":     [],
                    }
                    program_data["subplans"].append(new_subplan)
                    program_data["has_subplans"] = True
                    current_subplan = new_subplan
                continue

        if current_section is None:
            continue

        courses = _scrape_courses_from_row(element)
        if courses:
            seen_in_section: set[str] = set(current_section["courses"])  # type: ignore
            for code in courses:
                if code not in seen_in_section:
                    current_section["courses"].append(code)
                    seen_in_section.add(code)
        else:
            wildcard = _scrape_wildcard_from_row(element)
            if wildcard and current_section["wildcard"] is None:
                current_section["wildcard"] = wildcard

            # Flush the final open section
            _flush_section(current_section, active_sections())

    # Post-process: deduplicate
    program_data["subplans"] = _deduplicate_subplans(program_data["subplans"])
    program_data["sections"] = _renumber_sections(
        _deduplicate_sections(program_data["sections"])
    )
    for subplan in program_data["subplans"]:
        subplan["sections"] = _renumber_sections(
            _deduplicate_sections(subplan["sections"])
        )


    # Validate: must have something to return 
    has_top_sections  = bool(program_data["sections"])
    has_subplan_data  = any(
        bool(sp.get("sections")) for sp in program_data["subplans"]
    )
    if not has_top_sections and not has_subplan_data:
        print(f"  No usable sections found for: {url}")
        return {}

    return program_data



def _build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(_SESSION_HEADERS)

    warmup_url = (
        "https://queensu-ca-public.courseleaf.com/"
        "arts-science/schools-departments-programs/"
    )
    print("Warming up session…")
    try:
        session.get(warmup_url, timeout=10)
        time.sleep(2)
    except RequestException as exc:
        print(f"  Warm-up failed (non-fatal): {exc}")

    return session



def scrape_program_courses() -> pd.DataFrame:
    """
    Scrape all programs listed in queens_programs_test.json and return a
    DataFrame where each row is one program.

    The 'sections' and 'subplans' columns contain Python lists/dicts.
    """
    session = _build_session()

    base_dir = Path(__file__).parent
    programs_path = base_dir / "queens_programs_test.json"

    with open(programs_path, encoding="utf-8") as fh:
        url_program_links: dict[str, list[str]] = json.load(fh)

    # Flatten to (faculty, program) pairs, skip PDFs and anchors
    program_pairs: list[tuple[str, str]] = [
        (faculty, program)
        for faculty, programs in url_program_links.items()
        for program in programs
        if not program.endswith(".pdf") and not program.startswith("#")
    ]

    all_program_data: list[dict[str, Any]] = []
    invalid_by_faculty: dict[str, list[str]] = {}

    base_url = (
        "https://queensu-ca-public.courseleaf.com/"
        "arts-science/schools-departments-programs"
    )

    for i, (faculty, program) in enumerate(program_pairs):
        if i > 0:
            time.sleep(10.2)

        url = f"{base_url}/{faculty}/{program}/"
        print(f"\nScraping [{i + 1}/{len(program_pairs)}]: {url}")

        data = extract_data(url, session, program)

        if not data:
            invalid_by_faculty.setdefault(faculty, []).append(program)
        else:
            all_program_data.append(data)

    # Remove invalid entries from the JSON so they are not retried 
    if invalid_by_faculty:
        for faculty, invalid in invalid_by_faculty.items():
            if faculty in url_program_links:
                url_program_links[faculty] = [
                    p for p in url_program_links[faculty]
                    if p not in invalid
                ]
                if not url_program_links[faculty]:
                    del url_program_links[faculty]

        with open(programs_path, "w", encoding="utf-8") as fh:
            json.dump(url_program_links, fh, indent=4, ensure_ascii=False)

        print(f"\nRemoved {sum(len(v) for v in invalid_by_faculty.values())} "
              f"invalid program(s) from {programs_path.name}")

    print(f"\nDone — {len(all_program_data)} program(s) scraped successfully.")

    pd.set_option("display.max_rows", None)
    df = pd.DataFrame(all_program_data)
    df.to_csv("program_courses_test.csv", index=False)
    return df
