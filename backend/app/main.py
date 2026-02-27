from app.scrapers.course_scraper import scrape_artsci_courses
from app.scrapers.program_scraper import scrape_program_courses
from app.database import write_all_courses_to_mysql
from app.database import write_all_programs_to_mysql


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

#############################
# I'm currently running scrapers and testing db from here. This file should become fast Api start point in future
# To run
# cd backend
# python -m app.main
#all_course_data = scrape_artsci_courses()
all_program_data = scrape_program_courses()

#write_all_courses_to_mysql(all_course_data)
write_all_programs_to_mysql(all_program_data)



app = FastAPI()

origins = [
    "http://localhost.tiangolo.com",
    "https://localhost.tiangolo.com",
    "http://localhost",
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def main():
    return {"message": "Hello World"}