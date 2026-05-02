import { PrerequisiteGraph, Course, GraphEdge, PrereqSet } from '../types/plan';

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
  const nodeMap = new Map<number, Course>();
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