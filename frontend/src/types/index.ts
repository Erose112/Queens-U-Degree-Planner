// src/types/index.ts

export const CourseStatus = {
  REQUIRED: 'required',
  CHOICE: 'choice',
  COMPLETED: 'completed',
  IN_PROGRESS: 'in_progress',
  AVAILABLE: 'available',
  LOCKED: 'locked',
} as const;

export type CourseStatus =
  typeof CourseStatus[keyof typeof CourseStatus];


export const ConnectionType = {
  PREREQUISITE: 'prerequisite',
  COREQUISITE: 'corequisite',
  RECOMMENDED: 'recommended',
} as const;

export type ConnectionType = 
  typeof ConnectionType[keyof typeof ConnectionType];


export interface Course {
  id: string;
  code: string;
  name: string;
  units: number;
  year: number;
  position: number;
  status: CourseStatus;
}

export interface CourseChoice {
  id: string;
  label: string;
  year: number;
  position: number;
  status: CourseStatus;
  required: boolean;
  options: Course[];
}

export interface CourseConnection {
  id: string;
  from: string;
  to: string;
  type: ConnectionType;
}

export interface CoursePlan {
  id: string;
  programName: string;
  programCode: string;
  totalUnits: number;
  coreUnits: number;
  optionUnits: number;
  electiveUnits: number;
  courses: Course[];
  choices: CourseChoice[];
  connections: CourseConnection[];
}

// These are the DATA types for your custom nodes
// (not the full Node type - ReactFlow handles that)
// Extend Record<string, unknown> to satisfy @xyflow/react generics
export interface CourseNodeData extends Record<string, unknown> {
  course: Course;
}

export interface CourseChoiceNodeData extends Record<string, unknown> {
  choice: CourseChoice;
}

export interface YearHeaderNodeData extends Record<string, unknown> {
  year: number;
}

/** Data for the vertical year bar segment on the left of the chart */
export interface YearBarNodeData extends Record<string, unknown> {
  year: number;
  /** Height of this year's section in flow units */
  height: number;
}