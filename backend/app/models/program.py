from sqlalchemy import (
    Column, Integer, Text, ForeignKey, String
)
from sqlalchemy.orm import relationship
from app.database import Base


class Program(Base):
    __tablename__ = "programs"

    program_id = Column(Integer, primary_key=True, autoincrement=True)
    program_name = Column(Text)
    program_type = Column(Text)
    total_credits = Column(Integer)

    sections = relationship(
        "Program_Section",
        back_populates="program",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Program(program_name='{self.program_name}')>"


class Program_Section(Base):
    __tablename__ = "program_section"

    section_id   = Column(Integer, primary_key=True, autoincrement=True)
    program_id   = Column(Integer, ForeignKey('programs.program_id'))
    section_name = Column(String(100), nullable=False)
    credit_req   = Column(Integer)                  # 0 when logic_type=1, otherwise the credit requirement for the section
    logic_type   = Column(Integer, nullable=False)  # 1=required, 2=choose credits

    program = relationship("Program", back_populates="sections")
    section_courses = relationship(
        "Section_Courses",
        back_populates="section",
        cascade="all, delete-orphan"
    )


class Section_Courses(Base):
    __tablename__ = "section_courses"

    section_id = Column(Integer, ForeignKey('program_section.section_id'), primary_key=True)
    course_id = Column(Integer, ForeignKey('courses.course_id'), primary_key=True)
    is_required = Column(Integer, default=1)   # 1=required(red), 0=choice(yellow)

    section = relationship("Program_Section", back_populates="section_courses")
    course = relationship("Course")  # One-way relationship to Course
