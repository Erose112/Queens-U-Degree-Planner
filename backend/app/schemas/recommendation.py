from pydantic import BaseModel
from app.schemas.course import CourseResponse

class CourseRecommendationResponse(BaseModel):
    course: CourseResponse
    score: float

    model_config = {"from_attributes": True}
