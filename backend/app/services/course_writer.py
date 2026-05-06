"""
Writes courses to MySQL
"""
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import engine
from app.services.prerequisite_parser import parse_prerequisites

from app.models.course import Course
from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse
from app.models.program import (
    Program,
    Program_Section,
    Section_Courses,
)



def write_all_courses_to_mysql(all_course_info):
    # Open a session
    with Session(engine) as session:
        try:
            #Clear existing data (child tables first to satisfy foreign keys)
            try:
                session.query(Section_Courses).delete()
                session.query(Program_Section).delete()
                session.query(Program).delete()
                session.query(PrerequisiteSetCourse).delete()
                session.query(PrerequisiteSet).delete()
                session.query(Course).delete()
                session.commit()

                for table in (
                    "section_courses",
                    "program_section",
                    "programs",
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
                        clo=row['clo'],
                        prerequisite_str=row['prerequisite_str'],
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

            
            session.commit()

        except SQLAlchemyError as e:
            session.rollback()
            print(f"Error writing to database: {e}")
            raise
