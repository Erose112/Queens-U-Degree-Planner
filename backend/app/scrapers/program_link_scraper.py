import json
import time
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup

SITEMAP_URL = "https://www.queensu.ca/academic-calendar/sitemap.xml"
COURSELEAF_BASE = "https://queensu-ca-public.courseleaf.com"
DEPT_PREFIX = "/arts-science/schools-departments-programs/"

RETIRED_MARKER = "No new students will be admitted to the Plan"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; Queens-Scraper/1.0)"})


def fetch_sitemap() -> list[str]:
    """Fetch all arts & science program URLs from the sitemap."""
    response = SESSION.get(SITEMAP_URL, timeout=10)
    response.raise_for_status()

    root = ET.fromstring(response.content)
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

    urls = []
    for loc in root.findall("sm:url/sm:loc", namespace):
        path = loc.text.strip()
        # Keep only program-level paths: exactly 2 slugs after DEPT_PREFIX
        relative = path.split("/academic-calendar")[-1]
        if not relative.startswith(DEPT_PREFIX):
            continue
        remainder = relative[len(DEPT_PREFIX):].strip("/")
        parts = remainder.split("/")
        if len(parts) == 2:  # faculty/program — skip faculty index pages (len 1)
            urls.append(relative)

    print(f"Found {len(urls)} candidate program URLs in sitemap")
    return urls


def is_retired(path: str) -> bool:
    """Return True if the program page says no new students are admitted."""
    url = COURSELEAF_BASE + path
    try:
        response = SESSION.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")
        return RETIRED_MARKER in soup.get_text()
    except Exception as e:
        print(f"  [warn] Could not check {path}: {e}")
        return False


def build_programs_dict(paths: list[str]) -> dict[str, list[str]]:
    """
    Check each program for retirement and build the faculty -> [programs] dict.
    Respects the 10s crawl delay from robots.txt between each request.
    """
    result: dict[str, list[str]] = {}

    for i, path in enumerate(paths, 1):
        parts = path.strip("/").split("/")
        faculty_slug = parts[-2]
        program_slug = parts[-1]

        print(f"[{i}/{len(paths)}] Checking {faculty_slug}/{program_slug}...")

        if is_retired(path):
            print(f"  -> skipped (retired)")
        else:
            result.setdefault(faculty_slug, []).append(program_slug)
            print(f"  -> added")

        if i < len(paths):
            time.sleep(10)  # respect robots.txt crawl delay

    return result


def scrape_program_links():
    paths = fetch_sitemap()
    programs = build_programs_dict(paths)

    output_file = "queens_programs.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(programs, f, indent=4)

scrape_program_links()