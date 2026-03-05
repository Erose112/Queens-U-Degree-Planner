from sqlalchemy.orm import Session
from app.models.course_similarity import CourseSimilarity
from app.models.course import Course


def get_similar_courses_from_db(
    db: Session,
    course_id: int,
    top_k: int = 10,
    min_score: float = 0.3,
) -> list[tuple[Course, float]]:
    """
    Fetch precomputed similarity scores for a course, returns (Course, score) pairs.
    Checks both directions of the pair since we only store (lower_id, higher_id).
    """
    results = (
        db.query(CourseSimilarity, Course)
        .join(
            Course,
            (CourseSimilarity.course_id_2 == Course.course_id) |
            (CourseSimilarity.course_id_1 == Course.course_id)
        )
        .filter(
            (CourseSimilarity.course_id_1 == course_id) |
            (CourseSimilarity.course_id_2 == course_id)
        )
        .filter(Course.course_id != course_id)
        .filter(CourseSimilarity.score >= min_score)
        .order_by(CourseSimilarity.score.desc())
        .limit(top_k)
        .all()
    )

    return [(course, sim.score) for sim, course in results]
