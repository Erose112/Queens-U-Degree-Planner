import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import queens_db_models.models  # registers all SQLAlchemy models

from app.routers.course import router as course_router
from app.routers.program import router as program_router

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="Course Planner API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(program_router, prefix="/api")
app.include_router(course_router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok"}
