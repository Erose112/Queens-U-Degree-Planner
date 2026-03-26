import { PrerequisiteGraph, ProgramSection, ProgramStructure, SelectedCourse } from "../types/plan";
import { getCourseCredits, getSectionCredits, getPlanCredits, getYearCredits } from "./creditUtils";
import { findSection, checkPrereqs, prereqsStillValid } from "./prerequisiteUtils";

export const LOGIC_REQUIRED = 1;       // All courses in the section are mandatory
export const LOGIC_CHOOSE_CREDITS = 2; // Student can choose from a set of courses to meet the credit requirement
export const YEAR_CREDIT_CAP = 30;


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



type InvalidReason =
  | "missing_prereqs"
  | "exceeds_section_credits"
  | "exceeds_program_credits"
  | "exceeds_year_credits";

interface CanTakeCourseResult {
  valid: boolean;
  reason?: InvalidReason;
  /** IDs of courses blocking validity (prereqs not met, or the course itself for credit overflows). */
  missing?: number[];
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

  // 1. Section credit cap
  const section = findSection(courseId, programs);
  if (section !== null && section.logic_type !== LOGIC_REQUIRED) {
    const cap = section.credit_req ?? 0;
    const used = getSectionCredits(section.section_id, plan, programs);
    if (used + credits > cap) {
      return { valid: false, reason: "exceeds_section_credits", missing: [courseId] };
    }
  }
  // 2. Total program credit cap
  const totalUsed = getPlanCredits(plan, graph);
  if (totalUsed + credits > programs.reduce((sum, p) => sum + p.total_credits, 0)) {
    return { valid: false, reason: "exceeds_program_credits", missing: [courseId] };
  }

  // 3. Per-year credit cap (30 credits / year)
  const yearUsed = getYearCredits(targetYear, plan, graph);
  if (yearUsed + credits > YEAR_CREDIT_CAP) {
    return { valid: false, reason: "exceeds_year_credits", missing: [courseId] };
  }

  // 4. Prerequisites
  const { satisfied, missing } = checkPrereqs(courseId, targetYear, plan, graph);
  if (!satisfied) {
    return { valid: false, reason: "missing_prereqs", missing };
  }

  return { valid: true };
}

/**
 * findEarliestYear
 *
 * Returns the earliest year (1–4) in which a course can be taken given
 * where its prerequisites are currently placed in the plan.
 *
 * - No prerequisites → returns 1.
 * - For each prerequisite set, the constraint year is the year of the
 *   Nth-placed prerequisite (where N = min_required). The course can
 *   start the year AFTER the latest such constraint.
 * - If a set has fewer courses placed than min_required, that set is
 *   skipped (treated as not yet constraining).
 *
 * @param courseId  The course to evaluate.
 * @param graph     The prerequisite graph.
 * @param plan      The current list of placed courses.
 */
export function findEarliestYear(
  courseId: number,
  graph: PrerequisiteGraph,
  plan: SelectedCourse[]
): 1 | 2 | 3 | 4 {
  const edges = graph.edges.filter((e) => e.to_course_id === courseId);
  if (edges.length === 0) return 1;

  const setMap = new Map<number, number[]>();
  for (const edge of edges) {
    if (!setMap.has(edge.set_id)) setMap.set(edge.set_id, []);
    setMap.get(edge.set_id)!.push(edge.from_course_id);
  }

  const planMap = new Map(plan.map((p) => [p.courseId, p.year]));
  let latestConstraint = 0;

  for (const [setId, courseIds] of setMap) {
    const prereqSet = graph.prerequisite_sets.find((s) => s.set_id === setId);
    const required =
      prereqSet?.min_required === null || prereqSet?.min_required === undefined
        ? courseIds.length
        : prereqSet.min_required;

    const placedYears = courseIds
      .map((id) => planMap.get(id))
      .filter((y): y is 1 | 2 | 3 | 4 => y !== undefined)
      .sort((a, b) => a - b);

    if (placedYears.length < required) continue;

    const constraintYear = placedYears[required - 1];
    if (constraintYear > latestConstraint) latestConstraint = constraintYear;
  }

  const earliest = latestConstraint === 0 ? 1 : latestConstraint + 1;
  return Math.min(earliest, 4) as 1 | 2 | 3 | 4;
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
 */
export function getCoursesToRemove(
  courseId: number,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
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

      if (!prereqsStillValid(depId, plan, graph, removedIds)) {
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
