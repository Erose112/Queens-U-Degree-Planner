import type { ProgramStructure, SelectedCourse } from "../types/plan";
import { PrerequisiteGraph } from "../types/plan";
import type { CombinationId } from "./programCombination";
import { CREDIT_LIMIT, GENERAL_CREDIT_LIMIT } from "./program";

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

/**
 * getCreditLimitForPrograms
 * Returns the appropriate credit limit based on program types.
 * General programs are limited to 90 units.
 * All other (honours) programs allow 120 units.
 */
export function getCreditLimitForPrograms(programs: ProgramStructure[]): number {
  const hasGeneralProgram = programs.some((p) => p.program_type?.toLowerCase() === "general");
  return getCreditLimitForCombination(hasGeneralProgram ? "general" : "major");
}

/**
 * getCreditLimitForCombination
 * Returns the effective credit limit for a combination.
 * General degrees total 90.0 units; all honours degrees total 120.0 units.
 */
export function getCreditLimitForCombination(combinationId: CombinationId): number {
  return combinationId === "general" ? GENERAL_CREDIT_LIMIT : CREDIT_LIMIT;
}