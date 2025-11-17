// Course types
export interface Course {
  id: string;
  courseCode: string;
  title: string;
  description: string;
  credits: number;
  department: string;
  level: number;
  prerequisites?: Prerequisite[];
  exclusions?: string[];
  termsOffered?: string[];
}

export interface Prerequisite {
  id: string;
  courseId: string;
  prerequisiteCourseId: string;
  requirementType: 'AND' | 'OR' | 'COREQUISITE';
  rawText?: string;
}

// Student types
export interface Student {
  id: string;
  name: string;
  email: string;
  program: string;
  year: number;
  completedCourses: string[];
  interests: string[];
}

// Course Plan types
export interface CoursePlan {
  id: string;
  studentId: string;
  semesters: Semester[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Semester {
  id: string;
  term: 'Fall' | 'Winter' | 'Summer';
  year: number;
  courses: Course[];
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}