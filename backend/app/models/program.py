from sqlalchemy import (
    Column, Integer, PrimaryKeyConstraint, Text, ForeignKey, String, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


class Program(Base):
    __tablename__ = "programs"

    program_id    = Column(Integer, primary_key=True, autoincrement=True)
    program_code  = Column(String(15), unique=True, nullable=False)
    program_name  = Column(Text, nullable=False)
    program_type  = Column(Text, nullable=False)
    program_link  = Column(Text, nullable=True)
    total_credits = Column(Integer, nullable=False)
    num_subplans_required  = Column(Integer, default=0, nullable=False)

    sections = relationship(
        "Program_Section",
        back_populates="program",
        cascade="all, delete-orphan",
        foreign_keys="Program_Section.program_id",
    )
    subplans = relationship(
        "Subplan",
        back_populates="program",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Program(program_name='{self.program_name}')>"


class Subplan(Base):
    __tablename__ = "subplans"

    subplan_id      = Column(Integer, primary_key=True, autoincrement=True)
    program_id      = Column(Integer, ForeignKey("programs.program_id"), nullable=False)
    subplan_code    = Column(String(15), nullable=False)
    subplan_name    = Column(String(100), nullable=False)
    subplan_credits = Column(Integer)

    __table_args__ = (
        UniqueConstraint("program_id", "subplan_code", name="uq_subplan_program_code"),
    )

    program  = relationship("Program", back_populates="subplans")
    sections = relationship(
        "Program_Section",
        back_populates="subplan",
        cascade="all, delete-orphan",
        foreign_keys="Program_Section.subplan_id",
    )


class Program_Section(Base):
    __tablename__ = "program_section"

    section_id   = Column(Integer, primary_key=True, autoincrement=True)
    program_id   = Column(Integer, ForeignKey("programs.program_id"), nullable=False)
    # NULL when this section belongs to the top-level program; set when it belongs to a subplan
    subplan_id   = Column(Integer, ForeignKey("subplans.subplan_id"), nullable=True)
    credit_req   = Column(Integer)       # 0 when logic_type=0, otherwise the credit target
    logic_type   = Column(Integer, nullable=False)  # 0=required, 1=choose credits
    wildcard     = Column(String(200), nullable=True)  # e.g. "ECON at the 300-level or above"

    program = relationship(
        "Program",
        back_populates="sections",
        foreign_keys=[program_id],
    )
    subplan = relationship(
        "Subplan",
        back_populates="sections",
        foreign_keys=[subplan_id],
    )
    section_courses = relationship(
        "Section_Courses",
        back_populates="section",
        cascade="all, delete-orphan",
    )


class Section_Courses(Base):
    __tablename__ = "section_courses"

    section_id  = Column(Integer, ForeignKey("program_section.section_id"))
    course_id   = Column(Integer, ForeignKey("courses.course_id"))

    __table_args__ = (
        PrimaryKeyConstraint("section_id", "course_id"),
    )

    section = relationship("Program_Section", back_populates="section_courses")
    course  = relationship("Course")
