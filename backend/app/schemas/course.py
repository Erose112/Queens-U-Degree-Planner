from typing import Optional
from pydantic import BaseModel


class CourseOut(BaseModel):
    course_id: int
    course_code: str
    title: Optional[str]
    credits: Optional[int]
    description: Optional[str]

    model_config = {"from_attributes": True}

class CourseInSection(BaseModel):
    course_id: int
    course_code: str
    title: Optional[str]
    credits: Optional[int]
    description: Optional[str]
    is_required: bool          # True → red (required), False → yellow (choice)

    model_config = {"from_attributes": True}


class PrereqSetOut(BaseModel):
    """
    One AND-group for a course.  min_required controls within-set logic:
      None  → student must take ALL courses in this set
      1     → student must take at least 1 (OR)
      N     → student must take at least N
    """
    set_id: int
    min_required: int
    required_course_ids: list[int]

    model_config = {"from_attributes": True}


class GraphNode(BaseModel):
    course_id: int
    course_code: str
    title: Optional[str]
    credits: Optional[int]
    # How this course appears in the program:
    #   "required" → red node   (is_required=True in section_courses)
    #   "choice"   → yellow node (is_required=False)
    #   "prereq"   → grey node  (only appears as a prerequisite, not in any section)
    node_type: str


class GraphEdge(BaseModel):
    """
    Directed edge: prerequisite_course_id → course_id
    set_id lets the frontend group edges that belong to the same AND-group.
    """
    from_course_id: int        # the prerequisite
    to_course_id: int          # the course that requires it
    set_id: int                # which PrerequisiteSet this edge belongs to
    min_required: int


class PrerequisiteGraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    # Full set metadata so the frontend can render OR/AND labels on edge groups
    prerequisite_sets: list[PrereqSetOut]
