"""
Writes courses to MySQL
"""
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import engine
from app.services.prerequisite_parser import parse_prerequisites

from app.models.course import Course
from app.models.exclusion import Exclusion
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse
from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
)



def parse_course_code_list(text):
    """Parse a space-separated string of course codes (e.g. 'ANAT 101 IDIS 150') into normalized codes."""
    if not text or not str(text).strip():
        return []
    tokens = str(text).split()
    codes = []
    for i in range(0, len(tokens) - 1, 2):
        codes.append((tokens[i] + tokens[i + 1]).upper())
    return codes



def exclusion_exists(session, course_id: int, excluded_course_id: int) -> bool:
    """True if an exclusion (course_id, excluded_course_id) is already in the session or DB."""
    return session.query(Exclusion).filter_by(
        course_id=course_id,
        excluded_course_id=excluded_course_id,
    ).first() is not None



def add_exclusion_if_new(session, course_id: int, excluded_course_id: int, one_way: int) -> None:
    """Add one exclusion row only if it does not already exist (avoids duplicate key)."""
    if course_id == excluded_course_id:
        return
    if exclusion_exists(session, course_id, excluded_course_id):
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
            try:
                session.query(Section_Courses).delete()
                session.query(Program_Section).delete()
                session.query(Program).delete()
                session.query(Exclusion).delete()
                session.query(PrerequisiteSetCourse).delete()
                session.query(PrerequisiteSet).delete()
                session.query(Course).delete()
                session.commit()

                for table in (
                    "section_courses",
                    "program_section",
                    "programs",
                    "exclusions",
                    "prerequisite_set_courses",
                    "prerequisite_sets",
                    "courses",
                ):
                    session.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1"))
                session.commit()

            except SQLAlchemyError as e:
                session.rollback()
                print(f"Error writing to database: {e}")
                raise  # Don't proceed to repopulate if clearing failed

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

            ## commits to SQL Table Course
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
                    exclusion_codes = parse_course_code_list(row.get('exclusions', ''))
                    for excluded_code in exclusion_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        if excluded_id is None or excluded_id == course_id:
                            continue
                        add_exclusion_if_new(session, course_id, excluded_id, one_way=0)
                        add_exclusion_if_new(session, excluded_id, course_id, one_way=0)

                    # Process One-Way Exclusions (only this course excludes the other)
                    one_way_codes = parse_course_code_list(row.get('one_way_exclusion', ''))
                    for excluded_code in one_way_codes:
                        excluded_id = course_lookup.get(excluded_code)
                        if excluded_id is None or excluded_id == course_id:
                            continue
                        add_exclusion_if_new(session, course_id, excluded_id, one_way=1)

            session.commit()

        except SQLAlchemyError as e:
            session.rollback()
            print(f"Error writing to database: {e}")
            raise
