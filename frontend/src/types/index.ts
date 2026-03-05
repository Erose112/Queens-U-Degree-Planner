// src/types/index.ts


export const CourseStatus = {
  REQUIRED: 'required',
  CHOICE: 'choice',
  SELECTED_ELECTIVE: 'selected_elective',
  COMPLETED: 'completed',
  AVAILABLE: 'available',
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
  from_course: string;
  to_course: string;
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

// Extend Record<string, unknown> to satisfy @xyflow/react generics
export interface CourseNodeData extends Record<string, unknown> {
  course: Course;
  incomingIds: string[];  // IDs of nodes that connect TO this node
  outgoingIds: string[];  // IDs of nodes this node connects TO
}

export interface CourseChoiceNodeData extends Record<string, unknown> {
  choice: CourseChoice;
  incomingIds: string[];
  outgoingIds: string[];
}

export interface YearSection {
  year: number;   // e.g. 1, 2, 3, 4
  y: number;      // the Y pixel position of this row in the ReactFlow canvas
  height: number; // the height of this row in pixels
}