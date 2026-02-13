"""
This file contains the logic for generating recommendations for courses and programs. 
Taken two courses and course information, it generates a recommendation score for course compatibility.
"""

from app.models.course import Course

def generate_course_recommendation(course1: Course, course2: Course) -> float:
    return 0.0