"""
Precomputes course recommendation scores for all courses.
Stores in course_similarity database table
"""
import logging
from itertools import combinations

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.queries.course import get_all_courses
from app.services.recommendation_builder import generate_course_recommendation
from app.models.course_similarity import CourseSimilarity

logger = logging.getLogger(__name__)


def precompute_all_similarities():
    db: Session = SessionLocal()
    try:
        try:
            # Clear existing similarity scores before recomputing
            db.query(CourseSimilarity).delete()
            db.commit()

        except SQLAlchemyError as e:
            db.rollback()
            print(f"Error writing to database: {e}")
            raise  # Don't proceed to repopulate if clearing failed

        courses = get_all_courses(db)
        pairs = list(combinations(courses, 2))
        logger.info("Computing %d pairs for %d courses...", len(pairs), len(courses))

        batch = []
        for i, (c1, c2) in enumerate(pairs):
            score = generate_course_recommendation(c1, c2)

            batch.append(
                CourseSimilarity(
                    course_id_1=c1.course_id,
                    course_id_2=c2.course_id,
                    score=score,
                )
            )

            # Write in batches of 500 to avoid memory issues
            if len(batch) >= 500:
                db.bulk_save_objects(batch)
                db.commit()
                batch = []
                logger.info("Progress: %d / %d pairs", i + 1, len(pairs))

        # Write remaining
        if batch:
            db.bulk_save_objects(batch)
            db.commit()

        logger.info("Done. %d similarity scores stored.", len(pairs))

    except Exception as e:
        db.rollback()
        logger.error("Failed during precompute: %s", e)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    precompute_all_similarities()
