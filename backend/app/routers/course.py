import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.queries.course import get_all_courses, get_prerequisite_graph_data
from app.schemas.course import CourseOut, GraphEdge, GraphNode, PrereqSetOut, PrerequisiteGraphOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses", tags=["courses"])

@router.get("/", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return get_all_courses(db)

@router.get("/{course_id}/prerequisites")
def get_prerequisite_course_graph(course_id: int, db: Session = Depends(get_db)):
    all_courses, all_prereq_sets = get_prerequisite_graph_data(db, course_id)

    nodes: list[GraphNode] = [
        GraphNode(
            course_id=cid,
            course_code=course.course_code,
            title=course.title,
            credits=course.credits,
            node_type='prereq',
        )
        for cid, course in all_courses.items()
    ]

    edges: list[GraphEdge] = []
    prereq_sets_out: list[PrereqSetOut] = []

    for course_id, prereq_sets in all_prereq_sets.items():
        for ps in prereq_sets:
            prereq_sets_out.append(
                PrereqSetOut(
                    set_id=ps.set_id,
                    min_required=ps.min_required,
                    required_course_ids=[psc.required_course_id for psc in ps.required_courses],
                )
            )
            for psc in ps.required_courses:
                edges.append(
                    GraphEdge(
                        from_course_id=psc.required_course_id,
                        to_course_id=course_id,
                        set_id=ps.set_id,
                        min_required=ps.min_required,
                    )
                )

    return PrerequisiteGraphOut(nodes=nodes, edges=edges, prerequisite_sets=prereq_sets_out)
