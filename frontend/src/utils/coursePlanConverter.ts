import type { Node, Edge } from '@xyflow/react';
import type { Course, PrerequisiteGraph, ProgramStructure, NodeType } from '../types/plan';
import type { SelectedCourse } from '../types/plan';
import type { CourseEdgeData } from '../components/courseplan/CourseEdge';
import type { CourseNodeData, YearSection } from '../types/plan';
import { getMaxYearForProgram } from './program';
import {
  MAX_COLS,
  YEAR_BAR_WIDTH,
  YEAR_SECTION_PADDING,
  ROW_PADDING,
  NODE_WIDTH,
  NODE_HEIGHT,
  HORIZONTAL_GAP,
  COLUMN_GAP,
  YEAR_BAR_COURSE_OFFSET,
} from './coursePlanLayout';

export function coursePlanConverter(
  selectedCourses: SelectedCourse[],
  graph: PrerequisiteGraph,
  // Available for multi-program coloring or section-aware rendering
  _programs: ProgramStructure[],
): {
  nodes: Node<CourseNodeData>[];
  edges: Edge<CourseEdgeData, 'courseEdge'>[];
  yearSections: YearSection[];
} {
  const nodes: Node<CourseNodeData>[] = [];
  const edges: Edge<CourseEdgeData, 'courseEdge'>[] = [];

  // Lookup maps
  const graphNodeMap = new Map<number, Course>(
    graph.nodes.map((n) => [n.course_id, n]),
  );

  const courseYearMap = new Map<number, number>(
    selectedCourses.map((c) => [c.courseId, c.year]),
  );

  const courseNodeTypeMap = new Map<number, NodeType>(
    selectedCourses.map((c) => [c.courseId, c.nodeType]),
  );

  // Only draw edges where both endpoints are in the plan
  const selectedIds = new Set(selectedCourses.map((c) => c.courseId));
  const relevantEdges = graph.edges.filter(
    (e) => selectedIds.has(e.from_course_id) && selectedIds.has(e.to_course_id),
  );

  const incomingMap = new Map<number, number[]>();
  const outgoingMap = new Map<number, number[]>();

  for (const edge of relevantEdges) {
    if (!outgoingMap.has(edge.from_course_id)) outgoingMap.set(edge.from_course_id, []);
    outgoingMap.get(edge.from_course_id)!.push(edge.to_course_id);

    if (!incomingMap.has(edge.to_course_id)) incomingMap.set(edge.to_course_id, []);
    incomingMap.get(edge.to_course_id)!.push(edge.from_course_id);
  }

  // Year sections - always display all years (1-3 for general, 1-4 for others)
  const maxYear = getMaxYearForProgram(_programs);
  const sortedYears = Array.from({ length: maxYear }, (_, i) => i + 1);

  const yearSections: YearSection[] = [];
  let currentY = 0;
  const minContentHeight = 2 * NODE_HEIGHT + COLUMN_GAP;

  for (const year of sortedYears) {
    // Preserve insertion order within each year as the sort key
    const yearCourseIds = selectedCourses
      .filter((c) => c.year === year)
      .map((c) => c.courseId);

    const yearCourseIdSet = new Set(yearCourseIds);

    // Topological level computation (Kahn's BFS on the within-year subgraph)
    const inDegLocal = new Map<number, number>();
    for (const id of yearCourseIds) {
      const localIncoming = (incomingMap.get(id) ?? []).filter(
        (src) => yearCourseIdSet.has(src),
      );
      inDegLocal.set(id, localIncoming.length);
    }

    const topoLevel = new Map<number, number>();
    const bfsQ: number[] = yearCourseIds.filter((id) => inDegLocal.get(id) === 0);
    for (const id of bfsQ) topoLevel.set(id, 0);

    let bfsQi = 0;
    while (bfsQi < bfsQ.length) {
      const cur = bfsQ[bfsQi++];
      const curLevel = topoLevel.get(cur) ?? 0;
      for (const succ of outgoingMap.get(cur) ?? []) {
        if (!yearCourseIdSet.has(succ)) continue;
        // Keep the *longest* path (critical-path distance)
        const newLevel = Math.max(topoLevel.get(succ) ?? 0, curLevel + 1);
        topoLevel.set(succ, newLevel);
        const newDeg = (inDegLocal.get(succ) ?? 0) - 1;
        inDegLocal.set(succ, newDeg);
        if (newDeg === 0) bfsQ.push(succ);
      }
    }
    // Fallback: any node still missing has a cycle or is fully disconnected.
    for (const id of yearCourseIds) {
      if (!topoLevel.has(id)) topoLevel.set(id, 0);
    }

    // Column building
    const columnRoots = yearCourseIds.filter((id) => {
      const incoming = incomingMap.get(id) ?? [];
      return !incoming.some((srcId) => yearCourseIdSet.has(srcId));
    });

    type Column = number[];
    const columns: Column[] = [];
    const placed = new Set<number>();

    for (const rootId of columnRoots) {
      const column: Column = [];
      let cur: number | undefined = rootId;
      while (cur !== undefined && !placed.has(cur)) {
        column.push(cur);
        placed.add(cur);
        cur = (outgoingMap.get(cur) ?? []).find((id) => {
          if (!yearCourseIdSet.has(id) || placed.has(id)) return false;
          const prereqs = (incomingMap.get(id) ?? []).filter((p) =>
            yearCourseIdSet.has(p),
          );
          return prereqs.every((p) => placed.has(p));
        });
      }
      columns.push(column);
    }

    // Orphaned courses (not reachable via the column chains above)
    for (const id of yearCourseIds) {
      if (!placed.has(id)) {
        columns.push([id]);
        placed.add(id);
      }
    }

    // Sort every column by topological level so that, within a single column,
    // prereqs always appear before their dependents.
    for (const column of columns) {
      column.sort((a, b) => (topoLevel.get(a) ?? 0) - (topoLevel.get(b) ?? 0));
    }

    // Row wrapping
    const columnRows: Column[][] = [];
    for (let i = 0; i < columns.length; i += MAX_COLS) {
      columnRows.push(columns.slice(i, i + MAX_COLS));
    }

    const contentHeight = columnRows.reduce((totalH, rowCols, rowIndex) => {
      const rowMaxLevel = Math.max(
        0,
        ...rowCols.flatMap((col) => col.map((id) => topoLevel.get(id) ?? 0)),
      );
      const rowHeight =
        (rowMaxLevel + 1) * NODE_HEIGHT + rowMaxLevel * COLUMN_GAP;
      return (
        totalH + rowHeight + (rowIndex < columnRows.length - 1 ? ROW_PADDING : 0)
      );
    }, 0);

    // Ensure minimum height of 2 nodes tall, but allow growth as nodes are added
    const minimalContentHeight = Math.max(minContentHeight, contentHeight);
    const sectionHeight = minimalContentHeight + YEAR_SECTION_PADDING * 2;
    yearSections.push({ year, y: currentY, height: sectionHeight });

    // Node placement — y is derived from topo level, not column position index.
    const courseStartX = YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET;
    let rowY = currentY + YEAR_SECTION_PADDING;

    for (let rowIndex = 0; rowIndex < columnRows.length; rowIndex++) {
      const rowCols = columnRows[rowIndex];
      const rowMaxLevel = Math.max(
        0,
        ...rowCols.flatMap((col) => col.map((id) => topoLevel.get(id) ?? 0)),
      );

      let x = courseStartX;

      for (const column of rowCols) {
        for (const courseId of column) {
          const course = graphNodeMap.get(courseId);
          if (!course) continue;

          const level = topoLevel.get(courseId) ?? 0;
          const y = rowY + level * (NODE_HEIGHT + COLUMN_GAP);

          nodes.push({
            id: String(courseId),
            type: 'course',
            position: { x, y },
            data: {
              course,
              year,
              nodeType: courseNodeTypeMap.get(courseId) ?? 'elective',
              incomingIds: incomingMap.get(courseId) ?? [],
              outgoingIds: outgoingMap.get(courseId) ?? [],
              manuallyPlaced: false,
            } satisfies CourseNodeData,
            measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            draggable: false,
          });
        }
        x += NODE_WIDTH + HORIZONTAL_GAP;
      }

      const rowHeight =
        (rowMaxLevel + 1) * NODE_HEIGHT + rowMaxLevel * COLUMN_GAP;
      const isLastRow = rowIndex === columnRows.length - 1;
      rowY += rowHeight + (isLastRow ? 0 : ROW_PADDING);
    }

    currentY += sectionHeight;
  }

  // Edges
  for (const edge of relevantEdges) {
    const sourceYear = courseYearMap.get(edge.from_course_id) ?? sortedYears[0];
    const sourceSection = yearSections.find((s) => s.year === sourceYear);

    const sourceSectionBottom = sourceSection
      ? sourceSection.y + sourceSection.height
      : 0;
    const nextSection = yearSections.find((s) => s.year > sourceYear);
    const nextSectionTop = nextSection
      ? nextSection.y
      : sourceSectionBottom + 40;
    const gapY = (sourceSectionBottom + nextSectionTop) / 2;

    edges.push({
      id: `${edge.from_course_id}-${edge.to_course_id}-${edge.set_id}`,
      source: String(edge.from_course_id),
      target: String(edge.to_course_id),
      sourceHandle: 'source',
      targetHandle: `target-${String(edge.from_course_id)}`,
      type: 'courseEdge',
      data: { gapY },
    });
  }

  return { nodes, edges, yearSections };
}