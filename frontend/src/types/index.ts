import type { CourseStatus } from "../services/api";
export type { CourseStatus };

export interface Course {
  id: string;
  code: string;
  name: string;
  units: number;
  year: number;
  position: number;
  status: CourseStatus;
}

export interface CourseConnection {
  id: string;
  from_course: string;
  to_course: string;
}

export interface CoursePlan {
  id: string;
  programName: string;
  secondProgramName?: string;
  programCode: string;
  totalUnits: number;
  coreUnits: number;
  electiveUnits: number;
  courses: Course[];
  connections: CourseConnection[];
}

export interface CourseNodeData extends Record<string, unknown> {
  course: Course;
  incomingIds: string[];
  outgoingIds: string[];
}

export interface YearSection {
  year: number;
  y: number;
  height: number;
}