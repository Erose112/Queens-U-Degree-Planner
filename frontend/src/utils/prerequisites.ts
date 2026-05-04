import { PrerequisiteGraph, ProgramStructure, SelectedCourse } from "../types/plan";
import { LOGIC_REQUIRED } from "./program";


/** Find the sections that own the given course, or null. */
export function findSections(courseId: number, programs: ProgramStructure[]) {
  return programs.flatMap(p => p.sections).filter(s =>
    s.section_courses.some(c => c.course_id === courseId) && s.logic_type !== LOGIC_REQUIRED
  );
}

export function isCourseRequired(courseId: number, programs: ProgramStructure[]): boolean {
  return programs
    .flatMap(p => p.sections)
    .filter(s => s.logic_type === LOGIC_REQUIRED)
    .flatMap(s => s.section_courses)
    .some(c => c.course_id === courseId);
}


/**
 * Returns the depth of the prerequisite chain that exists
 * within the target year. 
 * - depth 0: no prereqs in this year
 * - depth 1: a direct prereq is in this year  
 * - depth 2: a prereq of a prereq is also in this year → REJECT
 */
export function getPrereqChainDepthInYear(
  courseId: number,
  targetYear: number,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): number {
  const credits = graph.nodes.find(n => n.course_id === courseId)?.credits ?? 3;
  const selfDepth = credits >= 6 ? 2 : 1;

  const prereqsInYear = graph.edges
    .filter(e => e.to_course_id === courseId)
    .map(e => e.from_course_id)
    .filter(id => plan.some(c => c.courseId === id && c.year === targetYear));

  if (prereqsInYear.length === 0) return selfDepth - 1; // 0 for 3-credit, 1 for 6-credit

  const childDepths = prereqsInYear.map(id => getPrereqChainDepthInYear(id, targetYear, plan, graph));
  const depth = selfDepth + Math.max(...childDepths);

  console.log(`[chainDepth] course=${courseId} credits=${credits} year=${targetYear} prereqsInYear=${prereqsInYear} childDepths=${childDepths} → depth=${depth}`);
  return depth;
}



/**
 * Evaluate whether all prerequisite sets for a course are satisfied.
 *
 * Rules:
 *  - Each set must be satisfied independently (sets are AND-ed together).
 *  - Within a set, `min_required` courses must be present in the plan
 *    AND placed in a year strictly less than `targetYear`.
 *  - `min_required === 0` means every course in the set is required (ALL).
 *
 * Returns { satisfied } boolean
 */
export function checkPrereqs(
  courseId: number,
  targetYear: 1 | 2 | 3 | 4,
  plan: SelectedCourse[],
  graph: PrerequisiteGraph
): { satisfied: boolean } {
  const edges = graph.edges.filter((e) => e.to_course_id === courseId);
  if (edges.length === 0) return { satisfied: true };

  const validIds = new Set(
    plan
      .filter((p) =>
        p.year < targetYear ||
        (p.year === targetYear && getPrereqChainDepthInYear(p.courseId, targetYear, plan, graph) === 0)
      )
      .map((p) => p.courseId)
  );

  const setMap = new Map<number, number[]>();
  for (const edge of edges) {
    if (!setMap.has(edge.set_id)) setMap.set(edge.set_id, []);
    setMap.get(edge.set_id)!.push(edge.from_course_id);
  }

  const satisfied = [...setMap.entries()].every(([setId, courseIds]) => {
    const isOr = graph.prerequisite_sets.find((s) => s.set_id === setId)?.min_required === 1;
    return isOr
      ? courseIds.some((id) => validIds.has(id))
      : courseIds.every((id) => validIds.has(id));
  });

  return { satisfied };
}


/**
 * After a cascade removal, check whether a course still has its prereqs
 * satisfied by the plan minus the already-marked-for-removal IDs.
 * (Year ordering is not re-checked here — only presence.)
 */
export function prereqsStillValid(
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
    const required = prereqSet?.min_required
      ? prereqSet.min_required
      : courseIds.length;

    const satisfiedCount = courseIds.filter((id) => activeIds.has(id)).length;
    if (satisfiedCount < required) return false;
  }

  return true;
}
