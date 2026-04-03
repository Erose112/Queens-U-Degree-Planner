import { PrerequisiteGraph, ProgramStructure, SelectedCourse } from "../types/plan";

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
    section.section_courses.map((c) => [c.course_id, c.credits ?? 0])
  );
  return plan
    .filter((p) => creditMap.has(p.courseId) && p.addedBy !== 'autofill')
    .reduce((sum, p) => sum + creditMap.get(p.courseId)!, 0);
}