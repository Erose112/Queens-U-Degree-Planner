from sqlalchemy import (
    Column, Integer, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from app.models.base import Base


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
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Program(section_id='{self.section_id}')>"



class Section_Courses (Base):
    __tablename__ = "section_courses"

    sc_id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey('program_section.section_id'))
    course_id = Column(Integer, ForeignKey('courses.course_id'))

    section = relationship("Program_Section", back_populates="section_courses")
    course = relationship("Course")  # One-way relationship to Course
    
    logic_rules = relationship(
        "Program_Section_Logic",
        back_populates="section_course",
        cascade="all, delete-orphan"
    )


class Program_Section_Logic(Base):
    __tablename__ = "program_section_logic"

    logic_id = Column(Integer, primary_key=True, autoincrement=True)
    section_id = Column(Integer, ForeignKey('program_section.section_id'))
    sc_id = Column(Integer, ForeignKey('section_courses.sc_id'))
    logic_type = Column(Integer)
    logic_value = Column(Integer)

    section = relationship("Program_Section", back_populates="logic_rules")
    section_course = relationship("Section_Courses", back_populates="logic_rules")

    def __repr__(self):
        return f"<Program_Section_Logic(logic_id={self.logic_id}, section_id={self.section_id}, logic_type={self.logic_type})>"