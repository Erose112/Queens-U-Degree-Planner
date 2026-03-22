from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.queries.program import (
    get_all_programs,
    get_program_structure,
    get_program_for_prereq_graph,
    bfs_prerequisite_graph,
)
from app.schemas.program import (
    ProgramOut,
    ProgramStructureOut,
    ProgramSectionOut,
    CourseInSection,
    PrerequisiteGraphOut,
    GraphNode,
    GraphEdge,
    PrereqSetOut,
)

router = APIRouter(prefix="/programs", tags=["programs"])

@router.get("/", response_model=list[ProgramOut])
def list_programs(db: Session = Depends(get_db)):
    return get_all_programs(db)


@router.get("/{program_id}/structure", response_model=ProgramStructureOut)
def get_program_structure_route(program_id: int, db: Session = Depends(get_db)):
    program = get_program_structure(db, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")

    sections_out: list[ProgramSectionOut] = []
    for section in sorted(program.sections, key=lambda s: s.section_id):
        courses_out: list[CourseInSection] = [
            CourseInSection(
                course_id=sc.course.course_id,
                course_code=sc.course.course_code,
                title=sc.course.title,
                credits=sc.course.credits,
                description=sc.course.description,
                is_required=bool(sc.is_required),
            )
            for sc in section.section_courses
        ]

        sections_out.append(
            ProgramSectionOut(
                section_id=section.section_id,
                section_name=section.section_name,
                credit_req=section.credit_req,
                logic_type=section.logic_type,
                courses=courses_out,
            )
        )

    return ProgramStructureOut(
        program_id=program.program_id,
        program_name=program.program_name,
        program_type=program.program_type,
        total_credits=program.total_credits,
        sections=sections_out,
    )


@router.get("/{program_id}/prerequisite-graph", response_model=PrerequisiteGraphOut)
def get_prerequisite_graph(program_id: int, db: Session = Depends(get_db)):
    program = get_program_for_prereq_graph(db, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")

    section_course_type, all_courses, all_prereq_sets = bfs_prerequisite_graph(db, program)

    nodes: list[GraphNode] = [
        GraphNode(
            course_id=cid,
            course_code=course.course_code,
            title=course.title,
            credits=course.credits,
            node_type=section_course_type[cid],
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
