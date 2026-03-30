import { PrerequisiteGraph, ProgramStructure, SelectedCourse } from "../types/plan";
import { getPrograms, getPrerequisiteGraph } from "../services/api";
import { LOGIC_REQUIRED } from "./program";


const programs = await getPrograms();
const programId = programs[0]?.program_id;
const graphJson = await getPrerequisiteGraph(programId);

const graph     = graphJson    as unknown as PrerequisiteGraph;

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


/** Find the sections that own the given course, or null. */
export function findSections(courseId: number, programs: ProgramStructure[]) {
  return programs.flatMap(p => p.sections).filter(s =>
    s.courses.some(c => c.course_id === courseId) && s.logic_type !== LOGIC_REQUIRED
  );
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
 * Returns { satisfied, missing } where `missing` is a flat list of
 * course IDs that would need to be added/moved to satisfy unmet sets.
 */
export function checkPrereqs(
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
    const isOrLogic = prereqSet?.min_required === 1;

    if (isOrLogic) {
      // At least one must be satisfied
      const satisfied = courseIds.some((id) => priorIds.has(id));
      if (!satisfied) missing.push(...courseIds);
    } else {
      // All must be satisfied (min_required === 0)
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
    const required =
      prereqSet?.min_required === 0 || prereqSet?.min_required === undefined
        ? courseIds.length
        : prereqSet.min_required;

    const satisfiedCount = courseIds.filter((id) => activeIds.has(id)).length;
    if (satisfiedCount < required) return false;
  }

  return true;
}
