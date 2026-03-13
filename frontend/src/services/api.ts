const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Programs 
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

// Courses 
export interface Course {
  course_id: number;
  course_code: string;
  title: string;
  description: string | null;
  units: number | 3;
}

export async function getCourses(): Promise<Course[]> {
  const res = await fetch(`${API_BASE}/courses/`);
  if (!res.ok) throw new Error("Failed to fetch courses");
  return res.json();
}

// Plan 
export interface PlanRequest {
  program_name: string;
  second_program_name?: string;
  completedCourses: string[];
  favouriteCourses: string[];
  interestedCourses: string[];
}

export interface CourseNode {
  course_code: string;
  title: string;
  units: number | 3;
  year: number;
  is_required: boolean;
}

export interface CourseEdge {
  from_course: string;
  to_course: string;
  edge_type: string;
}

export interface ChoiceOption {
  course_code: string;
  title: string;
  units: number | null;
}

export interface ChoiceNode {
  choice_id: string;
  label: string;
  year: number;
  position: number;
  required: boolean;
  options: ChoiceOption[];
}

export interface PlanResponse {
  program_name: string;
  program_code: string;
  total_units: number;
  core_units: number;
  option_units: number;
  elective_units: number;
  courses: CourseNode[];
  choices: ChoiceNode[];
  edges: CourseEdge[];
}

export async function generatePlan(payload: PlanRequest): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/plans/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Server error ${res.status}`);
  }

  return res.json();
}