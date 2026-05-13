import time
import requests
import re
from bs4 import BeautifulSoup
import pandas as pd
from requests.exceptions import RequestException

BASE_XML = "https://queensu-ca-public.courseleaf.com/arts-science/course-descriptions"

DEPARTMENTS = [
    "anat",'anim','ansh','arab','arth','arin','ascx','astr',
    'bisc','bchm','biol','blck','canc','crss','chem','chin',
    'clst','cogs','cisc','coca','comp','cwri','disc',
    'dram','ddht','econ','empr','engl','enin','ensc','film',
    'artf','fren','frst','gnds','gphy','geol','grmn','devs',
    'grek','hlth','hebr','hist','indg','idis','ints','inuk',
    'itln','japn','jwst','knpe','lang','llcu','latn','libs',
    'lisc','ling','math','mapp','micr','mohk','musc','muth',
    'nsci','path','phar','phil','phys','phgy','pols','ppec',
    'port','intn','psyc','qgsp','rels','repd','socy','span',
    'stat','stam','artv','well','writ'
]

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

def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(_SESSION_HEADERS)

    print("Warming up session…")
    try:
        session.get(BASE_XML, timeout=10)
        time.sleep(2)
    except RequestException as exc:
        print(f"  Warm-up failed (non-fatal): {exc}")

    return session






def fetch_xml(dept: str, session: requests.Session) -> str:
    url = f"{BASE_XML}/{dept}/index.xml"

    try:
        res = session.get(url, timeout=10)
        res.raise_for_status()
        res.encoding = "utf-8"
        return res.text
    except RequestException as e:
        print(f"[ERROR] Failed {dept}: {e}")
        return None


def extract_html(xml_text: str) -> BeautifulSoup:
    soup = BeautifulSoup(xml_text, "lxml-xml")
    cdata = soup.find("text")

    if not cdata or not cdata.string:
        return None

    return BeautifulSoup(cdata.string, "lxml")



def clean_text(el):
    return el.text.strip() if el else None


def parse_course_block(block):
    try:
        code = clean_text(block.select_one(".detail-code"))
        title = clean_text(block.select_one(".detail-title"))

        credits_raw = clean_text(block.select_one(".detail-hours_html"))
        credits_match = re.search(r"[\d.]+", credits_raw)
        credits = float(credits_match.group()) if credits_match else None

        desc = clean_text(block.select_one(".courseblockextra"))
        clo = clean_text(block.select_one(".detail-cim_los"))

        return {
            "course_code": code,
            "title": title,
            "credits": credits,
            "course_desc": desc,
            "clo": clo,
        }

    except Exception as e:
        print(f"[WARN] Failed parsing block: {e}")
        return None



def extract_course_logic(text):
    course_pattern = r"[A-Z]{3,4}\s\d{3}"
    # Also match STAT_Options-style placeholder tokens (e.g. STAT_Options, MATH_Options)
    option_pattern = r"[A-Z]{3,4}_[A-Za-z_]+"
    token_pattern = f"({course_pattern}|{option_pattern}|\\(|\\))"

    tokens = re.split(token_pattern, text)

    cleaned = []

    for token in tokens:
        if not token:
            continue
        token = token.strip()

        if re.fullmatch(course_pattern, token) or re.fullmatch(option_pattern, token):
            # Both real course codes AND STAT_Options-style tokens treated the same
            if cleaned and cleaned[-1] not in {"and", "or", "("}:
                cleaned.append("and")
            cleaned.append(token)
        elif token == "(":
            cleaned.append(token)
        elif token == ")":
            if cleaned and cleaned[-1] == "(":
                cleaned.pop()  # remove empty parens
            else:
                # Strip any dangling operator immediately before the closing paren
                while cleaned and cleaned[-1] in {"and", "or"}:
                    cleaned.pop()
                # If that empties back to just an open paren, remove it too
                if cleaned and cleaned[-1] == "(":
                    cleaned.pop()
                else:
                    cleaned.append(token)
        else:
            if re.search(r'\bor\b', token, re.IGNORECASE):
                if cleaned and cleaned[-1] not in {"and", "or", "("}:
                    cleaned.append("or")
            elif re.search(r'\band\b', token, re.IGNORECASE):
                if cleaned and cleaned[-1] not in {"and", "or", "("}:
                    cleaned.append("and")

    result = " ".join(cleaned).strip()
    result = re.sub(r'\(\s*\)', '', result).strip()
    result = re.sub(r'\s+', ' ', result).strip()
    result = re.sub(r'^(and|or)\s+', '', result, flags=re.IGNORECASE)
    result = re.sub(r'\s+(and|or)$', '', result, flags=re.IGNORECASE)
    return result



def parse_requirements(requirement_line):
    """
    Parse a requirement line into just it's prerequisites.
    """
    result = {
        'prerequisites': '',
    }

    text = re.sub(r'^\s*Requirements?\s*:\s*', '', requirement_line, flags=re.IGNORECASE).strip()
    text = text.replace('[', '(').replace(']', ')')
    text = text.replace('\xa0', ' ')
    text = re.sub(r'\s+', ' ', text).strip()

    header_pattern = re.compile(
        r'(One[\s-]*Way\s+Exclusion[s]?|Exclusion[s]?|Corequisite[s]?|Prerequisite[s]?|Recommended)',
        flags=re.IGNORECASE
    )

    def classify_header(header_text):
        h = header_text.lower()
        if re.match(r'prerequisite', h):
            return 'prerequisites'
        return None  # discard everything else

    headers = []
    for m in header_pattern.finditer(text):
        headers.append({
            'key': classify_header(m.group(1)),
            'start': m.start(),
            'end': m.end()
        })

    if not headers:
        result['prerequisites'] = extract_course_logic(text)
        return result['prerequisites']

    headers.sort(key=lambda x: x['start'])

    for i, h in enumerate(headers):
        if h['key'] is None:
            continue  # discard Corequisite / Recommended content

        content_start = h['end']
        content_end = headers[i + 1]['start'] if i + 1 < len(headers) else len(text)
        raw_content = text[content_start:content_end].strip()

        result[h['key']] = extract_course_logic(raw_content)

    return result['prerequisites']


def scrape_department(dept: str, session):
    xml = fetch_xml(dept, session)
    if not xml:
        return []

    soup = extract_html(xml)
    if not soup:
        return []

    courses = []
    blocks = soup.select(".courseblock")

    for block in blocks:
        data = parse_course_block(block)
        if not data:
            continue

        req = block.select_one(".detail-requirements")
        if not req:
            data.update({
                "prerequisite_str": "",
            })
        else:
            prereq_text = req.get_text(" ", strip=True)
            prerequisite_str = parse_requirements(prereq_text) if prereq_text else ""

            data.update({
                "prerequisite_str": prerequisite_str,
            })

        courses.append(data)
    return courses



def clean_dataframe(df: pd.DataFrame):
    if df.empty:
        return df

    for col in df.columns:
        if pd.api.types.is_string_dtype(df[col]) or df[col].dtype == "object":

            # safely convert EVERYTHING to string first
            df[col] = df[col].astype("string")

            df[col] = (
                df[col]
                .str.replace("\xa0", " ", regex=False)
                .str.replace(r"\s+", " ", regex=True)
                .str.strip()
            )

    df["credits"] = pd.to_numeric(df["credits"], errors="coerce").astype("Float32")

    return df



def scrape_artsci_courses():
    session = build_session()

    all_courses = []
    for i, dept in enumerate(DEPARTMENTS):
        if i > 0:
            time.sleep(10.2)
        courses = scrape_department(dept, session)
        if courses:
            print(f"Scraped {len(courses)} courses from {dept}")
        dept_courses = clean_dataframe(pd.DataFrame(courses))
        all_courses.append(dept_courses)

    return all_courses

if __name__ == "__main__":
    dfs = scrape_artsci_courses()
    full_df = pd.concat(dfs, ignore_index=True)
    full_df.to_csv("courses.csv", index=False)
