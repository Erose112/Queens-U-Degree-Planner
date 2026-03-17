import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.program import Program                        # ← DB query
from app.schemas.plan import PlanRequest, PlanResponse        # ← validation
from app.services.plan import generate_plan as build_plan

router = APIRouter(prefix="/plans", tags=["plans"])

logger = logging.getLogger(__name__)



def normalize(code: str) -> str:
        return code.replace(" ", "").upper().strip()



@router.post("/generate", response_model=PlanResponse)
def generate(request: PlanRequest, db: Session = Depends(get_db)):
    second_program = None

    completed  = [normalize(c) for c in request.completed_courses]
    favourites = [normalize(c) for c in request.favourite_courses]
    interested = [normalize(c) for c in request.interested_courses]

    program = db.query(Program).filter(
        Program.program_name == request.program_name
    ).first()

    if request.second_program_name:
        second_program = db.query(Program).filter(
            Program.program_name == request.second_program_name
        ).first()
        if not second_program:
            raise HTTPException(status_code=404, detail=f"'{request.second_program_name}' not found")

    if not program:
        raise HTTPException(status_code=404, detail=f"'{request.program_name}' not found")

    plan = build_plan(
        db,
        program_id=program.program_id,
        completed_courses=completed,
        favourites=favourites,
        interested=interested,
        secondary_program_id=second_program.program_id if request.second_program_name else None,
    )

    if not plan:
        raise HTTPException(status_code=500, detail="Failed to generate plan")

    logger.info("Generated plan for program '%s' with %d courses.",
                request.program_name, len(plan.courses))

    logger.debug("Plan details: %s", plan)

    return plan
