const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const CourseStatus = {
  REQUIRED:  "required",
  COMPLETED: "completed",
  ELECTIVE:  "elective",
} as const;

export type CourseStatus = typeof CourseStatus[keyof typeof CourseStatus];


export interface Program {
  program_id: number;
  program_name: string;
  program_type: string;
}

export async function getPrograms(): Promise<Program[]> {
  const res = await fetch(`${API_BASE}/programs/`);
  if (!res.ok) throw new Error("Failed to fetch programs");
  return res.json();
}

export interface APICourse {
  course_id: number;
  course_code: string;
  title: string;
  description: string | null;
  units: number | null;
}

export async function getCourses(): Promise<APICourse[]> {
  const res = await fetch(`${API_BASE}/courses/`);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

export interface PlanRequest {
  program_name: string;
  second_program_name?: string;
  completedCourses: string[];
  favouriteCourses: string[];
  interestedCourses: string[];
}

export interface APICourseNode {
  course_code: string;
  title: string;
  units: number | null;
  year: number;
  course_type: CourseStatus;
}

export interface APICourseEdge {
  from_course: string;
  to_course: string;
}

export interface PlanResponse {
  program_name: string;
  second_program_name?: string;
  program_code: string;
  total_units: number;
  core_units: number;
  elective_units: number;
  courses: APICourseNode[];
  edges: APICourseEdge[];
}

// TypeScript interfaces for API response data
export interface CourseData {
  course_code?: string;
  title?: string;
  units?: number | null;
  year?: number | null;
  semester?: string | null;
  course_status?: CourseStatus | null;
}

export interface EdgeData {
  from_course?: string;
  to_course?: string;
}

export interface PlanResponseData {
  program_name?: string;
  program_code?: string;
  total_units?: number;
  core_units?: number;
  elective_units?: number;
  courses?: CourseData[];
  edges?: EdgeData[];
}