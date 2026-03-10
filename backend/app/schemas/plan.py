from enum import Enum
from pydantic import BaseModel, Field, ConfigDict


class PlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    program_name: str               # matches DB program_name exactly
    completed_courses: list[str] = Field(default=[], alias="completedCourses")
    favourite_courses: list[str] = Field(default=[], alias="favouriteCourses")


class CourseNode(BaseModel):
    course_code: str
    title: str
    units: float | None = None
    year: int
    semester: str | None = None
    is_required: bool
    is_choice: bool = False  # True if course is from a choice group
    group_id: str | None = None      # e.g. "section_412"
    group_label: str | None = None   # e.g. "Pick 3cr from 5"


class CourseEdge(BaseModel):
    from_course: str
    to_course: str
    edge_type: str


class ChoiceOption(BaseModel):
    course_code: str
    title: str
    units: float | None = None


class ChoiceNode(BaseModel):
    choice_id: str
    label: str                      # "OR"
    year: int
    position: int
    required: bool
    options: list[ChoiceOption]


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
    choices: list[ChoiceNode]      # needs a new schema
    edges: list[CourseEdge]
