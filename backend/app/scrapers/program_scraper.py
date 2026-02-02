import time
import json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
from requests.exceptions import RequestException
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



def extract_data(url, session):
    try:
        response = session.get(url, timeout=10)

        if response.status_code == 200:
            print("Request was successful (Status 200 OK)")
        else:
            print(f"Request failed with status code: {response.status_code}")
            return []

        soup = BeautifulSoup(response.text, 'lxml')
        all_courses = []

        # Extract from course cells
        course_cells = soup.find_all("td", class_="codecol")
        for cell in course_cells:
            course_codes = extract_course_codes(cell)
            for code in course_codes:
                # Split "ARTH 116" into department and number
                parts = code.split()
                if len(parts) == 2:
                    data = {
                        "faculty_abbr": parts[0],    # e.g., "ARTH"
                        "course_number": parts[1]     # e.g., "116"
                    }
                    all_courses.append(data)

        # Extract from block indents
        block_indents = soup.find_all("div", class_="blockindent")
        for block in block_indents:
            course_codes = extract_course_codes(block)
            for code in course_codes:
                parts = code.split()
                if len(parts) == 2:
                    data = {
                        "faculty_abbr": parts[0],
                        "course_number": parts[1]
                    }
                    all_courses.append(data)

        # Remove duplicates
        seen = set()
        unique_courses = []
        for course in all_courses:
            key = (course["faculty_abbr"], course["course_number"])
            if key not in seen:
                seen.add(key)
                unique_courses.append(course)

    except RequestException as e:
        print(f"Error extracting data from {url}: {e}")

    return unique_courses



def scrape_program_courses():
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

    base_dir = Path(__file__).parent
    with open(base_dir / "queens_programs.json", "r", encoding="utf-8") as f:
        url_program_links = json.load(f)

    all_program_courses = []

    for faculty, programs in url_program_links.items():
        for program in programs:
            # Skip PDF files and hash links
            if program.endswith('.pdf') or program.startswith('#'):
                continue

            url = f"https://www.queensu.ca/academic-calendar/arts-science/schools-departments-programs/{faculty}/{program}"
            print(f"\nScraping: {url}")

            courses = extract_data(url, session)

            if courses:
                for course in courses:
                    course['program'] = program
                    all_program_courses.append(course)

                time.sleep(10)

    df = pd.DataFrame(all_program_courses)
    print(df)
    return df



if __name__ == "__main__":
    scrape_program_courses()
