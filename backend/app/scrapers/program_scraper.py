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
    "num_subplans_required": int,
    "sections": [                  # top-level sections (empty when num_subplans_required = 0)
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
            "subplan_name":    str,
            "subplan_code":    str,   # e.g. "ECPP-O"  (empty string if undetectable)
            "subplan_credits": int,
            "sections": [ ... ],      # same shape as top-level sections
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
    r"^(?:[A-Z]|[ivxIVX]+)\.\s+(.+?)\s+\([A-Z0-9]+-[A-Z0-9]+\)\s+\(\d+(?:\.\d+)?(?:\s+[Uu]nits?)?\)$",
    re.IGNORECASE
)

_SUBPLAN_HEADING_NAMED_RE = re.compile(
    r"(?:concentration|stream|focus|pathway|option|sub-?plan|track)",
    re.IGNORECASE
)

_OPTION_LIST_HEADING_RE = re.compile(
    r"^(?:[ivxlcdmIVXLCDM]+|[A-Z])\.\s+\S+",
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

_BASE_URL = (
    "https://queensu-ca-public.courseleaf.com/"
    "arts-science/schools-departments-programs"
)

# To be stored in db for user use
_STORED_URL = (
    "https://www.queensu.ca/academic-calendar/arts-science/schools-departments-programs"
)


def get_degree_type(slug: str) -> str:
    slug_lower = slug.lower()
    for kw in _DEGREE_KEYWORDS:
        if kw in slug_lower:
            return kw
    return "unknown"



def _make_empty_section(section_id: int, s_credits: float) -> dict[str, Any]:
    return {
        "section_id":      section_id,
        "section_credits": s_credits,
        "courses":         [],
        "wildcard":        None,
    }


def _is_simple_option_item(text: str) -> bool:
    """Check if text matches simple option list format like 'i. Linguistics' or 'A. Computing and Art'."""
    # Match: letter/roman numeral + period + name (no parentheses)
    match = re.match(r"^(?:[A-Z]|[ivxIVX]+)\.\s+(.+)$", text.strip())
    return bool(match)


def _parse_simple_option_name(text: str) -> str:
    """Extract name from simple format like 'i. Linguistics' → 'Linguistics'."""
    match = re.match(r"^(?:[A-Z]|[ivxIVX]+)\.\s+(.+)$", text.strip())
    return match.group(1) if match else text.strip()


def _is_subplan_heading(text: str, tag_level: str) -> bool:
    t = text.strip()
    if _SUBPLAN_HEADING_RE.match(t):
        return True
    if tag_level == "h3" and _SUBPLAN_HEADING_NAMED_RE.search(t):
        if re.search(r'\d+(?:\.\d+)?\s+[Uu]nits?', t):
            return True
    if _OPTION_LIST_HEADING_RE.match(t):
        return True
    return False

def _parse_subplan_name(text: str) -> str:
    match = _SUBPLAN_HEADING_RE.match(text.strip())
    if match:
        return match.group(1)
    simple = re.match(r"^(?:[ivxlcdmIVXLCDM]+|[A-Z])\.\s+(.+)$", text.strip(), re.IGNORECASE)
    if simple:
        return simple.group(1).strip()
    return text.strip()

def _parse_subplan_code(text: str) -> str:
    """Extract 'ECPP-O' from 'A. Economics (ECPP-O) (84.00 Units)'."""
    match = _SUBPLAN_CODE_RE.search(text)
    return match.group(1) if match else ""


def _parse_subplan_credits(text: str) -> int:
    """Extract 84 from 'A. Economics (ECPP-O) (84.00 Units)'."""
    matches = _SUBPLAN_CREDITS_RE.findall(text)
    # Take the LAST match — the credits count is always the final parenthetical
    return int(float(matches[-1])) if matches else 0


def _extract_num_subplans_from_span(text: str) -> int | None:
    """Extract number from span text like 'Complete one of the following Sub-Plans'."""
    nums = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
    text_lower = text.lower()
    for word in nums:
        if word in text_lower:
            return nums.index(word) + 1

    return 1


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
    Remove exact-duplicate sections.

    - Course sections:   keyed by frozenset of course codes.
    - Wildcard sections: keyed by (wildcard_text, section_credits) so that
                         the same list name at different credit levels is kept.
    """
    seen_course_keys:   set[frozenset[str]]    = set()
    seen_wildcard_keys: set[tuple[str, float]] = set()
    unique: list[dict[str, Any]] = []

    for section in sections:
        courses  = section["courses"]
        wildcard = section["wildcard"]

        if courses:
            key = frozenset(courses)
            if key in seen_course_keys:
                continue
            seen_course_keys.add(key)
        elif wildcard:
            key = (wildcard, section["section_credits"])  # type: ignore[assignment]
            if key in seen_wildcard_keys:
                continue
            seen_wildcard_keys.add(key)  # type: ignore[arg-type]
        else:
            continue  # skip fully empty sections

        unique.append(section)

    return unique


def _deduplicate_subplans(subplans: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Remove subplans with duplicate codes or names, preferring the one that
    has sections (i.e. real scraped content) over an empty stub.
    """
    # Build a map: canonical-key → best subplan seen so far
    best: dict[str, dict[str, Any]] = {}

    for sp in subplans:
        code = sp.get("subplan_code", "")
        name = sp.get("subplan_name", "")
        key  = code if code else name
        if not key:
            continue

        existing = best.get(key)
        if existing is None:
            best[key] = sp
        else:
            # Prefer the entry that actually has sections
            if sp["sections"] and not existing["sections"]:
                best[key] = sp

    # Preserve original order (first-seen key wins for ordering)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for sp in subplans:
        code = sp.get("subplan_code", "")
        name = sp.get("subplan_name", "")
        key  = code if code else name
        if key and key not in seen:
            seen.add(key)
            unique.append(best[key])

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


def _find_existing_subplan(
    subplans: list[dict[str, Any]],
    code: str,
    name: str,
) -> dict[str, Any] | None:
    """Return the first subplan dict whose code or name matches."""
    for sp in subplans:
        if code and sp.get("subplan_code") == code:
            return sp
        if name and sp.get("subplan_name") == name:
            return sp
    return None


def extract_data(
    url: str,
    stored_url: str,
    session: requests.Session,
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

    program_name_tag = soup.find("h1", class_="page-title")
    if program_name_tag is None:
        print("Could not find program name header.")
        return {}

    program_name = program_name_tag.get_text(strip=True)

    program_data: dict[str, Any] = {
        "program_code":  "",
        "program_name":  program_name,
        "program_type":  get_degree_type(program_name),
        "program_link":  stored_url,
        "total_credits": 0,
        "num_subplans_required": 0,
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
            sibling = strong.next_sibling
            raw = str(sibling).strip() if isinstance(sibling, NavigableString) else ""
            if not raw:
                parent = strong.parent
                raw = parent.get_text(separator=" ", strip=True) if parent else ""
            m = _PLAN_CODE_RE.search(raw)
            if m:
                program_data["program_code"] = m.group(1)
            break

    # Extract num_subplans_required from span header
    for span in soup.find_all("span", class_="courselistcomment areaheader"):
        span_text = span.get_text(separator=" ", strip=True)
        keywords = ("sub-plan", "sub plan", "option list", "option lists")
        if any(kw in span_text.lower() for kw in keywords):
            num = _extract_num_subplans_from_span(span_text)
            if num is not None:
                program_data["num_subplans_required"] = num
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
    current_subplan:       dict[str, Any] | None = None
    current_section:       dict[str, Any] | None = None
    section_counter:       int = 0
    expecting_subplan_list: bool = False

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
                # A non-subplan heading after subplans (e.g. "4. Additional Requirements",
                # course list headers like "LISC_List_C") means we've left the subplan
                # section of the page.  Stop writing into any subplan.
                if program_data["num_subplans_required"] > 0 and current_subplan is not None:
                    _flush_section(current_section, active_sections())
                    break
                continue

            # Flush whatever section was open before this heading
            _flush_section(current_section, active_sections())
            current_section = None
            expecting_subplan_list = False  # always clear on subplan boundary

            parsed_code = _parse_subplan_code(heading_text)
            parsed_name = _parse_subplan_name(heading_text)
            existing = _find_existing_subplan(
                program_data["subplans"], parsed_code, parsed_name
            )
            if existing is not None:
                current_subplan = existing
            else:
                current_subplan = {
                    "subplan_name":    parsed_name,
                    "subplan_code":    parsed_code,
                    "subplan_credits": _parse_subplan_credits(heading_text),
                    "sections":        [],
                }
                program_data["subplans"].append(current_subplan)

            continue

        # Table rows only beyond this point
        if tag != "tr":
            continue

        row_classes: list[str] = element.get("class", [])  # type: ignore[assignment]

        # Skip the "remaining electives" footer row
        if "areaheader" in row_classes and "lastrow" in row_classes:
            continue

        #  Section header row
        if "areaheader" in row_classes:
            # Always flush the section that was open before this header
            _flush_section(current_section, active_sections())
            current_section = None

            # When we've finished reading the sub-plan listing block,
            # the next areaheader signals we are back at plan level.
            # Reset current_subplan so that Supporting sections (and any
            # other plan-level sections after the listing) land in
            # program_data["sections"], not inside a subplan.
            if expecting_subplan_list:
                expecting_subplan_list = False
                current_subplan = None

            section_counter += 1
            raw_name  = _parse_section_name(element)
            s_credits = _parse_section_credits(element)

            if "sub-plan" in raw_name.lower() or "sub plan" in raw_name.lower() or "option lists" in raw_name.lower() or "option list" in raw_name.lower():
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

        # Sub-plan listing rows
        if expecting_subplan_list:
            wildcard = _scrape_wildcard_from_row(element)
            if wildcard and _SUBPLAN_HEADING_RE.match(wildcard):
                code_match   = _SUBPLAN_CODE_RE.search(wildcard)
                subplan_code = code_match.group(1) if code_match else ""
                subplan_name = _parse_subplan_name(wildcard)

                # Register stub only if not already known
                if not _find_existing_subplan(
                    program_data["subplans"], subplan_code, subplan_name
                ):
                    program_data["subplans"].append({
                        "subplan_name":    subplan_name,
                        "subplan_code":    subplan_code,
                        "subplan_credits": _parse_subplan_credits(wildcard),
                        "sections":        [],
                    })
            # Check for simple option list format: "i. Linguistics" (no code or credits)
            elif wildcard and _is_simple_option_item(wildcard):
                subplan_name = _parse_simple_option_name(wildcard)

                # Register stub only if not already known
                if not _find_existing_subplan(
                    program_data["subplans"], "", subplan_name
                ):
                    program_data["subplans"].append({
                        "subplan_name":    subplan_name,
                        "subplan_code":    "",
                        "subplan_credits": 0,
                        "sections":        [],
                    })

            continue  # always skip listing rows for course processing

        # Nothing to write into if there is no open section
        if current_section is None:
            continue

        # Courses
        courses = _scrape_courses_from_row(element)
        if courses:
            seen_in_section: set[str] = set(current_section["courses"])  # type: ignore
            for code in courses:
                if code not in seen_in_section:
                    current_section["courses"].append(code)
                    seen_in_section.add(code)
        else:
            wildcard = _scrape_wildcard_from_row(element)
            if wildcard:
                if current_section["wildcard"] is None:
                    current_section["wildcard"] = wildcard
                else:
                    # Append additional wildcard rows to existing
                    current_section["wildcard"] += f" | {wildcard}"


    # Final flush: close whatever section was still open after the last row
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

    # Fallback: if subplans exist but num_subplans_required was not set from span, default to 1
    if program_data["num_subplans_required"] == 0 and program_data["subplans"]:
        program_data["num_subplans_required"] = 1

    # Validate: must have something to return
    has_top_sections = bool(program_data["sections"])
    has_subplan_data = any(
        bool(sp.get("sections")) for sp in program_data["subplans"]
    )
    if not has_top_sections and not has_subplan_data:
        print(f"  No usable sections found for: {url}")
        return {}

    return program_data



def _build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(_SESSION_HEADERS)

    print("Warming up session…")
    try:
        session.get(_BASE_URL, timeout=10)
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

    for i, (faculty, program) in enumerate(program_pairs):
        if i > 0:
            time.sleep(10.2)

        url = f"{_BASE_URL}/{faculty}/{program}/"
        stored_url = f"{_STORED_URL}/{faculty}/{program}/"
        print(f"\nScraping [{i + 1}/{len(program_pairs)}]: {url}")

        data = extract_data(url, stored_url, session)

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
    return df

if __name__ == "__main__":
    df = scrape_program_courses()
    df.to_csv("program_courses.csv", index=False)
