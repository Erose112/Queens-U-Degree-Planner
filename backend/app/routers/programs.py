from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.queries.program_queries import get_all_programs, get_program_with_sections
from app.schemas.program import ProgramResponse

router = APIRouter(prefix="/programs", tags=["programs"])


@router.get("/", response_model=list[ProgramResponse])
def list_programs(db: Session = Depends(get_db)):
    return get_all_programs(db)


@router.get("/{program_id}", response_model=ProgramResponse)
def get_program(program_id: int, db: Session = Depends(get_db)):
    program = get_program_with_sections(db, program_id)
    if not program:
        raise HTTPException(status_code=404, detail=f"Program {program_id} not found")
    return program
