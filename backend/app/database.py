from typing import Any
import os

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.scrapers.course_scraper import scrape_artsci_courses
from app.scrapers.program_scraper import scrape_program_courses
from app.models.course import Course
from app.models.exclusion import Exclusion
from app.services.prerequisite_parser import parse_prerequisites

load_dotenv()

# Database connection parameters
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST', 'localhost'),  
    'port': int(os.getenv('DB_PORT', 3306)),  
    'database': os.getenv('DB_NAME')
}

connection_string = (
    f"mysql+pymysql://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
    f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
)

engine = create_engine(
    connection_string,
    echo=False,  # Set to True to see SQL queries
    pool_pre_ping=True
)



def _parse_course_code_list(text):
    """Parse a space-separated string of course codes (e.g. 'ANAT 101 IDIS 150') into normalized codes."""
    if not text or not str(text).strip():
        return []
    tokens = str(text).split()
    codes = []
    for i in range(0, len(tokens) - 1, 2):
        codes.append((tokens[i] + tokens[i + 1]).upper())
    return codes



def write_all_courses_to_mysql(all_course_info):
    # Open a session
    with Session(engine) as session:
        try:
            # Clear existing data
            session.query(Course).delete()
            session.commit()

            # Insert courses
            course_objects = []
            for degree_df in all_course_info:
                for _, row in degree_df.iterrows():

                    ## Converts df to Course object

                    course_code = row['course_code'].replace(" ", "").upper()
                    course = Course(
                        course_code=course_code,
                        title=row['title'],
                        credits=int(row['credits']),
                        description=row['course_desc'],
                        clo=row['clo']
                    )
                    course_objects.append(course)

            session.add_all(course_objects)

            ## commits to SQL Table - Course
            session.commit()

            # Build course lookup
            course_lookup = {
                c.course_code: c.course_id
                for c in session.query(Course).all()
            }

            # Process prerequisite requirements for each course
            # Example: "CSC148 and (CSC165 or CSC240)" becomes multiple PrerequisiteSet records
            for degree_df in all_course_info:
                for index, row in degree_df.iterrows():
                    # Normalize course code (remove spaces, uppercase)
                    course_code = row['course_code'].replace(" ", "").upper()
                    course_id = course_lookup[course_code]

                    # Parse prerequisite text if it exists
                    prereq_text = row.get('prerequisites', "")
                    if prereq_text:
                        # Convert prerequisite string into database objects
                        prereq_sets = parse_prerequisites(prereq_text, course_lookup, course_id)
                        session.add_all(prereq_sets)


            # Process both regular exclusions and one-way exclusions
            for degree_df in all_course_info:
                for index, row in degree_df.iterrows():
                    # Normalize course code
                    course_code = row['course_code'].replace(" ", "").upper()
                    course_id = course_lookup.get(course_code)
                    
                    # Skip if course not found in lookup
                    if course_id is None:
                        continue

                    # Process Regular Exclusions
                    # Example: CSC148 excludes CSC108 (and vice versa)
                    exclusion_codes = _parse_course_code_list(row.get('exclusions', ''))
                    for excluded_code in exclusion_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        
                        # Only add if the excluded course exists and isn't the same course
                        if excluded_id is not None and excluded_id != course_id:
                            session.add(Exclusion(
                                course_id=course_id,
                                excluded_course_id=excluded_id,
                                one_way=0  # 0 = mutual exclusion
                            ))

                    # Process One-Way Exclusions
                    # Example: CSC148 excludes CSC108, but CSC108 doesn't exclude CSC148
                    one_way_codes = _parse_course_code_list(row.get('one_way_exclusion', ''))
                    for excluded_code in one_way_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        
                        # Only add if the excluded course exists and isn't the same course
                        if excluded_id is not None and excluded_id != course_id:
                            session.add(Exclusion(
                                course_id=course_id,
                                excluded_course_id=excluded_id,
                                one_way=1  # 1 = one-way exclusion
                            ))


            session.commit()

        except SQLAlchemyError as e:
            session.rollback()
            print(f"Error writing to database: {e}")
            raise



# This is old code that writes all programs to the database.
# However it doesnt write in Foreign Key relationships.
def write_all_programs_to_mysql():
    all_program_info = scrape_program_courses()

    try:
        # Clear existing data before inserting new data
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM programs"))
            conn.commit()

        for degree_df in enumerate[Any](all_program_info):
            try:
                degree_df.to_sql(
                    name='programs',
                    con=engine,
                    if_exists='append',
                    index=False,
                    chunksize=1000
                )
            except SQLAlchemyError as e:
                print(f"Error writing to database: {e}")
                raise

    finally:
        engine.dispose()
