import re
import time
import requests
from requests.exceptions import RequestException
from bs4 import BeautifulSoup
import pandas as pd



def safe_find(soup, tag, class_name):
    element = soup.find(tag, class_=class_name)
    return element.text.strip() if element else None



def extract_course_logic(text):
    course_pattern = r"[A-Z]{3,4}\s\d{3}"
    tokens = re.split(f"({course_pattern}|\\(|\\))", text)

    cleaned = []

    for token in tokens:
        if not token:
            continue
        token = token.strip()
        if re.fullmatch(course_pattern, token):
            if cleaned and cleaned[-1] not in {"and", "or", "("}:
                cleaned.append("and")
            cleaned.append(token)
        elif token in {"(", ")"}:
            cleaned.append(token)
        elif token.lower() == "or":
            cleaned.append("or")
        elif token.lower() == "and":
            cleaned.append("and")
        else:
            # Check if the non-course segment contains or/and
            if re.search(r'\bor\b', token, re.IGNORECASE):
                if cleaned and cleaned[-1] not in {"and", "or", "("}:
                    cleaned.append("or")
            elif re.search(r'\band\b', token, re.IGNORECASE):
                if cleaned and cleaned[-1] not in {"and", "or", "("}:
                    cleaned.append("and")

    result = " ".join(cleaned).strip()

    result = re.sub(r'\(\s*\)', '', result).strip()
    result = re.sub(r'\s+', ' ', result).strip()

    # Remove leading/trailing logical operators left over from empty groups
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
        return result

    headers.sort(key=lambda x: x['start'])

    for i, h in enumerate(headers):
        if h['key'] is None:
            continue  # discard Corequisite / Recommended content

        content_start = h['end']
        content_end = headers[i + 1]['start'] if i + 1 < len(headers) else len(text)
        raw_content = text[content_start:content_end].strip(" .;:")
        result[h['key']] = extract_course_logic(raw_content)

    return result



def extract_data(url, session, retries=3, retry_delay=15):
    """
    Data is stored:

    course_code: "AAAA 000"
    title: TEXT
    credits: int
    course_desc TEXT
    clo: TEXT
    prerequisites: String of course codes
    exclusions: String of course codes
    one_way_exclusions: String of course codes
    """
    # Retry loop to handle non-200 responses (e.g. 202 Accepted)
    response = None
    for attempt in range(1, retries + 1):
        try:
            response = session.get(url, timeout=10)
            print(f"[{url}] Status: {response.status_code} (attempt {attempt})")

            if response.status_code == 200:
                break

            print(f"  Non-200 response. Retrying in {retry_delay}s...")
            time.sleep(retry_delay)

        except RequestException as e:
            print(f"  Request error on attempt {attempt}: {e}")
            if attempt < retries:
                time.sleep(retry_delay)
    else:
        print(f"  Failed after {retries} attempts: {url}")
        return []

    try:
        soup = BeautifulSoup(response.text, 'lxml')

        courses = []
        course_blocks = soup.find_all("div", class_="courseblock")

        for block in course_blocks:
            course_info = safe_find(block, "div", "cols noindent").split("\xa0\xa0")
            requirment_info = parse_requirements(safe_find(block, "span", "text detail-requirements margin--default") or "")

            data = {
                "course_code": course_info[0],
                "title": course_info[1],
                "credits": int(float(course_info[2].split(" ")[1])),
                "course_desc": safe_find(block, "div", "courseblockextra noindent"),
                "clo": safe_find(block, "span", "text detail-cim_los margin--default"),
            }

            data.update(requirment_info)
            courses.append(data)

    except Exception as e:
        print(f"Error parsing data from {url}: {e}")
        return []

    return courses



def clean_data(all_courses):
    df = pd.DataFrame(all_courses)

    if df.empty:
        print("No course data found; skipping DataFrame cleaning.")
        return df

    for col in df.select_dtypes(include=['object']).columns:
        df[col] = (df[col].str.strip()
                        .str.replace("\xa0", " ")
                        .str.replace(r"[\n\r]+", " ", regex=True)
                        .str.replace(r"\s+", " ", regex=True)
                        .str.strip())

    print(df.iloc[0, :])
    return df



def scrape_artsci_courses():
    """
    Returns a list of DataFrames, each representing data for one department's courses.
    """
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
        'Referer': 'https://www.queensu.ca/academic-calendar/arts-science/course-descriptions/',
    })

    # Warm-up request to establish cookies before scraping begins
    print("Warming up session...")
    try:
        session.get(
            "https://www.queensu.ca/academic-calendar/arts-science/course-descriptions/",
            timeout=10
        )
        time.sleep(2)
    except RequestException as e:
        print(f"Warm-up request failed: {e}")

    degree_info = []
    art_sci_degrees = [
        'ANAT', 'ANIM', 'ANSH', 'ARAB', 'ARTH', 'ARIN', 'ASCX', 'ASTR',
        'BISC', 'BCHM', 'BIOL', 'BLCK', 'CANC', 'CRSS', 'CHEM', 'CHIN',
        'CLST', 'COGS', 'CISC', 'COCA', 'COMP', 'CWRI', 'DISC',
        'DRAM', 'DDHT', 'ECON', 'EMPR', 'ENGL', 'ENIN', 'ENSC', 'FILM',
        'ARTF', 'FREN', 'FRST', 'GNDS', 'GPHY', 'GEOL', 'GRMN', 'DEVS',
        'GREK', 'HLTH', 'HEBR', 'HIST', 'INDG', 'IDIS', 'INTS', 'INUK',
        'ITLN', 'JAPN', 'JWST', 'KNPE', 'LANG', 'LLCU', 'LATN', 'LIBS',
        'LISC', 'LING', 'MATH', 'MAPP', 'MICR', 'MOHK', 'MUSC', 'MUTH',
        'NSCI', 'PATH', 'PHAR', 'PHIL', 'PHYS', 'PHGY', 'POLS', 'PPEC',
        'PORT', 'INTN', 'PSYC', 'QGSP', 'RELS', 'REPD', 'SOCY', 'SPAN',
        'STAT', 'STAM', 'ARTV', 'WELL', 'WRIT'
    ]

    for i, degree in enumerate(art_sci_degrees):
        # Sleep between requests (skip only before the first one)
        if i > 0:
            time.sleep(10.2)

        url = "https://www.queensu.ca/academic-calendar/arts-science/course-descriptions/" + degree.lower() + "/"
        df = clean_data(extract_data(url, session))
        degree_info.append(df)

    return degree_info
