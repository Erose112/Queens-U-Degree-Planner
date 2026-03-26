import { getPrograms, getProgramStructure } from "../services/api";
import { PrerequisiteGraph, ProgramSection, ProgramStructure, SelectedCourse } from "../types/plan";
import { LOGIC_REQUIRED } from "./program";

const programs = await getPrograms();
const programId = programs[0]?.program_id;
const structureJson = await getProgramStructure(programId);

const structure = structureJson as unknown as ProgramStructure;


// Internal helpers
/** Look up a course's credits from the graph; defaults to 0 if not found. */
export function getCourseCredits(courseId: number, graph: PrerequisiteGraph): number {
  return graph.nodes.find((n) => n.course_id === courseId)?.credits ?? 0;
}

/** Total credits already in the plan. */
export function getPlanCredits(
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): number {
  return plan.reduce((sum, p) => sum + getCourseCredits(p.courseId, graph), 0);
}

/** Credits placed in a specific year. */
export function getYearCredits(
  year: 1 | 2 | 3 | 4,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): number {
  return plan
    .filter((p) => p.year === year)
    .reduce((sum, p) => sum + getCourseCredits(p.courseId, graph), 0);
}

/** Credits already used within the program section that owns this course. */
export function getSectionCredits(
  sectionId: number,
  plan: SelectedCourse[],
  programs: ProgramStructure[]
): number {
  const section = programs.flatMap(p => p.sections).find(
    (s) => s.section_id === sectionId
  );
  if (!section) return 0;
  const creditMap = new Map(
    section.courses.map((c) => [c.course_id, c.credits ?? 0])
  );
  return plan
    .filter((p) => creditMap.has(p.courseId))
    .reduce((sum, p) => sum + creditMap.get(p.courseId)!, 0);
}


// Public API
/**
 * Find a section that can be overfilled:
 * Returns a section whose courses have enough combined credits that
 * selecting all of them would exceed credit_req, along with an
 * ordered list of courses to add and the one that tips it over.
 */
export function findOverfillableSection(): {
  section: ProgramSection;
  fillWith: number[];
  overflow: number;
} | null {
  for (const section of structure.sections) {
    // LOGIC_REQUIRED sections mandate all courses — no credit cap to overflow
    if (section.logic_type === LOGIC_REQUIRED) continue;

    const courses = [...section.courses].sort(
      (a, b) => (a.credits ?? 0) - (b.credits ?? 0)
    );
    let accumulated = 0;
    const fillWith: number[] = [];
    let overflow: number | null = null;

    for (const course of courses) {
      const cr = course.credits ?? 0;
      if (accumulated + cr <= section.credit_req) {
        accumulated += cr;
        fillWith.push(course.course_id);
      } else if (overflow === null) {
        overflow = course.course_id;
      }
    }

    if (accumulated === section.credit_req && overflow !== null) {
      return { section, fillWith, overflow };
    }
  }
  return null;
}