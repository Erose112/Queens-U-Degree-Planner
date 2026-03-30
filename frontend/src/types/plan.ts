export interface Course {
  course_id: number;
  course_code: string;
  title: string | null;
  credits: number | null;
  description: string | null;
}

export interface Program {
  program_id: number;
  program_name: string;
  program_type: string;
  total_credits: number;
}

export interface CourseSection {
  course_id: number;
  course_code: string;
  title: string | null;
  credits: number | null;
  description: string | null;
  is_required: boolean; /** True → red (required), False → yellow (choice) */
}

export interface ProgramSection {
  section_id: number;
  section_name: string;
  credit_req: number;
  logic_type: number;
  courses: CourseSection[];
}

export interface ProgramStructure {
  program_id: number;
  program_name: string;
  program_type: string;
  total_credits: number;
  sections: ProgramSection[];
}

/**
 * One AND-group for a course. `min_required` controls within-set logic:
 *   null → student must take ALL courses in this set
 *   1    → student must take at least 1 (OR)
 *   N    → student must take at least N
 */
export interface PrereqSet {
  set_id: number;
  min_required: number;
  required_course_ids: number[];
}

/** "required" → red node   (is_required=true in section_courses)
 *  "choice"   → yellow node (is_required=false)
 *  "prereq"   → grey node  (only appears as a prerequisite, not in any section) */
export type NodeType = "required" | "choice" | "prereq";

export interface GraphNode {
  course_id: number;
  course_code: string;
  title: string | null;
  credits: number | null;
  node_type: NodeType;
}

/**
 * Directed edge: from_course_id → to_course_id
 * `set_id` lets the frontend group edges that belong to the same AND-group.
 */
export interface GraphEdge {
  from_course_id: number; /** The prerequisite course */
  to_course_id: number; /** The course that requires it */
  set_id: number;  /** Which PrerequisiteSet this edge belongs to */
  min_required: number;
}

export interface PrerequisiteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  prerequisite_sets: PrereqSet[]; /** Full set metadata so the frontend can render OR/AND labels on edge groups */
}


export interface SelectedCourse {
  courseId: number;
  year: 1 | 2 | 3 | 4;
  addedBy: "user" | "autofill";
}


export interface CourseNodeData extends Record<string, unknown> {
  graphNode: GraphNode;
  year: number;
  incomingIds: number[];
  outgoingIds: number[];
  manuallyPlaced: boolean; // True if the course was explicitly placed by the user (vs auto-placed by prereq logic)
}

export interface YearSection {
  year: number;
  y: number;
  height: number;
}


/** Slot key → selected Program (null = nothing chosen yet). */
export type SelectedPrograms = Record<string, Program | null>;

/**
 * Lazily-populated cache of ProgramStructure objects keyed by program_id.
 * Fetched once per program when the user selects it; avoids loading
 * every structure upfront.
 */
export type StructureCache = Record<number, ProgramStructure>;