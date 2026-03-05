from sqlalchemy import (
    Column, Integer, Text, ForeignKey
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

    section_id = Column(Integer, primary_key=True, autoincrement=True)
    program_id = Column(Integer, ForeignKey('programs.program_id'))
    credit_req = Column(Integer)

    program = relationship("Program", back_populates="sections")

    section_courses = relationship(
        "Section_Courses",
        back_populates="section",
        cascade="all, delete-orphan"
    )

    logic_rules = relationship(
        "Program_Section_Logic",
        back_populates="section",
        cascade="all, delete-orphan",
        foreign_keys="Program_Section_Logic.section_id",
    )

    def __repr__(self):
        return f"<Program_Section(section_id='{self.section_id}')>"


class Section_Courses(Base):
    __tablename__ = "section_courses"

    section_id = Column(Integer, ForeignKey('program_section.section_id'), primary_key=True)
    course_id = Column(Integer, ForeignKey('courses.course_id'), primary_key=True)

    section = relationship("Program_Section", back_populates="section_courses")
    course = relationship("Course")  # One-way relationship to Course


class Program_Section_Logic(Base):
    # logic_type: 0 = "complete all of the following"
    # logic_type: 1 = "complete N of the following"
    # logic_value: N
    __tablename__ = "program_section_logic"

    logic_id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey('program_section.section_id'))
    logic_type = Column(Integer)
    logic_value = Column(Integer)

    section = relationship(
        "Program_Section",
        back_populates="logic_rules",
        foreign_keys=[section_id],
    )

    def __repr__(self):
        return (
            f"<Program_Section_Logic("
            f"logic_id={self.logic_id}, "
            f"section_id={self.section_id}, "
            f"logic_type={self.logic_type})>"
        )
