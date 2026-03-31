# Queen's Degree Planner

A full-stack web application designed to help Queen's University students plan their academic paths by providing intelligent course scheduling, prerequisite validation, and degree planning tools.

## 🎯 Project Overview

This project has a complete backend implementation with thoughtful database design and RESTful API architecture. It solves a real problem for students: navigating Queen's complex prerequisite chains and course dependencies across a 4-year degree.

### Why This Project?

- **Real-world problem**: Queen's students struggle to find valid course sequences
- **Complex data**: Handles prerequisites and program requirements
- **Generates Recommendations**: Finds interesting electives based on chosen courses


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
- Semester offered (Fall/Winter/Spring)
- Year level (1-4)

**Prerequisites**
- Supports complex prerequisite chains
- Normalized to prevent data duplication
- Enables efficient prerequisite validation via tree traversal

**Programs**
- Program requirements (e.g., COMA-P-BCH)
- Required vs. elective course groups
- Core unit requirements


## Frontend UI (In Development)

**Degree Planning Dashboard**

![Degree Planner Dashboard](./screenshots/degree-planner-ui.png)

### Features
- Interactive semester planner
- Real-time prerequisite validation
- Visual degree progress
- Course availability calendar


## 📚 Technical Highlights

### Clean Code Principles
- ✅ Single responsibility principle (separate routers for each resource)
- ✅ Type safety (Full TypeScript frontend, typed Python with type hints)
- ✅ Error handling (Custom exception classes, proper HTTP status codes)

### API Design
- ✅ RESTful conventions (proper HTTP methods and status codes)
- ✅ Resource-based URL structure
- ✅ Pagination support for large datasets
- ✅ Comprehensive error messages

### Database Efficiency
- ✅ Strategic indexing on frequently queried columns
- ✅ Normalized schema to minimize storage and update complexity
- ✅ Foreign key constraints for data integrity
- ✅ Connection pooling for production readiness

## ⚖️ Legal & Attribution

This project scrapes publicly available course data from Queen's University for educational purposes. The project:
- Respects `robots.txt` guidelines
- Implements request delays to avoid server strain
- Is non-commercial and educational in nature

**Data Source**: Queen's University Course Calendar

## 📝 License

This project is for educational and portfolio purposes.



## 👤 Author

**Ethan Rose**
- Email: ethan.rose.to@gmail.com


## Acknowledgments

- Queen's University for publicly available course data
- FastAPI framework for excellent documentation and developer experience
- The open-source community for amazing tools and libraries

---

**Last Updated**: January 2025  
**Current Version**: 0.2.0-beta