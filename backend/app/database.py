import os

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError, ProgrammingError
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from app.models.course import Course
from app.models.exclusion import Exclusion
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse
from app.models.program import Program, Program_Section
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


def _exclusion_exists(session, course_id: int, excluded_course_id: int) -> bool:
    """True if an exclusion (course_id, excluded_course_id) is already in the session or DB."""
    return session.query(Exclusion).filter_by(
        course_id=course_id,
        excluded_course_id=excluded_course_id,
    ).first() is not None


def _add_exclusion_if_new(session, course_id: int, excluded_course_id: int, one_way: int) -> None:
    """Add one exclusion row only if it does not already exist (avoids duplicate key)."""
    if course_id == excluded_course_id:
        return
    if _exclusion_exists(session, course_id, excluded_course_id):
        return
    session.add(Exclusion(
        course_id=course_id,
        excluded_course_id=excluded_course_id,
        one_way=one_way,
    ))


def write_all_courses_to_mysql(all_course_info):
    # Open a session
    with Session(engine) as session:
        try:
            #Clear existing data (child tables first to satisfy foreign keys)
            session.query(Exclusion).delete()
            session.query(PrerequisiteSetCourse).delete()
            session.query(PrerequisiteSet).delete()
            try:
                session.query(Program_Courses).delete()
            except ProgrammingError:
                # program_courses table may not exist yet
                pass
            session.query(Course).delete()
            session.commit()

            # Reset AUTO_INCREMENT so new rows get IDs starting from 1
            for table in ("exclusions", "prerequisite_set_courses", "prerequisite_sets", "courses"):
                session.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1"))
            session.commit()

            # Insert courses
            course_objects = []
            for degree_df in all_course_info:
                for index, row in degree_df.iterrows():

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
                    course_code = row['course_code'].replace(" ", "").upper()
                    course_id = course_lookup.get(course_code)
                    if course_id is None:
                        continue  # Skip if course not in lookup (e.g. duplicate code)

                    prereq_text = row.get('prerequisites', "")
                    if prereq_text:
                        prereq_sets = parse_prerequisites(
                            prereq_text, course_lookup, course_id
                        )
                        if prereq_sets:
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

                    # Process Regular Exclusions (mutual: A and B exclude each other)
                    # Store both directions so "B excludes A" is true when "A excludes B" is.
                    exclusion_codes = _parse_course_code_list(row.get('exclusions', ''))
                    for excluded_code in exclusion_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        if excluded_id is None or excluded_id == course_id:
                            continue
                        _add_exclusion_if_new(session, course_id, excluded_id, one_way=0)
                        _add_exclusion_if_new(session, excluded_id, course_id, one_way=0)

                    # Process One-Way Exclusions (only this course excludes the other)
                    one_way_codes = _parse_course_code_list(row.get('one_way_exclusion', ''))
                    for excluded_code in one_way_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        if excluded_id is None or excluded_id == course_id:
                            continue
                        _add_exclusion_if_new(session, course_id, excluded_id, one_way=1)


            session.commit()

        except SQLAlchemyError as e:
            session.rollback()
            print(f"Error writing to database: {e}")
            raise



def write_all_programs_to_mysql(all_program_info):
    with Session(engine) as session:
        try:
            # Clear existing data (child table first to satisfy foreign keys)
            try:
                session.query(Program_Courses).delete()
            except ProgrammingError:
                # program_courses table may not exist yet
                pass
            session.query(Program).delete()
            session.commit()

            # Reset AUTO_INCREMENT so new rows get IDs starting from 1
            session.execute(text("ALTER TABLE programs AUTO_INCREMENT = 1"))
            session.commit()


            programs_dict = {}  # Track unique programs by program_name
            program_courses_objects = []

            for index, row in all_program_info.iterrows():
                program_name = row["program"]
                course_code = row["faculty_abbr"] + row["course_number"]

                # Create program only once per unique program_name
                if program_name not in programs_dict:
                    program = Program(program_name=program_name)
                    programs_dict[program_name] = program
                    session.add(program)


                course_id = (
                    session.query(Course.course_id)
                    .filter(Course.course_code == course_code)
                    .scalar()
                )
                if course_id is not None:
                    program_courses_objects.append(
                        Program_Courses(
                            programs=programs_dict[program_name],
                            course_id=course_id,
                        )
                    )

            session.add_all(program_courses_objects)
            session.commit()


        except SQLAlchemyError as e:
            session.rollback()
            print(f"Error writing to database: {e}")
            raise
