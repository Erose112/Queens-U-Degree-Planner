from sqlalchemy import (
    Column, Float, Integer, String, Text
)
from sqlalchemy.orm import relationship
from app.database import Base


class Course(Base):
    __tablename__ = 'courses'

    course_id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200))
    credits = Column(Float)
    description = Column(Text, name='course_desc')
    clo = Column(Text)
    prerequisite_str = Column(Text)

    # Relationships
    prerequisite_sets = relationship(
        'PrerequisiteSet',
        back_populates='course',
        cascade='all, delete-orphan')
