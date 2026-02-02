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
    """
    Extract only course codes and logical operators (and, or) from any string.
    Keeps parentheses if present.
    """
    course_pattern = r"[A-Z]{3,4}\s\d{3}"   # allow 3- or 4-letter dept codes (e.g., CSC, BIOL)
    # Tokenize while keeping course codes and parentheses
    tokens = re.split(f"({course_pattern}|\\(|\\))", text)

    cleaned = []
    for token in tokens:
        if not token:
            continue
        token = token.strip()
        if re.fullmatch(course_pattern, token):
            cleaned.append(token)
        elif token in {"(", ")"}:
            cleaned.append(token)
        elif token.lower() in {"and", "or"}:
            cleaned.append(token.lower())

    return " ".join(cleaned).strip()



def parse_requirements(requirement_line):
    """
    Parse a requirement line into prerequisites, exclusions, and one-way exclusions.

    This version:
      - finds section headers flexibly (various hyphen/space/case)
      - slices text between headers instead of removing matches
      - extracts course-logic from each section
      - converts square brackets to parentheses
    """
    result = {
        'prerequisites': '',
        'exclusions': '',
        'one_way_exclusion': ''
    }

    # Remove "Requirements:" prefix if present
    text = re.sub(r'^\s*Requirements?\s*:\s*', '', requirement_line, flags=re.IGNORECASE).strip()
    
    # Convert square brackets to parentheses
    text = text.replace('[', '(').replace(']', ')')

    # Combined header pattern with flexible variants and optional plural 's'
    header_pattern = re.compile(
        r'(One[\s-]*Way\s+Exclusion[s]?|Exclusion[s]?|Prerequisite[s]?)',
        flags=re.IGNORECASE
    )

    # Find all headers and their spans
    headers = []
    for m in header_pattern.finditer(text):
        header_text = m.group(1)
        # normalize header to map to our keys
        h = header_text.lower()
        if re.match(r'one[\s-]*way\s+exclusion', h):
            key = 'one_way_exclusion'
        elif re.match(r'exclusion', h):
            key = 'exclusions'
        elif re.match(r'prerequisite', h):
            key = 'prerequisites'
        else:
            continue
        headers.append({
            'key': key,
            'start': m.start(),
            'end': m.end()
        })

    if not headers:
        # No explicit headers: try to treat the whole line as prereq text
        result['prerequisites'] = extract_course_logic(text)
        return result

    # Sort by start (should already be in order from finditer, but be safe)
    headers.sort(key=lambda x: x['start'])

    # Extract content for each header as text between header end and next header start
    for i, h in enumerate(headers):
        content_start = h['end']
        content_end = headers[i+1]['start'] if i + 1 < len(headers) else len(text)
        raw_content = text[content_start:content_end].strip(" .;:")  # trim common trailing punctuation
        result[h['key']] = extract_course_logic(raw_content)

    return result



def extract_data(url, session):
    try:
        response = session.get(url, timeout=10)
        print(response.status_code)

        if response.status_code == 200:
            print("Request was successful (Status 200 OK)")
        else:
            print(f"Request failed with status code: {response.status_code}")
            return []

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

    except RequestException as e:
        print(f"Error extracting data from {url}: {e}")
        return []

    return courses



def clean_data(all_courses):
    df = pd.DataFrame(all_courses)

    # If no courses were extracted, avoid indexing into an empty DataFrame
    if df.empty:
        print("No course data found; skipping DataFrame cleaning.")
        return df

    for col in df.select_dtypes(include=['object']).columns:
        df[col] = (df[col].str.strip()
                        .str.replace("\xa0", " ")
                        .str.replace(r"[\n\r]+", " ", regex=True)
                        .str.replace(r"\s+", " ", regex=True)
                        .str.strip())

    # Safely show the first row for debugging
    print(df.iloc[0, :])
    return df



def scrape_artsci_courses():
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

    degree_info = []
    art_sci_degrees =  [
        'ANAT', 
        # 'ANIM', 'ANSH', 'ARAB', 'ARTH', 'ARIN', 'ASCX', 'ASTR',
        # 'BADR', 'BCHM', 'BIOL', 'BLCK', 'CANC', 'CRSS', 'CHEM', 'CHIN',
        # 'CLST', 'COGS', 'CISC', 'COCA', 'COMP', 'CWRI', 'DISC',
        # 'DRAM', 'DDHT', 'ECON', 'EMPR', 'ENGL', 'ENIN', 'ENSC', 'FILM',
        # 'ARTF', 'FREN', 'FRST', 'GNDS', 'GPHY', 'GEOL', 'GRMN', 'DEVS',
        # 'GREK', 'HLTH', 'HEBR', 'HIST', 'INDG', 'IDIS', 'INTS', 'INUK',
        # 'ITLN', 'JAPN', 'JWST', 'KNPE', 'LANG', 'LLCU', 'LATN', 'LIBS',
        # 'LISC', 'LING', 'MATH', 'MAPP', 'MICR', 'MOHK', 'MUSC', 'MUTH',
        # 'NSCI', 'PATH', 'PHAR', 'PHIL', 'PHYS', 'PHGY', 'POLS', 'PPEC',
        # 'PORT', 'INTN', 'PSYC', 'QGSP', 'RELS', 'REPD', 'SOCY', 'SPAN',
        # 'STAT', 'STAM', 'ARTV', 'WELL', 'WRIT'
    ]

    for degree in art_sci_degrees:
        url = "https://www.queensu.ca/academic-calendar/arts-science/course-descriptions/" + degree.lower() + "/"
        df = clean_data(extract_data(url, session))
        degree_info.append(df)

        if len(degree_info) != len(art_sci_degrees):
            time.sleep(10)

    for info in degree_info:
        print(info)

    return degree_info



if __name__ == "__main__":
    scrape_artsci_courses()
