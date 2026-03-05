from sqlalchemy import Column, Integer, Float, ForeignKey, UniqueConstraint
from app.database import Base

class CourseSimilarity(Base):
    __tablename__ = "course_similarity"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    course_id_1 = Column(Integer, ForeignKey("courses.course_id"), nullable=False, index=True)
    course_id_2 = Column(Integer, ForeignKey("courses.course_id"), nullable=False, index=True)
    score       = Column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("course_id_1", "course_id_2", name="uq_pair"),
    )
