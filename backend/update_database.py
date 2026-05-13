from app.scrapers.course_scraper import scrape_artsci_courses
from app.services.course_writer import write_all_courses_to_mysql
from app.scrapers.program_scraper import scrape_program_courses
from app.services.program_writer import write_all_programs_to_mysql
from app.services.recommendation_writer import precompute_all_similarities
from app.scrapers.program_link_scraper import scrape_program_links

# Runs scrapers and updates MySQL database with new course and program data, and precomputes recommendations.
# Note: The scraper takes time to properly scrape all programs and courses
def run(pl, rc, rp, wr):
    if pl:
        scrape_program_links()
    if rc:
        course_df = scrape_artsci_courses()
        write_all_courses_to_mysql(course_df)

    if rp:
        program_df = scrape_program_courses()
        write_all_programs_to_mysql(program_df)

    if wr:
        precompute_all_similarities()

if __name__ == "__main__":
    get_program_links=False
    run_courses=False
    run_programs=True
    write_recommendations=False
    run(get_program_links, run_courses, run_programs, write_recommendations)
