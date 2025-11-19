# Queen's Course Planner

A web application to help Queen's University students plan their course schedules by scraping course data, analyzing prerequisites and exclusions, and generating personalized course plans.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Initial Setup](#initial-setup)
- [Frontend Setup (React + TypeScript)](#frontend-setup-react--typescript)
- [Backend Setup (Python FastAPI)](#backend-setup-python-fastapi)
- [Database Setup (MySQL)](#database-setup-mysql)
- [Scraper Setup](#scraper-setup)
- [Running the Application](#running-the-application)
- [Common Issues](#common-issues)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, make sure you have the following installed on your computer:

### Required Software

1. **Node.js** (v18 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: Open terminal and run `node --version`

2. **Python** (v3.9 or higher)
   - Download from: https://www.python.org/downloads/
   - Verify installation: Run `python --version` or `python3 --version`
   - **Windows users**: Make sure to check "Add Python to PATH" during installation

3. **MySQL** (v8.0 or higher)
   - Download from: https://dev.mysql.com/downloads/mysql/
   - Or use MySQL Workbench: https://dev.mysql.com/downloads/workbench/
   - Alternative: Use XAMPP (includes MySQL): https://www.apachefriends.org/

4. **Git** (for version control)
   - Download from: https://git-scm.com/downloads
   - Verify installation: Run `git --version`

5. **Code Editor** (recommended)
   - VS Code: https://code.visualstudio.com/
   - Extensions to install: ESLint, Prettier, Python

## Project Structure

After setup, your project will look like this:

```
queens-course-planner/
├── frontend/              # React + TypeScript frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API calls
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript type definitions
│   │   ├── utils/         # Helper functions
│   │   ├── context/       # React Context
│   │   └── assets/        # Images, icons
│   ├── package.json
│   └── vite.config.ts
├── backend/               # Python FastAPI backend
│   ├── app/
│   │   ├── main.py        # API entry point
│   │   ├── database.py    # Database connection
│   │   ├── models.py      # Database models
│   │   ├── schemas.py     # Pydantic schemas
│   │   └── routers/       # API routes
│   └── requirements.txt
├── scraper/               # Web scraper
│   ├── scraper.py         # Main scraper
│   ├── parser.py          # Parse course data
│   └── database_loader.py # Load data to DB
├── .env                   # Environment variables
└── README.md              # This file
```

## Initial Setup

### 1. Create Project Directory

**Windows (PowerShell or Command Prompt):**
```bash
cd C:\
mkdir Development
cd Development
mkdir queens-course-planner
cd queens-course-planner
```

**Mac/Linux:**
```bash
mkdir -p ~/Development/queens-course-planner
cd ~/Development/queens-course-planner
```

### 2. Initialize Git Repository (Optional but Recommended)

```bash
git init
```

### 3. Create Environment File

Create a file named `.env` in the root directory:

**Windows:**
```bash
type nul > .env
```

**Mac/Linux:**
```bash
touch .env
```

Add the following content to `.env`:
```
DATABASE_URL=mysql://root:password@localhost:3306/queens_courses
API_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000
```

**Important**: Replace `root:password` with your actual MySQL username and password.

## Frontend Setup (React + TypeScript)

### 1. Create Vite Project

```bash
npm create vite@latest frontend -- --template react-ts
```

### 2. Navigate to Frontend Directory

```bash
cd frontend
```

### 3. Install Dependencies

```bash
# Install base dependencies
npm install

# Install additional packages
npm install react-router-dom axios zustand @tanstack/react-query reactflow react-hook-form lucide-react date-fns

# Install dev dependencies
npm install -D tailwindcss postcss autoprefixer @types/react-router-dom
```

### 4. Initialize Tailwind CSS

```bash
npx tailwindcss init -p
```

Update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Update `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 5. Create Project Structure

**Windows:**
```bash
mkdir src\components src\pages src\services src\hooks src\utils src\context src\assets src\types
```

**Mac/Linux:**
```bash
mkdir -p src/{components,pages,services,hooks,utils,context,assets,types}
```

### 6. Create Environment File

Create `frontend/.env`:

**Windows:**
```bash
type nul > .env
```

**Mac/Linux:**
```bash
touch .env
```

Add:
```
VITE_API_URL=http://localhost:8000
```

### 7. Test Frontend

```bash
npm run dev
```

Visit http://localhost:5173 - you should see the Vite + React welcome page!

Press `Ctrl+C` to stop the server when done.

## Backend Setup (Python FastAPI)

### 1. Navigate Back to Root

```bash
cd ..
# You should now be in queens-course-planner/
```

### 2. Create Backend Directory

```bash
mkdir backend
cd backend
```

### 3. Create Virtual Environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Mac/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` in your terminal prompt.

### 4. Install Python Dependencies

```bash
pip install fastapi uvicorn sqlalchemy pymysql python-dotenv pydantic
```

### 5. Create Requirements File

```bash
pip freeze > requirements.txt
```

### 6. Create Backend Structure

**Windows:**
```bash
mkdir app
cd app
type nul > __init__.py
type nul > main.py
type nul > database.py
type nul > models.py
type nul > schemas.py
type nul > crud.py
mkdir routers
cd routers
type nul > __init__.py
type nul > courses.py
type nul > students.py
type nul > plans.py
cd ..\..
```

**Mac/Linux:**
```bash
mkdir -p app/routers
touch app/{__init__.py,main.py,database.py,models.py,schemas.py,crud.py}
touch app/routers/{__init__.py,courses.py,students.py,plans.py}
```

### 7. Create Basic API Entry Point

Open `app/main.py` and add:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Queen's Course Planner API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Queen's Course Planner API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
```

### 8. Test Backend

```bash
uvicorn app.main:app --reload
```

Visit http://localhost:8000 - you should see `{"message": "Queen's Course Planner API"}`

Visit http://localhost:8000/docs - you should see the FastAPI interactive documentation!

Press `Ctrl+C` to stop the server.

## Database Setup (MySQL)

### 1. Start MySQL

**If using XAMPP:**
- Open XAMPP Control Panel
- Start Apache and MySQL

**If using standalone MySQL:**
- MySQL should be running as a service

### 2. Create Database

Open MySQL Workbench or your MySQL client and run:

```sql
CREATE DATABASE queens_courses;
```

Or from command line:

**Windows:**
```bash
mysql -u root -p
```

**Mac/Linux:**
```bash
mysql -u root -p
```

Then run:
```sql
CREATE DATABASE queens_courses;
USE queens_courses;
```

### 3. Verify Connection

Make sure your `.env` file has the correct database credentials:
```
DATABASE_URL=mysql://root:your_password@localhost:3306/queens_courses
```

## 🕷️ Scraper Setup

### 1. Navigate Back to Root

```bash
cd ..
# You should be in queens-course-planner/
```

### 2. Create Scraper Directory

```bash
mkdir scraper
cd scraper
```

### 3. Create Virtual Environment (if separate from backend)

**If you want to use the same venv as backend:**
- Skip this step, just activate the backend venv

**If you want a separate venv:**
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate
```

### 4. Install Scraper Dependencies

```bash
pip install requests beautifulsoup4 pandas sqlalchemy pymysql python-dotenv lxml
```

### 5. Create Scraper Files

**Windows:**
```bash
type nul > scraper.py
type nul > parser.py
type nul > database_loader.py
```

**Mac/Linux:**
```bash
touch scraper.py parser.py database_loader.py
```

## 🏃Running the Application

### Full Development Setup (3 Terminals)

**Terminal 1 - Frontend:**
```bash
cd C:\Development\queens-course-planner\frontend
npm run dev
```

**Terminal 2 - Backend:**
```bash
cd C:\Development\queens-course-planner\backend
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

uvicorn app.main:app --reload
```

**Terminal 3 - For commands/scraper:**
```bash
cd C:\Development\queens-course-planner\scraper
# Activate venv if separate
# Run scraper when ready
python scraper.py
```

### Access Points

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs


## Helpful Resources

- **Vite Documentation**: https://vitejs.dev/
- **React Documentation**: https://react.dev/
- **TypeScript Documentation**: https://www.typescriptlang.org/docs/
- **FastAPI Documentation**: https://fastapi.tiangolo.com/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **SQLAlchemy**: https://docs.sqlalchemy.org/

## Contributing

This is a student project for Queen's University. If you'd like to contribute:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is for educational purposes.

## Legal Notice

This project scrapes publicly available course data from Queen's University. Please:
- Respect the university's terms of service
- Check `robots.txt` before scraping
- Add delays between requests
- Consider contacting Queen's IT for official data access