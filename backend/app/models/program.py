from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class Program(Base):
    __tablename__ = "programs"

    