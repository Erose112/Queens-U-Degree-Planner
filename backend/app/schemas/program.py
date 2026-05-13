from __future__ import annotations
from pydantic import BaseModel
from app.schemas.course import Course
from typing import Optional

class Program(BaseModel):
    program_id: int
    program_name: str
    program_type: str

    model_config = {"from_attributes": True}

class SubplanOut(BaseModel):
    subplan_id: int
    subplan_name: str
    subplan_code: str
    subplan_credits: Optional[int]

    model_config = {"from_attributes": True}


class ProgramSectionOut(BaseModel):
    section_id: int
    program_id: int
    subplan_id: Optional[int]
    credit_req: Optional[int]
    logic_type: int
    section_courses: list[Course]
    wildcard: Optional[str]

    model_config = {"from_attributes": True}

class ProgramCourseListOut(BaseModel):
    list_id: int
    program_id: int
    list_name: str
    courses: list[Course]

    model_config = {"from_attributes": True}

class ProgramStructureOut(BaseModel):
    program_id: int
    program_name: str
    program_type: str
    program_link: Optional[str]
    program_credits: int
    num_subplans_required: int
    sections: list[ProgramSectionOut]
    course_lists : list[ProgramCourseListOut]

    model_config = {"from_attributes": True}
