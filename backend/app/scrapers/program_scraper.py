import time
import re
import json
from pathlib import Path
import requests
from requests.exceptions import RequestException
from bs4 import BeautifulSoup
import pandas as pd


def extract_course_codes(soup_element):
    """Extract all course codes from a BeautifulSoup element."""
    course_codes = []
    links = soup_element.find_all("a", class_="bubblelink code")
    for link in links:
        course_code = link.get_text(strip=True)
        if course_code:
            course_codes.append(course_code)
    return course_codes



def get_degree_type(program):
    degrees = ["major", "minor", "specialization", "general"]
    program = program.lower()

    for degree in degrees:
        if degree.lower() in program:
            return degree



def format_program_name(slug: str) -> str:
    return slug.replace('-', ' ').title()



def extract_data(url, session, program):
    """
    Extracts academic program data including sections and courses.
    
    Returns a dictionary with:
    - program_name
    - program_type
    - total_credits
    - sections: list of sections, each containing:
        - section_id
        - section_credits
        - courses: list of course codes
    """
    try:
        response = session.get(url, timeout=10)

        if response.status_code == 200:
            print("Request was successful (Status 200 OK)")
        else:
            print(f"Request failed with status code: {response.status_code}")
            return {}

        soup = BeautifulSoup(response.text, 'lxml')

        program_data = {
            "program_name": format_program_name(program),
            "program_type": get_degree_type(program),
            "total_credits": 0,
            "sections": []
        }

        # Get total credits required for 'plan' or 'program'
        for strong_tag in soup.find_all("strong"):
            if "Plan" in strong_tag.text:
                sibling = strong_tag.next_sibling
                if sibling and isinstance(sibling, str):
                    match = re.search(r'\d+', sibling)
                    if match:
                        program_data["total_credits"] = int(match.group())
                        break

        # Find all rows in the table
        all_rows = soup.find_all("tr", class_=lambda x: x and ("even" in x or "odd" in x))

        current_section: dict = {}
        section_counter = 0

        for row in all_rows:
            # Check if this is a section header
            if "areaheader" in row.get("class", []):
                # Save previous section if it exists and has courses
                if current_section and current_section.get("courses"):
                    program_data["sections"].append(current_section)
                    section_counter += 1

                # Get section credits (if specified)
                hours_td = row.find("td", class_="hourscol")
                section_credits = 0
                if hours_td and hours_td.text.strip():
                    try:
                        section_credits = float(hours_td.text.strip())
                    except ValueError:
                        section_credits = 0

                # Start new section
                current_section = {
                    "section_id": section_counter + 1,
                    "section_credits": section_credits,
                    "courses": []
                }

            # Check if this is a course row
            else:
                code_td = row.find("td", class_="codecol")
                if code_td and current_section:
                    # Find ALL course links in this row (including nested ones)
                    all_course_links = code_td.find_all("a", class_="bubblelink code")

                    for code_link in all_course_links:
                        course_code = code_link.get_text(strip=True)

                        # Remove non-breaking spaces and format as BIOL102
                        if course_code:
                            course_code = course_code.replace('\xa0', '').replace(' ', '')
                            if course_code not in current_section["courses"]:  # Avoid duplicates
                                current_section["courses"].append(course_code)

        # Don't forget to add the last section
        if current_section and current_section.get("courses"):
            program_data["sections"].append(current_section)

        return program_data

    except RequestException as e:
        print(f"Error extracting data: {e}")
        return {}



def scrape_program_courses():
    """
    Returns a df containing all program data.
    """
    # Create a session with proper headers
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
    })

    ###
    # All program links are stored in queens_programs.json
    # Test run is in queens_programs_test.json
    base_dir = Path(__file__).parent
    test_programs_path = base_dir / "queens_programs.json"
    with open(test_programs_path, "r", encoding="utf-8") as f:
        url_program_links = json.load(f)

    all_program_courses = []
    # Track any program slugs that yield no useful data so we can
    # remove them from queens_programs_test.json
    invalid_programs_by_faculty: dict[str, list[str]] = {}

    for faculty, programs in url_program_links.items():
        for program in list(programs):
            # Skip PDF files and hash links
            if program.endswith('.pdf') or program.startswith('#'):
                continue

            url = f"https://www.queensu.ca/academic-calendar/arts-science/schools-departments-programs/{faculty}/{program}"

            print(f"\nScraping: {url}")

            program_data = extract_data(url, session, program)

            # If we couldn't extract any useful information (e.g., no sections/courses),
            # do not add this as program data and remove the URL from queens_programs_test.
            if not program_data or not program_data.get("sections"):
                invalid_programs_by_faculty.setdefault(faculty, []).append(program)
            else:
                all_program_courses.append(program_data)

            time.sleep(10)

    # If we found any invalid program URLs, remove them from queens_programs_test.json
    if invalid_programs_by_faculty:
        for faculty, invalid_programs in invalid_programs_by_faculty.items():
            if faculty in url_program_links:
                url_program_links[faculty] = [
                    p for p in url_program_links[faculty] if p not in invalid_programs
                ]
                # Optionally drop faculty keys that no longer have any programs
                if not url_program_links[faculty]:
                    del url_program_links[faculty]

        with open(test_programs_path, "w", encoding="utf-8") as f:
            json.dump(url_program_links, f, indent=4, ensure_ascii=False)

    pd.set_option('display.max_rows', None)
    df = pd.DataFrame(all_program_courses)
    return df
