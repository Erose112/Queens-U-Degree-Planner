from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.queries.course_queries import get_all_courses, get_course_with_prerequisites
from app.schemas.course import CourseResponse, CourseWithPrerequisites

router = APIRouter(prefix="/courses", tags=["courses"])

@router.get("/", response_model=list[CourseResponse])
def list_courses(db: Session = Depends(get_db)):
    return get_all_courses(db)


@router.get("/{course_code}", response_model=CourseWithPrerequisites)
def get_course(course_code: str, db: Session = Depends(get_db)):
    course = get_course_with_prerequisites(db, course_code)
    if not course:
        raise HTTPException(status_code=404, detail=f"Course {course_code} not found")
    return course
