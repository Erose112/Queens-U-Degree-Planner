"""
Generates a recommendation score between two courses. 
Recommendation score encompases how closely related two courses are.
"""
from __future__ import annotations
from typing import TYPE_CHECKING, List

import numpy as np

from app.models.course import Course

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

# Weights for the combined recommendation score
W_SEMANTIC = 0.9
W_LEVEL = 0.1
model = None

# Internal cache keyed only on course_code
embedding_cache: dict[str, np.ndarray] = {}


def get_model():
    global model
    if model is None:
        from sentence_transformers import SentenceTransformer  # lazy
        model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return model


def build_course_text(course: Course) -> str:
    parts: List[str] = []
    if course.course_code:
        parts.append(str(course.course_code))
    if course.title:
        parts.append(str(course.title))
    if course.description:
        parts.append(str(course.description))
    if course.clo:
        clo_text = course.clo if isinstance(course.clo, str) else " ".join(course.clo)
        parts.append(clo_text)
    return ". ".join(part.strip() for part in parts if part)


def extract_level(code: str) -> int | None:
    digits = "".join(ch for ch in code if ch.isdigit())
    if not digits:
        return None
    return int(digits[0])


def get_course_embedding(course_code: str, course_text: str) -> np.ndarray:
    if course_code and course_code in embedding_cache:
        return embedding_cache[course_code]
    embedding = get_model().encode([course_text])[0]
    if course_code:
        embedding_cache[course_code] = embedding
    return embedding


def level_score(course1: Course, course2: Course) -> float:
    code1 = (course1.course_code or "").upper()
    code2 = (course2.course_code or "").upper()
    level1 = extract_level(code1)
    level2 = extract_level(code2)
    if level1 is None or level2 is None:
        return 0.0
    diff = abs(level1 - level2)
    return float(max(0.0, 1.0 - 0.25 * diff))


def combined_score(semantic_sim: float, lvl_score: float) -> float:
    raw = W_SEMANTIC * semantic_sim + W_LEVEL * lvl_score
    return float(min(1.0, max(0.0, raw)))


def generate_course_recommendation(course1: Course, course2: Course) -> float:
    from sklearn.metrics.pairwise import cosine_similarity  # lazy

    text1 = build_course_text(course1)
    text2 = build_course_text(course2)
    emb1 = get_course_embedding(course1.course_code or "", text1)
    emb2 = get_course_embedding(course2.course_code or "", text2)
    semantic_sim = float(cosine_similarity([emb1], [emb2])[0][0])
    lvl_score = level_score(course1, course2)
    return combined_score(semantic_sim, lvl_score)
