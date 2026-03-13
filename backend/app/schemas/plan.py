from enum import Enum
from pydantic import BaseModel, Field, ConfigDict


class PlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    program_name: str               # matches DB program_name exactly
    completed_courses: list[str] = Field(default=[], alias="completedCourses")
    favourite_courses: list[str] = Field(default=[], alias="favouriteCourses")
    interested_courses: list[str] = Field(default=[], alias="interestedCourses")
    second_program_name: str | None = Field(default=None, alias="secondProgramName")  # optional for double majors/minors


class CourseNode(BaseModel):
    course_code: str
    title: str
    units: float | None = None
    year: int
    semester: str | None = None
    is_required: bool
    is_choice: bool = False  # True if course is from a choice group


class CourseEdge(BaseModel):
    from_course: str
    to_course: str
    edge_type: str


class CourseStatus(str, Enum):
    REQUIRED = "required"
    CHOICE = "choice"
    COMPLETED = "completed"
    AVAILABLE = "available"
    LOCKED = "locked"


class PlanResponse(BaseModel):
    program_name: str
    program_code: str
    total_units: float
    core_units: float
    elective_units: float
    courses: list[CourseNode]
    edges: list[CourseEdge]
