import { PrerequisiteGraph, ProgramStructure, SelectedCourse, NodeType } from "../types/plan";
import { getCourseCredits, getSectionCredits, getPlanCredits, getYearCredits, getCreditLimitForPrograms } from "./credits";
import { findSections, isCourseRequired, getPrereqChainDepthInYear, checkPrereqs, prereqsStillValid } from "./prerequisites";

export const LOGIC_REQUIRED = 0;       // All courses in the section are mandatory
export const LOGIC_CHOOSE_CREDITS = 1; // Student can choose from a set of courses to meet the credit requirement
export const YEAR_CREDIT_CAP = 30;
export const CREDIT_LIMIT = 120;
export const GENERAL_CREDIT_LIMIT = 90; 

interface CanTakeCourseResult {
  valid: boolean;
  reason?: string;

  /** Codes of courses blocking validity (prereqs not met, or the course itself for credit overflows). */
  missing?: string[];
}



function inferYearFromCode(courseCode: string): 1 | 2 | 3 | 4 {
  const num = parseInt(courseCode.match(/\d+/)?.[0] ?? '100');
  return Math.max(1, Math.min(4, Math.floor(num / 100))) as 1 | 2 | 3 | 4;
}


export function getSectionLabel(index: number): string {
  return `Section ${index + 1}`;
}


export function formatCourseName(code: string): string {
  return code.replace(/([A-Z]+)(\d+)/, "$1 $2");
}


/**
 * getMaxYearForProgram
 * Returns the maximum year allowed for a program.
 * General programs are limited to 3 years (years 1-3).
 * All other programs allow 4 years (years 1-4).
 */
export function getMaxYearForProgram(programs: ProgramStructure[]): 1 | 2 | 3 | 4 {
  const hasGeneralProgram = programs.some((p) => p.program_type?.toLowerCase() === "general");
  return hasGeneralProgram ? 3 : 4;
}


/**
 * findEarliestYear
 * Infers the earliest year a course can be placed in based on its code, 
 * then checks each year in order to find the first valid placement.
 */
export function findEarliestYear(
  courseId: number,
  selectedCourses: SelectedCourse[],
  graph: PrerequisiteGraph,
  programs: ProgramStructure[],
  courseStatus: NodeType = "choice"
): 1 | 2 | 3 | 4 | null {
  const courseCode = graph.nodes.find(n => n.course_id === courseId)?.course_code ?? '';
  const startYear = inferYearFromCode(courseCode);
  const maxYear = getMaxYearForProgram(programs);

  for (let y = startYear; y <= maxYear; y++) {
    if (canTakeCourse(courseId, y as 1|2|3|4, selectedCourses, graph, programs, courseStatus).valid) {
      return y as 1|2|3|4;
    }
  }
  return null;
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
  programs: ProgramStructure[],
  courseStatus: NodeType = "choice"
): CanTakeCourseResult {
  const credits = getCourseCredits(courseId, graph);
  const courseCode = graph.nodes.find(n => n.course_id === courseId)?.course_code ?? `Course ${courseId}`;

  console.log(`[canTakeCourse] courseId=${courseId}, year=${targetYear}, nodeType=${courseStatus}`);

  // 1. Year boundary check for general programs (max 3 years)
  const maxYear = getMaxYearForProgram(programs);
  if (targetYear > maxYear) {
    return { valid: false, reason: `${courseCode} cannot be placed in Year ${targetYear}. General Bachelor of Arts programs are 3-year degrees and cannot include 4th-year courses.`, missing: [courseCode] };
  }

  if (courseStatus === "choice") {
    // 2. Section credit cap
    const sections = findSections(courseId, programs);
    for (const section of sections) {
      const cap = section.credit_req ?? 0;
      if (cap > 0) {
        const used = getSectionCredits(section.section_id, plan, programs, graph);
        if (used + credits > cap) {
          return { valid: false, reason: `${courseCode} exceeds the ${cap} credit cap for "${getSectionLabel(section.section_id)}"`, missing: [courseCode] };
        }
      }
    }
  }

  // 3. Per-year credit cap (30 credits / year)
  const yearUsed = getYearCredits(targetYear, plan, graph);
  if (yearUsed + credits > YEAR_CREDIT_CAP) {
    return { valid: false, reason: `Adding ${courseCode} would exceed the Year ${targetYear} cap of ${YEAR_CREDIT_CAP} credits`, missing: [courseCode] };
  }

  // 4. Total credit cap (90 for general, 120 for honours)
  const creditLimit = getCreditLimitForPrograms(programs);
  const totalUsed = getPlanCredits(plan, graph);
  if (totalUsed + credits > creditLimit) {
    return { valid: false, reason: `Adding ${courseCode} would exceed the total credit limit of ${creditLimit} credits`, missing: [courseCode] };
  }

  // 5 & 6. Prerequisites and chain depth - SKIP if "required", CHECK if "choice" or "prereq"
  if (courseStatus !== "required" && courseStatus !== "user-placed") {
    const { satisfied } = checkPrereqs(courseId, targetYear, plan, graph);
    if (!satisfied) {
      const course = graph.nodes.find(n => n.course_id === courseId);
      const prereqString = course?.prerequisite_str;
      return { valid: false, reason: `Missing prerequisites: ${prereqString}`, missing: [courseCode] };
    }

    const chainDepth = getPrereqChainDepthInYear(courseId, targetYear, plan, graph);
    if (chainDepth >= 2) {
      return {
        valid: false,
        reason: `${courseCode} has a prerequisite chain too deep for Year ${targetYear}. Move upstream prerequisites to an earlier year.`,
        missing: [],
      };
    }
  }

  return { valid: true };
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
