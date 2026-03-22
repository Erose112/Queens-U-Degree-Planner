import { getPrerequisiteGraph, getPrograms } from "../services/programs";
import { PrerequisiteGraph, ProgramStructure } from "../types/program";
import { YEAR_CREDIT_CAP, LOGIC_REQUIRED, SelectedCourse } from "./programUtils";

const programs = await getPrograms();
const programId = programs[0]?.program_id;
const graphJson = await getPrerequisiteGraph(programId);

const graph     = graphJson    as unknown as PrerequisiteGraph;


/**
 * For a given course, return the set_ids of its prerequisite sets and the
 * course IDs in each set — derived purely from the graph.
 */
export function prereqSetsFor(courseId: number): { setId: number; courseIds: number[] }[] {
  const edges = graph.edges.filter((e) => e.to_course_id === courseId);
  const map = new Map<number, number[]>();
  for (const e of edges) {
    if (!map.has(e.set_id)) map.set(e.set_id, []);
    map.get(e.set_id)!.push(e.from_course_id);
  }
  return [...map.entries()].map(([setId, courseIds]) => ({ setId, courseIds }));
}


/**
 * Build a minimal plan that satisfies all prerequisites for a given course.
 * Places each prereq in a year earlier than the course's target year.
 * Returns null if the chain is too deep for a 4-year plan.
 */
export function buildPrereqPlan(
  courseId: number,
  targetYear: 1 | 2 | 3 | 4,
  depth = 0
): SelectedCourse[] | null {
  if (depth >= targetYear) return null;
  const sets = prereqSetsFor(courseId);
  const plan: SelectedCourse[] = [];
  const year = (targetYear - 1) as 1 | 2 | 3 | 4;

  for (const { setId, courseIds } of sets) {
    const prereqSet = graph.prerequisite_sets.find((s) => s.set_id === setId);
    const needed = prereqSet?.min_required ?? courseIds.length;

    // Pick the first `needed` courses to satisfy this set
    for (const prereqId of courseIds.slice(0, needed)) {
      const subPlan = buildPrereqPlan(prereqId, year, depth + 1);
      if (subPlan === null) return null;
      plan.push(...subPlan, { courseId: prereqId, year, addedBy: "user" });
    }
  }

  // Deduplicate by courseId, keep the first occurrence
  const seen = new Set<number>();
  return plan.filter((p) => {
    if (seen.has(p.courseId)) return false;
    seen.add(p.courseId);
    return true;
  });
}


// Internal helpers
/** Look up a course's credits from the graph; defaults to 0 if not found. */
function getCourseCredits(courseId: number, graph: PrerequisiteGraph): number {
  return graph.nodes.find((n) => n.course_id === courseId)?.credits ?? 0;
}

/** Total credits already in the plan. */
function getPlanCredits(
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): number {
  return plan.reduce((sum, p) => sum + getCourseCredits(p.courseId, graph), 0);
}

/** Credits placed in a specific year. */
function getYearCredits(
  year: 1 | 2 | 3 | 4,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): number {
  return plan
    .filter((p) => p.year === year)
    .reduce((sum, p) => sum + getCourseCredits(p.courseId, graph), 0);
}

/** Credits already used within the program section that owns this course. */
function getSectionCredits(
  sectionId: number,
  plan: SelectedCourse[],
  programStructure: ProgramStructure
): number {
  const section = programStructure.sections.find(
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

/** Find the program section that owns the given course, or null. */
function findSection(courseId: number, programStructure: ProgramStructure) {
  return (
    programStructure.sections.find((s) =>
      s.courses.some((c) => c.course_id === courseId)
    ) ?? null
  );
}

/**
 * Evaluate whether all prerequisite sets for a course are satisfied.
 *
 * Rules:
 *  - Each set must be satisfied independently (sets are AND-ed together).
 *  - Within a set, `min_required` courses must be present in the plan
 *    AND placed in a year strictly less than `targetYear`.
 *  - `min_required === null` means every course in the set is required (ALL).
 *
 * Returns { satisfied, missing } where `missing` is a flat list of
 * course IDs that would need to be added/moved to satisfy unmet sets.
 */
function checkPrereqs(
  courseId: number,
  targetYear: 1 | 2 | 3 | 4,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): { satisfied: boolean; missing: number[] } {
  const edges = graph.edges.filter((e) => e.to_course_id === courseId);
  if (edges.length === 0) return { satisfied: true, missing: [] };

  // Group prerequisite edges by set_id
  const setMap = new Map<number, number[]>();
  for (const edge of edges) {
    if (!setMap.has(edge.set_id)) setMap.set(edge.set_id, []);
    setMap.get(edge.set_id)!.push(edge.from_course_id);
  }

  // IDs of courses placed BEFORE targetYear
  const priorIds = new Set(
    plan.filter((p) => p.year < targetYear).map((p) => p.courseId)
  );

  const missing: number[] = [];

  for (const [setId, courseIds] of setMap) {
    const prereqSet = graph.prerequisite_sets.find((s) => s.set_id === setId);
    const required =
      prereqSet?.min_required === null || prereqSet?.min_required === undefined
        ? courseIds.length // null → ALL
        : prereqSet.min_required;

    const satisfiedCount = courseIds.filter((id) => priorIds.has(id)).length;

    if (satisfiedCount < required) {
      const unmet = courseIds.filter((id) => !priorIds.has(id));
      missing.push(...unmet);
    }
  }

  return { satisfied: missing.length === 0, missing };
}

/**
 * After a cascade removal, check whether a course still has its prereqs
 * satisfied by the plan minus the already-marked-for-removal IDs.
 * (Year ordering is not re-checked here — only presence.)
 */
function prereqsStillValid(
  courseId: number,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph,
  removedIds: Set<number>
): boolean {
  const edges = graph.edges.filter((e) => e.to_course_id === courseId);
  if (edges.length === 0) return true;

  const setMap = new Map<number, number[]>();
  for (const edge of edges) {
    if (!setMap.has(edge.set_id)) setMap.set(edge.set_id, []);
    setMap.get(edge.set_id)!.push(edge.from_course_id);
  }

  const activeIds = new Set(
    plan.filter((p) => !removedIds.has(p.courseId)).map((p) => p.courseId)
  );

  for (const [setId, courseIds] of setMap) {
    const prereqSet = graph.prerequisite_sets.find((s) => s.set_id === setId);
    const required =
      prereqSet?.min_required === null || prereqSet?.min_required === undefined
        ? courseIds.length
        : prereqSet.min_required;

    const satisfiedCount = courseIds.filter((id) => activeIds.has(id)).length;
    if (satisfiedCount < required) return false;
  }

  return true;
}



// Public API
export type InvalidReason =
  | "missing_prereqs"
  | "exceeds_section_credits"
  | "exceeds_program_credits"
  | "exceeds_year_credits";

export interface CanTakeCourseResult {
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
  programStructure: ProgramStructure
): CanTakeCourseResult {
  const credits = getCourseCredits(courseId, graph);

  // 1. Section credit cap
  const section = findSection(courseId, programStructure);
  if (section !== null && section.logic_type !== LOGIC_REQUIRED) {
    const cap = section.credit_req ?? 0;
    const used = getSectionCredits(section.section_id, plan, programStructure);
    if (used + credits > cap) {
      return { valid: false, reason: "exceeds_section_credits", missing: [courseId] };
    }
  }
  // 2. Total program credit cap
  const totalUsed = getPlanCredits(plan, graph);
  if (totalUsed + credits > programStructure.total_credits) {
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
