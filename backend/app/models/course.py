from sqlalchemy import (
    Column, Integer, String, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


class Course(Base):
    __tablename__ = 'courses'

    course_id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200))
    credits = Column(Integer)
    description = Column(Text, name='course_desc')
    clo = Column(Text)

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