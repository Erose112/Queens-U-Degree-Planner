# Queen's Degree Planner

A full-stack web application designed to help Queen's University students plan their academic paths by providing intelligent course scheduling, prerequisite validation, and degree planning tools.

## 🎯 Project Overview

This project aggregates course and program data from multiple Queen’s University sources, helping students navigate complex prerequisite chains and course dependencies throughout a 4-year degree.

## ✨ Key Features

### Currently Implemented
- RESTful API for course and program data retrieval
- Prerequisite chain validation
- Program requirement tracking
- Interactive course planning dashboard
- Drag-and-drop semester scheduling

### In Development
- Visual UI changes 
- Validation of course and program data
- Recommended electives generation
- Saving plan chart as PDF


## 🏗️ Architecture Overview

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React + TypeScript + Vite | React 18+ |
| **Backend** | Python FastAPI | 0.104+ |
| **Database** | MySQL | 8.0+ |
| **HTTP** | RESTful API | JSON |


## 🗄️ Database Design

### Core Tables

**Courses**
- Course code, title, description, credit weight

**Prerequisites**
- Supports complex prerequisite chains
- Normalized to prevent data duplication
- Enables efficient prerequisite validation via tree traversal

**Programs**
- Stores program requirements
- Handles required vs. elective sections
- Tracks core unit requirements

**Subplans**
- Offsets of main program requirements


## Frontend UI (In Development)

**Degree Planning Dashboard**

![Degree Planner Dashboard](./screenshots/degree-planner-ui.png)

### Features
- Interactive semester planner
- Real-time prerequisite validation
- Visual degree progress

## 📚 Technical Highlights

### Clean Code Principles
- ✅ Single responsibility principle (separate routers for each resource)
- ✅ Type safety (Full TypeScript frontend, typed Python with type hints)
- ✅ Error handling (Custom exception classes, proper HTTP status codes)

### API Design
- ✅ RESTful conventions (proper HTTP methods and status codes)
- ✅ Resource-based URL structure
- ✅ Comprehensive error messages

### Database Efficiency
- ✅ Strategic indexing on frequently queried columns
- ✅ Normalized schema to minimize storage and update complexity
- ✅ Foreign key constraints for data integrity

## ⚖️ Legal & Attribution

This project scrapes publicly available course data from Queen's University for educational purposes. The project:
- Respects `robots.txt` guidelines
- Implements request delays to avoid server strain
- Is non-commercial and educational in nature

**Data Source**: Queen's University Course Calendar

## 📝 License

This project is licensed under the MIT License.

## 👤 Author

**Ethan Rose**
- Email: ethan.rose.to@gmail.com

---

**Last Updated**: March 2025  
**Current Version**: 0.2.0-beta