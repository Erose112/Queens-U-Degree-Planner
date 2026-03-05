from pydantic import BaseModel
from app.schemas.course import CourseResponse

class SectionResponse(BaseModel):
    model_config = {"from_attributes": True}

    section_id: int
    credit_req: int | None = None
    courses: list[CourseResponse] = []

class ProgramResponse(BaseModel):
    model_config = {"from_attributes": True}

    program_id: int
    program_name: str
    program_type: str | None = None
    total_credits: int | None = None
    sections: list[SectionResponse] = []

SectionResponse.model_rebuild()
ProgramResponse.model_rebuild()
