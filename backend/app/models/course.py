from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()


class Course(Base):
    """Main course information"""
    __tablename__ = 'courses'
    
    course_id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200))
    credits = Column(Integer)
    description = Column(Text)
    clo = Column(Text)  # Course Learning Outcomes
    
    # Relationships
    prerequisite_sets = relationship('PrerequisiteSet', back_populates='course', 
                                    cascade='all, delete-orphan')
    exclusions = relationship('Exclusion', back_populates='course',
                             foreign_keys='Exclusion.course_id',
                             cascade='all, delete-orphan')
    
    def __repr__(self):
        return f"<Course(code='{self.course_code}', title='{self.title}')>"



class PrerequisiteSet(Base):
    """
    A logical set of prerequisites for a course.
    min_required:
      - NULL → ALL required (AND)
      - 1    → OR
      - 2+   → at least N courses
    """
    __tablename__ = "prerequisite_sets"

    set_id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey('courses.course_id'), nullable=False)
    min_required = Column(Integer, nullable=True)
    set_description = Column(Text)

    # Relationships
    course = relationship("Course", back_populates="prerequisite_sets")

    required_courses = relationship(
        "PrerequisiteSetCourse",
        back_populates="prerequisite_set",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<PrerequisiteSet(course_id={self.course_id}, "
            f"min_required={self.min_required})>"
        )




class PrerequisiteSetCourse(Base):
    """
    Join table linking prerequisite sets to the required courses.
    """
    __tablename__ = "prerequisite_set_courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    set_id = Column(Integer, ForeignKey('prerequisite_sets.set_id'), nullable=False)
    required_course_id = Column(Integer, ForeignKey('courses.course_id'), nullable=False)

    __table_args__ = (
        UniqueConstraint('set_id', 'required_course_id'),
    )

    # Relationships
    prerequisite_set = relationship("PrerequisiteSet", back_populates="required_courses")
    required_course = relationship("Course")

    def __repr__(self):
        return (
            f"<PrerequisiteSetCourse(set_id={self.set_id}, "
            f"required_course_id={self.required_course_id})>"
        )

