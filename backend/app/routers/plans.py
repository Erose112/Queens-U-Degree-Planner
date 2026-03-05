import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.program import Program                        # ← DB query
from app.schemas.plan import PlanRequest, PlanResponse        # ← validation
from app.services.plan_builder import generate_plan as build_plan


router = APIRouter(prefix="/plans", tags=["plans"])

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@router.post("/generate", response_model=PlanResponse)
def generate(request: PlanRequest, db: Session = Depends(get_db)):
    program = db.query(Program).filter(
        Program.program_name == request.program_name
    ).first()

    if not program:
        raise HTTPException(status_code=404, detail=f"'{request.program_name}' not found")

    plan = build_plan(
        db,
        program_id=program.program_id,
        completed_courses=request.completed_courses,
        interests=request.favourite_courses,
    )

    if not plan:
        raise HTTPException(status_code=500, detail="Failed to generate plan")

    logger.info("Generated plan for program '%s' with %d courses.",
                request.program_name, len(plan.courses))

    logger.debug("Plan details: %s", plan)

    
    return plan
