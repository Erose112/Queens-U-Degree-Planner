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
  has_subplans: boolean;
}

export interface Subplan {
  subplan_id: number;
  subplan_name: string;
  subplan_code: string;
  subplan_credits: number | null;
}

export interface ProgramSection {
  section_id: number;
  program_id: number;
  subplan_id: number | null;
  credit_req: number | null;
  logic_type: number;   // 0 = all required, 1 = choose credits
  section_courses: Course[];
  wildcard: string | null;
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
 *   1 → student must take at least 1 (OR)
 *   N → student must take at least N (AND when N equals group size)
 */
export interface PrereqSet {
  set_id: number;
  min_required: number;
  required_course_ids: number[];
}

/**
 * "required" → red node   (section logic_type = 0, all courses mandatory)
 * "choice"   → yellow node (section logic_type = 1, choose up to credit_req)
 * "prereq"   → grey node  (only appears as a prerequisite, not in any section)
 */
export type NodeType = "required" | "choice" | "prereq";

export interface GraphNode {
  course_id: number;
  course_code: string;
  title: string | null;
  credits: number | null;
  node_type: NodeType;
  description: string | null;
}

/**
 * Directed edge: from_course_id → to_course_id
 * `set_id` lets the frontend group edges that belong to the same AND-group.
 */
export interface GraphEdge {
  from_course_id: number;  /** The prerequisite course */
  to_course_id: number;    /** The course that requires it */
  set_id: number;          /** Which PrereqSet this edge belongs to */
  min_required: number;
}

export interface PrerequisiteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  prerequisite_sets: PrereqSet[];
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
  manuallyPlaced: boolean;
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
 * Fetched once per program when the user selects it.
 */
export type StructureCache = Record<number, ProgramStructure>;