# Run with set PYTHONPATH=. && python create_tables.py
# Creates tables if not found
try:
    from app.database import engine, Base
    from app.models import course, prerequisite, exclusion, program, course_similarity

    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
