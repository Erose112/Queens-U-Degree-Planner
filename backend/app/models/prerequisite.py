from sqlalchemy import (
    Column, Integer, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base



class PrerequisiteSet(Base):
    """
    One “requirement group” for a course. Multiple sets for the same course
    mean AND: the student must satisfy set1 AND set2 AND …

    set_id: Unique identifier for this set
    course_id: The course that has these prerequisites
    min_required:
      - NULL → must take ALL courses in this set (AND within set)
      - 1    → must take at least 1 course in this set (OR within set)
      - 2+   → must take at least N courses in this set

    Example: "CSC148 AND (CSC165 OR CSC240)" → two sets: one with [CSC148],
    one with [CSC165, CSC240] and min_required=1.
    """
    __tablename__ = "prerequisite_sets"

    set_id = Column(Integer, primary_key=True, autoincrement=True)
    course_id = Column(Integer, ForeignKey('courses.course_id'), nullable=False, index=True)
    min_required = Column(Integer, nullable=True)

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

    id: The unique identifier for the prerequisite set course
    set_id: The prerequisite set that the course is required for
    required_course_id: The course that is required for the prerequisite set
    """
    __tablename__ = "prerequisite_set_courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    set_id = Column(Integer, ForeignKey('prerequisite_sets.set_id'), nullable=False, index=True)
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
