"""Shared SQLAlchemy declarative base so all models use the same mapper registry."""
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()
