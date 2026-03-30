# Run with set PYTHONPATH=. && python create_tables.py
# Recreates tables based on current models. Use with caution (will delete existing data).
try:
    from app.database import engine, Base
    from app.models import course, prerequisite, program, course_similarity

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
