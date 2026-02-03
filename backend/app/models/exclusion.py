from sqlalchemy import (
    Column, Integer, ForeignKey, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class Exclusion(Base):
    """
    Links a course to another course it excludes (or is excluded by).
    one_way: if True, only "this course excludes the other"; if False, mutual exclusion.
    """
    __tablename__ = "exclusions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey('courses.course_id'), nullable=False)
    excluded_course_id = Column(Integer, ForeignKey('courses.course_id'), nullable=False)
    one_way = Column(Integer, nullable=False, default=0)  # 0 = mutual, 1 = one-way

    __table_args__ = (UniqueConstraint('course_id', 'excluded_course_id', name='uq_exclusion_pair'),)

    # Relationships
    course = relationship(
        "Course",
        back_populates="exclusions",
        foreign_keys=[course_id]
    )
    excluded_course = relationship("Course", foreign_keys=[excluded_course_id])

    def __repr__(self):
        return (
            f"<Exclusion(course_id={self.course_id}, "
            f"excluded_course_id={self.excluded_course_id}, one_way={self.one_way})>"
        )
