import { PrerequisiteGraph, GraphNode, GraphEdge, PrereqSet } from '../types/plan';

/**
 * Merges two PrerequisiteGraphs into one.
 * - Nodes are deduped by course_id — if the same course appears in both graphs,
 *   the existing node is kept as-is (node_type from the first graph wins).
 * - Edges are deduped by (from_course_id, to_course_id, set_id).
 * - PrereqSets are deduped by set_id.
 *
 * Either argument may be null (e.g. first program load where state.graph is null).
 */
export function mergeGraphs(
  existing: PrerequisiteGraph | null,
  incoming: PrerequisiteGraph
): PrerequisiteGraph {
  if (!existing) return incoming;

  // --- Nodes ---
  const nodeMap = new Map<number, GraphNode>();
  for (const node of existing.nodes) {
    nodeMap.set(node.course_id, node);
  }
  for (const node of incoming.nodes) {
    // Don't overwrite — existing node_type takes precedence
    if (!nodeMap.has(node.course_id)) {
      nodeMap.set(node.course_id, node);
    }
  }

  // --- Edges ---
  // Key: "from:to:setId" — uniquely identifies a directed edge within a set
  const edgeKey = (e: GraphEdge) => `${e.from_course_id}:${e.to_course_id}:${e.set_id}`;
  const edgeMap = new Map<string, GraphEdge>();
  for (const edge of existing.edges) {
    edgeMap.set(edgeKey(edge), edge);
  }
  for (const edge of incoming.edges) {
    const key = edgeKey(edge);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
  }

  // --- PrereqSets ---
  const setMap = new Map<number, PrereqSet>();
  for (const prereqSet of existing.prerequisite_sets) {
    setMap.set(prereqSet.set_id, prereqSet);
  }
  for (const prereqSet of incoming.prerequisite_sets) {
    if (!setMap.has(prereqSet.set_id)) {
      setMap.set(prereqSet.set_id, prereqSet);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    prerequisite_sets: Array.from(setMap.values()),
  };
}

/**
 * Removes nodes, edges and prereq sets from the graph that are no longer
 * referenced by any of the remaining loaded programs.
 *
 * A node is kept if:
 *   (a) it appears in a remaining program's section courses, OR
 *   (b) it is a prerequisite of a kept node (node_type === 'prereq')
 *       and still has at least one edge pointing to a kept course.
 *
 * Edges and prereq sets are pruned to only those connecting kept nodes.
 */
export function pruneGraph(
  graph: PrerequisiteGraph,
  remainingPrograms: { sections: { courses: { course_id: number }[] }[] }[]
): PrerequisiteGraph {
  // Step 1: collect all course_ids explicitly listed in remaining programs
  const programCourseIds = new Set<number>(
    remainingPrograms
      .flatMap(p => p.sections)
      .flatMap(s => s.courses)
      .map(c => c.course_id)
  );

  // Step 2: also keep any 'prereq'-type nodes that still have an edge
  // pointing to a kept course — they may not appear in any section directly
  const prereqNodeIds = new Set<number>();
  let changed = true;
  const keptIds = new Set(programCourseIds);

  // Iteratively expand kept set to include transitive prerequisites
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (keptIds.has(edge.to_course_id) && !keptIds.has(edge.from_course_id)) {
        keptIds.add(edge.from_course_id);
        prereqNodeIds.add(edge.from_course_id);
        changed = true;
      }
    }
  }

  // Step 3: filter everything down to kept nodes
  const nodes = graph.nodes.filter(n => keptIds.has(n.course_id));

  const edges = graph.edges.filter(
    e => keptIds.has(e.from_course_id) && keptIds.has(e.to_course_id)
  );

  // Only keep prereq sets that still have at least one surviving edge
  const survivingSetIds = new Set(edges.map(e => e.set_id));
  const prerequisite_sets = graph.prerequisite_sets.filter(s =>
    survivingSetIds.has(s.set_id)
  );

  return { nodes, edges, prerequisite_sets };
}