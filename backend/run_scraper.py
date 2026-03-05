from app.scrapers.course_scraper import scrape_artsci_courses
from app.services.course_writer import write_all_courses_to_mysql
from app.scrapers.program_scraper import scrape_program_courses
from app.services.program_writer import write_all_programs_to_mysql

# Run scraper during offtime hours
# Note: The scraper takes time to properly scrape all programs and courses
def run(rc, rp):
    if rc:
        course_df = scrape_artsci_courses()
        write_all_courses_to_mysql(course_df)

    if rp:
        program_df = scrape_program_courses()
        write_all_programs_to_mysql(program_df)

if __name__ == "__main__":
    run_courses=False
    run_programs=True
    run(run_courses, run_programs)
