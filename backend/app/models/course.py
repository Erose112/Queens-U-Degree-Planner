from sqlalchemy import (
    Column, Integer, String, Text
)
from sqlalchemy.orm import relationship

from app.models.base import Base

class Course(Base):
    """Main course information"""
    __tablename__ = 'courses'

    course_id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200))
    credits = Column(Integer)
    description = Column(Text, name='course_desc')
    clo = Column(Text)  # Course Learning Outcomes

    program_courses = relationship('Program_Courses', back_populates='course')

    # Relationships
    prerequisite_sets = relationship(
        'PrerequisiteSet', 
        back_populates='course',
        cascade='all, delete-orphan')

    exclusions = relationship(
        'Exclusion',
        back_populates='course',
        foreign_keys='Exclusion.course_id',
        cascade='all, delete-orphan'
    )

    def __repr__(self):
        return f"<Course(code='{self.course_code}', title='{self.title}')>"
