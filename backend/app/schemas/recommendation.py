from pydantic import BaseModel

class CourseRecommendationResponse(BaseModel):
    course_id1: int
    course_id2: int
    score: float

    model_config = {"from_attributes": True}
