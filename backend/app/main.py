from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # registers all SQLAlchemy models

from app.routers.courses import router as courses_router
from app.routers.programs import router as programs_router
from app.routers.plans import router as plans_router
from app.routers.recommendations import router as recommendations_router

app = FastAPI(title="Course Planner API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(courses_router)
app.include_router(programs_router)
app.include_router(plans_router)
app.include_router(recommendations_router)

@app.get("/health")
async def health():
    return {"status": "ok"}
