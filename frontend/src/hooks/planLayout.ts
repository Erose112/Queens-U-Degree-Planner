// hooks/usePlanLayout.ts
import { useCallback, useEffect, useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { usePlanStore } from '../store/planStore';
import { coursePlanConverter } from '../utils/coursePlanConverter';
import { reconcileNodes } from '../utils/reconcileNodes';
import { useNodesState, useEdgesState, NodeChange } from '@xyflow/react';
import { CourseNodeData, YearSection } from '../types/plan';

export function usePlanLayout() {
  const { selectedCourses, graph, programs } = usePlanStore();

  // Recompute fresh layout whenever selectedCourses changes
  const { nodes: freshNodes, edges: freshEdges, yearSections } = useMemo(() => {
    if (!graph || selectedCourses.length === 0) 
        return { nodes: [], edges: [], yearSections: [] as YearSection[] };
    return coursePlanConverter(selectedCourses, graph, programs );
  }, [selectedCourses, graph, programs]);

  const [nodes, setNodes, onNodesChange] = useNodesState(freshNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(freshEdges);

  // Reconcile instead of blindly overwriting, preserves dragged positions
  useEffect(() => {
    setNodes(prev => reconcileNodes(prev, freshNodes, { preserveDragged: true }));
    setEdges(freshEdges);
  }, [freshNodes, freshEdges]);

  // Track manual drags back into node data
  const handleNodesChange = useCallback((changes: NodeChange<Node<CourseNodeData>>[]) => {
    onNodesChange(changes);
    changes.forEach(change => {
      if (change.type === 'position' && change.dragging === false) {
        setNodes(prev => prev.map(n =>
          n.id === change.id
            ? { ...n, data: { ...n.data, manuallyPlaced: true } }
            : n
        ));
      }
    });
  }, [onNodesChange]);

  return { nodes, edges, yearSections, onNodesChange: handleNodesChange, onEdgesChange };
}