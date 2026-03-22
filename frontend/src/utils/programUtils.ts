import { getPrerequisiteGraph, getProgramStructure, getPrograms } from "../services/programs";
import { CourseSection, PrerequisiteGraph, ProgramSection, ProgramStructure } from "../types/program";

export const LOGIC_REQUIRED = 1;       // All courses in the section are mandatory
export const LOGIC_CHOOSE_CREDITS = 2; // Student can choose from a set of courses to meet the credit requirement
export const YEAR_CREDIT_CAP = 30;

const programs = await getPrograms();
const programId = programs[0]?.program_id;
const structureJson = await getProgramStructure(programId);
const graphJson = await getPrerequisiteGraph(programId);

const structure = structureJson as unknown as ProgramStructure;
const graph     = graphJson    as unknown as PrerequisiteGraph;


export interface SelectedCourse {
  courseId: number;
  year: 1 | 2 | 3 | 4;
  addedBy: "user" | "autofill";
}

/** All course IDs that appear as an edge target (i.e. have at least one prereq). */
export function coursesWithPrereqs(): number[] {
  return [...new Set(graph.edges.map((e) => e.to_course_id))];
}

/** All course IDs in the graph that appear in NO edge (no prereqs at all). */
export function coursesWithNoPrereqs(): number[] {
  const hasPrereq = new Set(graph.edges.map((e) => e.to_course_id));
  return graph.nodes
    .map((n) => n.course_id)
    .filter((id) => !hasPrereq.has(id));
}

/** All course IDs that belong to at least one program section. */
export function coursesInSections(): number[] {
  return structure.sections.flatMap((s) => s.courses.map((c) => c.course_id));
}

/**
 * Build a minimal selection of course IDs that satisfies a section's logic rule.
 * Returns null if the section cannot be satisfied by any combination of its courses.
 */
export function buildSatisfyingSelection(section: ProgramSection): number[] | null {

  if (section.logic_type === 1) {
    // LOGIC_REQUIRED: all courses
    return section.courses.map((c) => c.course_id);
  }

  // LOGIC_CHOOSE_CREDITS: accumulate until credit_req is met
  const target = section.credit_req ?? 0;
  let accumulated = 0;
  const selected: number[] = [];
  for (const course of section.courses) {
    if (accumulated >= target) break;
    accumulated += course.credits ?? 0;
    selected.push(course.course_id);
  }
  return accumulated >= target ? selected : null;
}

/** All CourseSection objects across all sections (flat). */
export const allCourses: CourseSection[] = structure.sections.flatMap((s) => s.courses);