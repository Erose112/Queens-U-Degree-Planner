import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recommendation import CourseRecommendationResponse
from app.services.recommendation_services import get_recommendations_for_course

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get(
    "/{course_code}",
    response_model=list[CourseRecommendationResponse],
)
def get_course_recommendations(
    course_code: str,
    top_k: int = 10,
    db: Session = Depends(get_db),
):
    """
    Returns the most similar courses to the given course code.
    top_k defaults to 10
    """
    results = get_recommendations_for_course(db, course_code, top_k=top_k)

    if results is None:
        raise HTTPException(
            status_code=404,
            detail=f"Course {course_code} not found."
        )


    return [
        CourseRecommendationResponse(course_id1=course_code, course_id2=course, score=round(score, 4))
        for course, score in results
    ]
