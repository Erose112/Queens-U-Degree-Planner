from __future__ import annotations
from pydantic import BaseModel
from app.schemas.course import CourseInSection

class ProgramOut(BaseModel):
    program_id: int
    program_name: str
    program_type: str
    total_credits: int

    model_config = {"from_attributes": True}


class ProgramSectionOut(BaseModel):
    section_id: int
    section_name: str
    credit_req: int
    logic_type: int
    courses: list[CourseInSection]

    model_config = {"from_attributes": True}


class ProgramStructureOut(BaseModel):
    program_id: int
    program_name: str
    program_type: str
    total_credits: int
    sections: list[ProgramSectionOut]

    model_config = {"from_attributes": True}
