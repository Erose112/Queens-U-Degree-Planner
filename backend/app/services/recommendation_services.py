"""
Different methods for getting similar recommendations
"""
import logging

from sqlalchemy.orm import Session

from app.queries.course import get_course_by_code
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



def get_recommendations_for_candidates(
    db: Session,
    seed_course_codes: list[str],
    candidate_course_codes: list[str],
    top_k: int = 10,
) -> list[tuple]:
    """
    Rank a set of candidate courses by their similarity to a set of seed
    courses (e.g. committed/completed courses). No program scoping applied.

    Used for free elective backfill where candidates are outside the program.
    """
    if not candidate_course_codes:
        return []

    candidates = [
        c for code in candidate_course_codes
        if (c := get_course_by_code(db, code))
    ]
    if not candidates:
        return []

    seed_courses = [
        c for code in seed_course_codes
        if (c := get_course_by_code(db, code))
    ]

    # No history — return candidates unscored
    if not seed_courses:
        return [(c, 0.0) for c in candidates[:top_k]]

    candidate_ids = {c.course_id for c in candidates}

    scored: dict[int, float] = {}
    for seed in seed_courses:
        results = get_similar_courses_from_db(
            db,
            seed.course_id,
            top_k=len(candidates),
        )
        for course, score in results:
            if course.course_id not in candidate_ids:
                continue
            # Keep the highest score seen across all seeds
            scored[course.course_id] = max(
                scored.get(course.course_id, 0.0),
                score,
            )

    course_map = {c.course_id: c for c in candidates}
    ranked = [
        (course_map[cid], score)
        for cid, score in scored.items()
        if cid in course_map
    ]

    # Append anything with no similarity data at all
    scored_ids = set(scored)
    unscored = [(c, 0.0) for c in candidates if c.course_id not in scored_ids]

    ranked = ranked + unscored
    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[:top_k]
