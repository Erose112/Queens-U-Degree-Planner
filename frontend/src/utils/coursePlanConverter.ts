import type { Node, Edge } from '@xyflow/react';
import type { GraphNode, PrerequisiteGraph, ProgramStructure } from '../types/plan';
import type { SelectedCourse } from '../types/plan';
import type { CourseEdgeData } from '../components/courseplan/CourseEdge';
import type { CourseNodeData, YearSection } from '../types/plan';
import {
  YEAR_BAR_WIDTH,
  YEAR_SECTION_PADDING,
  ROW_PADDING,
  NODE_WIDTH,
  NODE_HEIGHT,
  HORIZONTAL_GAP,
  COLUMN_GAP,
  YEAR_BAR_COURSE_OFFSET,
} from './coursePlanLayout';


const MAX_COLS = 5;

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
  const graphNodeMap = new Map<number, GraphNode>(
    graph.nodes.map((n) => [n.course_id, n]),
  );

  const courseYearMap = new Map<number, number>(
    selectedCourses.map((c) => [c.courseId, c.year]),
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

  // Year sections 
  const sortedYears = Array.from(new Set(selectedCourses.map((c) => c.year))).sort(
    (a, b) => a - b,
  );

  const yearSections: YearSection[] = [];
  let currentY = 0;

  for (const year of sortedYears) {
    // Preserve insertion order within each year as the sort key
    const yearCourseIds = selectedCourses
      .filter((c) => c.year === year)
      .map((c) => c.courseId);

    const yearCourseIdSet = new Set(yearCourseIds);

    // Column building 
    const columnRoots = yearCourseIds.filter((id) => {
      const incoming = incomingMap.get(id) ?? [];
      return !incoming.some((srcId) => yearCourseIdSet.has(srcId));
    });

    type Column = number[];
    const columns: Column[] = [];
    const placed = new Set<number>();

    for (const rootId of columnRoots) {
      const column: number[] = [];
      let cur: number | undefined = rootId;
      while (cur !== undefined && !placed.has(cur)) {
        column.push(cur);
        placed.add(cur);
        cur = (outgoingMap.get(cur) ?? []).find((id) => yearCourseIdSet.has(id));
      }
      columns.push(column);
    }

    // Orphaned courses (not reachable from any root)
    for (const id of yearCourseIds) {
      if (!placed.has(id)) {
        columns.push([id]);
        placed.add(id);
      }
    }

    // Row wrapping 
    const columnRows: Column[][] = [];
    for (let i = 0; i < columns.length; i += MAX_COLS) {
      columnRows.push(columns.slice(i, i + MAX_COLS));
    }

    const contentHeight = columnRows.reduce((totalH, rowCols, rowIndex) => {
      const rowMaxLen = Math.max(1, ...rowCols.map((col) => col.length));
      const rowHeight = rowMaxLen * NODE_HEIGHT + (rowMaxLen - 1) * COLUMN_GAP;
      return totalH + rowHeight + (rowIndex < columnRows.length - 1 ? ROW_PADDING : 0);
    }, 0);

    const sectionHeight = contentHeight + YEAR_SECTION_PADDING * 2;
    yearSections.push({ year, y: currentY, height: sectionHeight });

    // Node placement 
    const courseStartX = YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET;
    let rowY = currentY + YEAR_SECTION_PADDING;

    for (let rowIndex = 0; rowIndex < columnRows.length; rowIndex++) {
      const rowCols = columnRows[rowIndex];
      const rowMaxLen = Math.max(1, ...rowCols.map((col) => col.length));
      let x = courseStartX;

      for (const column of rowCols) {
        let y = rowY;
        for (const courseId of column) {
          const graphNode = graphNodeMap.get(courseId);
          if (!graphNode) continue; // should never happen if graph is consistent

          nodes.push({
            id: String(courseId),
            type: 'course',
            position: { x, y },
            data: {
              graphNode,
              year,
              incomingIds: incomingMap.get(courseId) ?? [],
              outgoingIds: outgoingMap.get(courseId) ?? [],
              manuallyPlaced: false,
            } satisfies CourseNodeData,
            measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            draggable: false,
          });
          y += NODE_HEIGHT + COLUMN_GAP;
        }
        x += NODE_WIDTH + HORIZONTAL_GAP;
      }

      const isLastRow = rowIndex === columnRows.length - 1;
      rowY +=
        rowMaxLen * NODE_HEIGHT +
        (rowMaxLen - 1) * COLUMN_GAP +
        (isLastRow ? 0 : ROW_PADDING);
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
    const nextSectionTop = nextSection ? nextSection.y : sourceSectionBottom + 40;
    const gapY = (sourceSectionBottom + nextSectionTop) / 2;

    edges.push({
      // set_id included so two edges from the same prereq set get distinct IDs
      id: `${edge.from_course_id}-${edge.to_course_id}-${edge.set_id}`,
      source: String(edge.from_course_id),
      target: String(edge.to_course_id),
      sourceHandle: 'source',
      targetHandle: `target-${edge.from_course_id}`,
      type: 'courseEdge',
      data: { gapY },
    });
  }

  return { nodes, edges, yearSections };
}