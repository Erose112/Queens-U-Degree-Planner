from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

# database config
DB_CONFIG = {
    "user":     os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host":     os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT") or 3306),
    "database": os.getenv("DB_NAME"),
}

engine = create_engine(
    f"mysql+pymysql://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
    f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}",
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


# Create singular one declarative base used in models
class Base(DeclarativeBase):
    pass



def get_db():
    """
    FastAPI dependency that yields one session per request, always closes it.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
