import re
from pydantic import BaseModel, field_validator, field_serializer

class CourseBase(BaseModel):
    course_code: str
    title: str
    description: str | None = None
    units: float | None = None

    @field_validator("course_code")
    @classmethod
    def normalize_course_code(cls, value: str) -> str:
        # "CISC 101" → "CISC101" (for incoming requests)
        return re.sub(r"\s+", "", value).upper()

class CourseResponse(CourseBase):
    course_id: int
    model_config = {"from_attributes": True}

    @field_serializer("course_code")
    def format_course_code(self, value: str) -> str:
        # "CISC101" → "CISC 101" (for outgoing responses)
        return re.sub(r"([A-Za-z]+)(\d+)", r"\1 \2", value)

class PrerequisiteSetResponse(BaseModel):
    model_config = {"from_attributes": True}

    set_id: int
    required_courses: list[CourseResponse] = []

class CourseWithPrerequisites(CourseResponse):
    prerequisite_sets: list[PrerequisiteSetResponse] = []

CourseWithPrerequisites.model_rebuild()
