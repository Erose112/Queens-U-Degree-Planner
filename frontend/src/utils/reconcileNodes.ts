// utils/reconcileNodes.ts
import type { Node, XYPosition } from '@xyflow/react';
import type { CourseNodeData } from '../types/plan';

type CourseNode = Node<CourseNodeData>;

interface ReconcileOptions {
  preserveDragged?: boolean;
  tolerance?: number;
}

function positionsEqual(a: XYPosition, b: XYPosition, tolerance = 1): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function reconcileNodes(
  existing: CourseNode[],
  incoming: CourseNode[],
  options: ReconcileOptions = {},
): CourseNode[] {
  const { preserveDragged = true, tolerance = 1 } = options;
  const existingMap = new Map(existing.map(n => [n.id, n]));

  return incoming.map(incomingNode => {
    const existingNode = existingMap.get(incomingNode.id);

    // New node — use converter's position
    if (!existingNode) return incomingNode;

    // User manually dragged it — keep their position, update everything else
    if (preserveDragged && existingNode.data.manuallyPlaced) {
      return {
        ...incomingNode,
        position: existingNode.position,
        data: { ...incomingNode.data, manuallyPlaced: true },
      };
    }

    // Position unchanged — return existing ref to avoid React re-render
    if (positionsEqual(existingNode.position, incomingNode.position, tolerance)) {
      // Still update data in case graphNode/year changed
      return { ...existingNode, data: incomingNode.data };
    }

    // Position changed (prereq chain pushed it) — use fresh position
    return incomingNode;
  });
}