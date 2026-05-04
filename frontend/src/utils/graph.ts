import { PrerequisiteGraph, Course, GraphEdge, PrereqSet } from '../types/plan';

const EMPTY_GRAPH: PrerequisiteGraph = {
  nodes: [],
  edges: [],
  prerequisite_sets: [],
};

/**
 * Merges two PrerequisiteGraphs into one.
 */
export function mergeGraphs(
  existing: PrerequisiteGraph | null | undefined,
  incoming: PrerequisiteGraph | null | undefined,
): PrerequisiteGraph {
  if (!existing && !incoming) return EMPTY_GRAPH;
  if (!existing) return incoming!;
  if (!incoming) return existing;

  // Using max(existing set IDs) + 1 as the offset means incoming IDs are
  // always placed above the entire existing range, regardless of how sparse
  // or dense those IDs are.  This is safe even when called repeatedly
  // (each merge raises the ceiling for the next one).
  const maxExistingSetId = existing.prerequisite_sets.reduce(
    (max, s) => Math.max(max, s.set_id),
    0,
  );
  const offset = maxExistingSetId + 1;

  const remappedSets: PrereqSet[] = incoming.prerequisite_sets.map(s => ({
    ...s,
    set_id: s.set_id + offset,
  }));

  const remappedEdges: GraphEdge[] = incoming.edges.map(e => ({
    ...e,
    set_id: e.set_id + offset,
  }));

  const nodeMap = new Map<number, Course>();

  for (const node of existing.nodes) {
    nodeMap.set(node.course_id, node);
  }

  for (const node of incoming.nodes) {
    const existingNode = nodeMap.get(node.course_id);
    if (
      !existingNode ||
      (node.node_type === 'required' && existingNode.node_type !== 'required')
    ) {
      nodeMap.set(node.course_id, node);
    }
  }

  // Edges (dedup by from:to:remapped_set_id) 
  const edgeKey = (e: GraphEdge) =>
    `${e.from_course_id}:${e.to_course_id}:${e.set_id}`;

  const edgeMap = new Map<string, GraphEdge>();

  for (const edge of existing.edges) {
    edgeMap.set(edgeKey(edge), edge);
  }
  for (const edge of remappedEdges) {
    const key = edgeKey(edge);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
  }

  // PrereqSets (dedup by remapped set_id) 
  const setMap = new Map<number, PrereqSet>();

  for (const prereqSet of existing.prerequisite_sets) {
    setMap.set(prereqSet.set_id, prereqSet);
  }
  for (const prereqSet of remappedSets) {
    // Collisions are impossible here by construction, but guard anyway
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