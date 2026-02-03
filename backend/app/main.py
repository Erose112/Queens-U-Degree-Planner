from app.scrapers.course_scraper import scrape_artsci_courses
from app.scrapers.program_scraper import scrape_program_courses
from app.database import write_all_courses_to_mysql
from app.database import write_all_programs_to_mysql


all_course_data = scrape_artsci_courses()
###all_program_data = scrape_program_courses()

write_all_courses_to_mysql(all_course_data)
###write_all_programs_to_mysql(all_program_data)