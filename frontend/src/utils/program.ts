import { PrerequisiteGraph, ProgramStructure, SelectedCourse } from "../types/plan";
import { getCourseCredits, getSectionCredits, getPlanCredits, getYearCredits } from "./credits";
import { findSections, isCourseRequired, checkPrereqs, prereqsStillValid } from "./prerequisites";

export const LOGIC_REQUIRED = 1;       // All courses in the section are mandatory
export const LOGIC_CHOOSE_CREDITS = 2; // Student can choose from a set of courses to meet the credit requirement
export const YEAR_CREDIT_CAP = 30;


interface CanTakeCourseResult {
  valid: boolean;
  reason?: string;

  /** Codes of courses blocking validity (prereqs not met, or the course itself for credit overflows). */
  missing?: string[];
}

/**
 * canTakeCourse
 *
 * Determines whether a course can legally be added to a specific year of the plan.
 * Checks are run in priority order; the first failure is returned.
 *
 * @param courseId         The course the student wants to add.
 * @param targetYear       The year they want to place it in (1–4).
 * @param plan             The current list of placed courses.
 * @param graph            The prerequisite graph.
 * @param programStructure Full program structure for section / total credit caps.
 */
export function canTakeCourse(
  courseId: number,
  targetYear: 1 | 2 | 3 | 4,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph,
  programs: ProgramStructure[]
): CanTakeCourseResult {
  const credits = getCourseCredits(courseId, graph);
  const courseCode = graph.nodes.find(n => n.course_id === courseId)?.course_code ?? `Course ${courseId}`;

  // 1. Section credit cap
  const sections = findSections(courseId, programs);
  for (const section of sections) {
    const cap = section.credit_req ?? 0;
    if (cap > 0) {
      const used = getSectionCredits(section.section_id, plan, programs);
      if (used + credits > cap) {
        return { valid: false, reason: `${courseCode} exceeds the ${cap} credit cap for "${section.section_name}"`, missing: [courseCode] };
      }
    }
  }
  // 2. Total program credit cap
  const totalCap = programs.reduce((sum, p) => sum + p.total_credits, 0);
  const totalUsed = getPlanCredits(plan, graph);
  if (totalUsed + credits > programs.reduce((sum, p) => sum + p.total_credits, 0)) {
    return { valid: false, reason: `Adding ${courseCode} would exceed the total program cap of ${totalCap} credits`, missing: [courseCode] };
  }

  // 3. Per-year credit cap (30 credits / year)
  const yearUsed = getYearCredits(targetYear, plan, graph);
  if (yearUsed + credits > YEAR_CREDIT_CAP) {
    return { valid: false, reason: `Adding ${courseCode} would exceed the Year ${targetYear} cap of ${YEAR_CREDIT_CAP} credits`, missing: [courseCode] };
  }

  // 4. Prerequisites
  const { satisfied, missing } = checkPrereqs(courseId, targetYear, plan, graph);
  if (!satisfied) {
    const missingCodes = missing.map(id =>
      graph.nodes.find(n => n.course_id === id)?.course_code ?? `Course ${id}`
    );
    return { valid: false, reason: `Missing prerequisites from: ${missingCodes.join(', ')}`, missing: missingCodes };
  }

  return { valid: true };
}



/**
 * findEarliestYear
 */
export function findEarliestYear(courseCode: string): 1 | 2 | 3 | 4 {
  const match = courseCode.match(/\d+/);
  if (!match) return 1;
  
  const num = parseInt(match[0]);
  const prefixYear = Math.min(Math.floor(num / 100), 4) as 1 | 2 | 3 | 4;
  return prefixYear;
}

/**
 * getCoursesToRemove  (also exported as getDependents)
 *
 * Returns the IDs of all courses that must be removed from the plan if
 * `courseId` is removed. Performs a BFS cascade so transitive dependents
 * are included. Respects OR-set logic — a dependent is only pulled in if
 * removing the current wave actually breaks its min_required count.
 *
 * The original `courseId` is NOT included; the caller removes it separately.
 *
 * @param courseId  The course being removed.
 * @param plan      The current list of placed courses.
 * @param graph     The prerequisite graph.
 * @param programs  The full program structure, used to check if dependents are required courses that can't be removed.
 */
export function getCoursesToRemove(
  courseId: number,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph,
  programs: ProgramStructure[]
): number[] {
  const removedIds = new Set<number>([courseId]);
  const queue: number[] = [courseId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    const dependentIds = [
      ...new Set(
        graph.edges
          .filter((e) => e.from_course_id === current)
          .map((e) => e.to_course_id)
      ),
    ];

    for (const depId of dependentIds) {
      if (removedIds.has(depId)) continue;
      if (!plan.some((p) => p.courseId === depId)) continue;

      if (!prereqsStillValid(depId, plan, graph, removedIds) && !isCourseRequired(depId, programs)) {
        removedIds.add(depId);
        queue.push(depId);
      }
    }
  }

  removedIds.delete(courseId);
  return Array.from(removedIds);
}

/** Alias, same behaviour as getCoursesToRemove. */
export const getDependents = getCoursesToRemove;
