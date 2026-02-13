from sqlalchemy import (
    Column, Integer, Text, ForeignKey
)
from sqlalchemy.orm import relationship

from app.models.base import Base

class Program(Base):
    __tablename__ = "programs"

    program_id = Column(Integer, primary_key=True, autoincrement=True)
    program_name = Column(Text, name='program_name')

    courses = relationship('Program_Courses', back_populates='programs')

    def __repr__(self):
        return f"<Program(program_name='{self.program_name}')>"



class Program_Courses(Base):
    __tablename__ = "program_courses"

    program_id = Column('program_id', Integer, ForeignKey('programs.program_id'), primary_key=True)
    course_id = Column('course_id', Integer, ForeignKey('courses.course_id'), primary_key=True)

    programs = relationship('Program', back_populates='courses')
    course = relationship('Course', back_populates='program_courses')

    def __repr__(self):
        return f"<Program(course_id='{self.course_id}')>"
