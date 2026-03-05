"""
Different methods for getting similar recommendations
"""
import logging

from sqlalchemy.orm import Session

from app.queries.course_queries import get_course_by_code
from app.queries.program_queries import get_courses_in_program
from app.queries.similarity_queries import get_similar_courses_from_db

logger = logging.getLogger(__name__)


def get_recommendations_for_course(
    db: Session,
    course_code: str,
    top_k: int = 10,
) -> list[tuple]:
    """
    Given a course code, return the most similar courses across the entire
    course catalogue using precomputed similarity scores.
    """
    course = get_course_by_code(db, course_code)
    if not course:
        logger.warning("Course %s not found for recommendations.", course_code)
        return []

    return get_similar_courses_from_db(db, course.course_id, top_k=top_k)


def get_recommendations_for_program(
    db: Session,
    program_id: int,
    completed_course_codes: list[str],
    top_k: int = 10,
) -> list[tuple]:
    """
    Given a program and completed courses, recommend the next best courses
    to take from within that program using precomputed similarity scores.
    """
    all_program_courses = get_courses_in_program(db, program_id)

    if not all_program_courses:
        logger.warning("No courses found for program %d.", program_id)
        return []

    completed_courses = [
        c for c in all_program_courses
        if c.course_code in completed_course_codes
    ]
    candidates = [
        c for c in all_program_courses
        if c.course_code not in completed_course_codes
    ]

    if not candidates:
        logger.warning("No remaining courses found for program %d.", program_id)
        return []

    # No history to compare against — return candidates unscored
    if not completed_courses:
        return [(c, 0.0) for c in candidates[:top_k]]

    candidate_ids = {c.course_id for c in candidates}

    # For each completed course, fetch its precomputed scores and
    # keep only scores for candidates still in the program
    scored: dict[int, float] = {}
    for completed in completed_courses:
        results = get_similar_courses_from_db(
            db,
            completed.course_id,
            top_k=len(candidates),
        )
        for course, score in results:
            if course.course_id not in candidate_ids:
                continue
            # Keep the highest score seen across all completed courses
            scored[course.course_id] = max(
                scored.get(course.course_id, 0.0),
                score,
            )

    # Re-attach course objects and sort
    course_map = {c.course_id: c for c in candidates}
    results = [
        (course_map[course_id], score)
        for course_id, score in scored.items()
        if course_id in course_map
    ]

    # Include candidates that had no similarity scores at all
    scored_ids = {course_id for course_id, _ in scored.items()}
    unscored = [
        (c, 0.0) for c in candidates
        if c.course_id not in scored_ids
    ]

    results = results + unscored
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]


def get_highest_scored_courses(
    db: Session,
    course_codes: list[str],
    top_k: int = 10,
) -> list[tuple]:
    """
    Given a list of course codes (e.g. elective options in a plan),
    return them ranked by average precomputed similarity to each other.
    Used by the graph layer to weight elective selection.
    """
    courses = [
        c for code in course_codes
        if (c := get_course_by_code(db, code))
    ]

    if not courses:
        return []

    # Single course — nothing to compare against
    if len(courses) == 1:
        return [(courses[0], 0.0)]

    course_ids = {c.course_id for c in courses}

    scored = []
    for course in courses:
        results = get_similar_courses_from_db(
            db,
            course.course_id,
            top_k=len(courses),
        )
        # Only keep scores against other courses in the input list
        peer_scores = [
            score for c, score in results
            if c.course_id in course_ids and c.course_id != course.course_id
        ]
        avg_score = sum(peer_scores) / len(peer_scores) if peer_scores else 0.0
        scored.append((course, avg_score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]
