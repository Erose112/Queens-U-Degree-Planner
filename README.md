# Queen's Course Planner

A web application to help Queen's University students plan their course schedules by scraping course data, analyzing prerequisites and exclusions, and generating personalized course plans.

## Features

- 📚 Browse Queen's University course catalog
- 🔍 Search and filter courses by subject, level, and requirements
- 📊 Visualize prerequisite chains and course dependencies
- 📅 Plan your academic path across multiple semesters
- ✅ Validate course selections against prerequisites and exclusions

## Tech Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python FastAPI
- **Database**: MySQL
- **Web Scraping**: BeautifulSoup4

## Prerequisites

Make sure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.9 or higher) - [Download](https://www.python.org/downloads/)
- **MySQL** (v8.0 or higher) - [Download](https://dev.mysql.com/downloads/mysql/) or use [XAMPP](https://www.apachefriends.org/)
- **Git** - [Download](https://git-scm.com/downloads)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/queens-course-planner.git
cd queens-course-planner
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
# Windows
copy .env.example .env

# Mac/Linux
cp .env.example .env
```

Edit `.env` and update with your MySQL credentials:

```env
DATABASE_URL=mysql://root:your_password@localhost:3306/queens_courses
API_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000
```

**Important**: Replace `your_password` with your actual MySQL password.

### 3. Set Up the Database

Start MySQL (if using XAMPP, start it from the control panel).

Create the database:

```bash
# Windows
mysql -u root -p

# Mac/Linux
mysql -u root -p
```

Then run these SQL commands:

```sql
CREATE DATABASE queens_courses;
USE queens_courses;

-- Create courses table
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    course_code VARCHAR(50) NOT NULL,
    title TEXT,
    credits INTEGER,
    course_desc TEXT,
    clo TEXT
);

-- Create prerequisite sets table
CREATE TABLE prerequisite_sets (
    set_id INTEGER PRIMARY KEY AUTO_INCREMENT,
    course_id INTEGER NOT NULL,
    min_required INTEGER,
    set_description TEXT,
    FOREIGN KEY (course_id) REFERENCES courses(course_id)
);

-- Create prerequisite set courses table
CREATE TABLE prerequisite_set_courses (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    set_id INTEGER NOT NULL,
    required_course_id INTEGER NOT NULL,
    FOREIGN KEY (set_id) REFERENCES prerequisite_sets(set_id),
    FOREIGN KEY (required_course_id) REFERENCES courses(course_id),
    UNIQUE(set_id, required_course_id)
);

-- Create indexes
CREATE INDEX idx_prereq_sets_course ON prerequisite_sets(course_id);
CREATE INDEX idx_prereq_set_courses_set ON prerequisite_set_courses(set_id);
CREATE INDEX idx_prereq_set_courses_required ON prerequisite_set_courses(required_course_id);
```

Type `exit` to leave MySQL.

### 4. Install Dependencies

**Frontend:**

```bash
cd frontend
npm install
cd ..
```

**Backend:**

```bash
# Windows
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Mac/Linux
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Run the Application

You'll need **three separate terminal windows/tabs**:

**Terminal 1 - Frontend:**

```bash
cd frontend
npm run dev
```

**Terminal 2 - Backend:**

```bash
# Windows
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload

# Mac/Linux
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

**Terminal 3 - Scraper (Optional):**

```bash
cd scraper
# Activate venv if needed
python scraper.py
```

### 6. Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Project Structure

```
queens-course-planner/
├── frontend/               # React + TypeScript frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── utils/         # Utility functions
│   └── package.json
├── backend/               # FastAPI backend
│   ├── app/
│   │   ├── routers/       # API route handlers
│   │   ├── main.py        # FastAPI app entry point
│   │   ├── database.py    # Database connection
│   │   ├── models.py      # SQLAlchemy models
│   │   ├── schemas.py     # Pydantic schemas
│   │   └── crud.py        # Database operations
│   └── requirements.txt
├── scraper/               # Web scraping scripts
│   └── scraper.py
└── .env                   # Environment variables (create this)
```

## Common Issues

### Port Already in Use

If you see "port already in use" errors:

- **Frontend (5173)**: Change port in `frontend/vite.config.ts`
- **Backend (8000)**: Run `uvicorn app.main:app --reload --port 8001`
- **MySQL (3306)**: Check if another MySQL instance is running

### MySQL Connection Failed

- Verify MySQL is running
- Check username and password in `.env`
- Ensure database `queens_courses` exists
- Try: `mysql -u root -p` to test connection

### Module Not Found (Python)

Make sure you've activated the virtual environment:

```bash
# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### Module Not Found (Node)

```bash
cd frontend
npm install
```

## API Endpoints

Once the backend is running, visit http://localhost:8000/docs for interactive API documentation.

Key endpoints:
- `GET /api/courses` - Get all courses
- `GET /api/courses/{course_id}` - Get specific course
- `GET /api/courses/{course_id}/prerequisites` - Get prerequisites
- `POST /api/plans` - Create a course plan
- `GET /api/plans/{plan_id}` - Get a specific plan

## Development

### Running Tests

```bash
# Frontend
cd frontend
npm test

# Backend
cd backend
pytest
```

### Code Style

This project uses:
- **Frontend**: ESLint + Prettier
- **Backend**: Black + Flake8

## Contributing

This is a student project for Queen's University. Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Legal Notice

This project scrapes publicly available course data from Queen's University. Please:
- Respect the university's terms of service
- Check `robots.txt` before scraping
- Add appropriate delays between requests
- Consider contacting Queen's IT for official data access

## License

This project is for educational purposes.

## Resources

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [SQLAlchemy](https://docs.sqlalchemy.org/)

## Support

If you encounter any issues:
1. Check the [Common Issues](#common-issues) section
2. Open an issue on GitHub
3. Contact the maintainers