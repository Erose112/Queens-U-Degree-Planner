from typing import Optional
from pydantic import BaseModel


class Course(BaseModel):
    course_id: int
    course_code: str
    title: Optional[str]
    credits: Optional[int]
    description: Optional[str]
    prerequisite_str: Optional[str] = None
    # How this course appears in a program:
    #   "required" → red node   (all courses in section mandatory)
    #   "choice"   → yellow node (choose courses to meet credit requirement)
    #   "elective" → green node (optional courses)
    #   None       → not in a program context
    node_type: Optional[str] = None

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
    nodes: list[Course]
    edges: list[GraphEdge]
    # Full set metadata so the frontend can render OR/AND labels on edge groups
    prerequisite_sets: list[PrereqSetOut]
