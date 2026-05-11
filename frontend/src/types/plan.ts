export interface Course {
  course_id: number;
  course_code: string;
  title: string;
  credits: number;
  description: string | null;
  prerequisite_str : string | null;
  // How this course appears in a program:
  //   "required" → red node   (all courses in section mandatory)
  //   "choice"   → yellow node (choose courses to meet credit requirement)
  //   "elective" → green node (optional courses)
  node_type?: NodeType;
}

export interface Program {
  program_id: number;
  program_name: string;
  program_type: string;
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
  credit_req: number;
  logic_type: number;   // 0 = all required, 1 = choose credits
  section_courses: Course[];
  wildcard: string | null;
}

export interface ProgramStructure {
  program_id: number;
  program_name: string;
  program_type: string;
  program_link: string | null;
  total_credits: number;
  num_subplans_required?: number;
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
 * "elective" → green node
 * "user-placed" → green node (if failed prerequisite is manually added in by user)
 */
export type NodeType = "required" | "choice" | "elective" | "user-placed";

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
  nodes: Course[];
  edges: GraphEdge[];
  prerequisite_sets: PrereqSet[];
}

export interface SelectedCourse {
  courseId: number;
  year: 1 | 2 | 3 | 4;
  nodeType: NodeType;
}

export interface CourseNodeData extends Record<string, unknown> {
  course: Course;
  year: number;
  nodeType: NodeType;
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
export type SelectedPrograms = Record<string, ProgramStructure | null>;

/**
 * Lazily-populated cache of ProgramStructure objects keyed by program_id.
 * Fetched once per program when the user selects it.
 */
export type StructureCache = Record<number, ProgramStructure>;