import { PrerequisiteGraph, ProgramStructure, SelectedCourse } from "../types/plan";

// Internal helpers
/** Look up a course's credits from the graph; defaults to 3 if not found. */
export function getCourseCredits(courseId: number, graph: PrerequisiteGraph): number {
  return graph.nodes.find((n) => n.course_id === courseId)?.credits ?? 3;
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
  programs: ProgramStructure[],
  graph: PrerequisiteGraph
): number {
  const section = programs.flatMap(p => p.sections).find(
    (s) => s.section_id === sectionId
  );
  if (!section) return 0;

  const sectionCourseIds = new Set(
    section.section_courses.map(c => c.course_id)
  );
  return plan
    .filter((p) => sectionCourseIds.has(p.courseId) && p.nodeType !== 'required')
    .reduce((sum, p) => sum + getCourseCredits(p.courseId, graph), 0);
}