import os
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

from course_scraper import scrape_artsci_courses
from program_scraper import scrape_program_courses

load_dotenv()

# Database connection parameters
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST', 'localhost'),  
    'port': int(os.getenv('DB_PORT', 3306)),  
    'database': os.getenv('DB_NAME')
}

connection_string = (
    f"mysql+pymysql://{DB_CONFIG['user']}:{DB_CONFIG['password']}"
    f"@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
)

engine = create_engine(
    connection_string,
    echo=False,  # Set to True to see SQL queries
    pool_pre_ping=True
)


def write_all_courses_to_mysql():
    all_course_info = scrape_artsci_courses()

    try:
        for idx, degree_df in enumerate(all_course_info):
            try:
                degree_df.to_sql(
                    name='courses',
                    con=engine,
                    if_exists='append',
                    index=False,
                    chunksize=1000
                )
            except SQLAlchemyError as e:
                print(f"Error writing to database: {e}")
                raise

    finally:
        engine.dispose()



def write_all_programs_to_mysql():
    all_program_info = scrape_program_courses()

    try:
        for idx, degree_df in enumerate(all_program_info):
            try:
                degree_df.to_sql(
                    name='programs',
                    con=engine,
                    if_exists='append',
                    index=False,
                    chunksize=1000
                )
            except SQLAlchemyError as e:
                print(f"Error writing to database: {e}")
                raise

    finally:
        engine.dispose()




if __name__ == "__main__":
    write_all_courses_to_mysql()
    write_all_programs_to_mysql()
