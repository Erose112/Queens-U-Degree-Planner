import type { Node, Edge } from '@xyflow/react';
import type { CoursePlan, Course, CourseNodeData } from '../types';
import type { CourseEdgeData } from '../components/courseplan/CourseEdge';
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

export interface YearSection {
  year: number;
  y: number;
  height: number;
}

const MAX_COLS = 5;


export function convertCoursePlanToFlow(plan: CoursePlan): {
  nodes: Node<CourseNodeData, string>[];
  edges: Edge<CourseEdgeData, 'courseEdge'>[];
  yearSections: YearSection[];
} {
  const nodes: Node<CourseNodeData, string>[] = [];
  const edges: Edge<CourseEdgeData, 'courseEdge'>[] = [];

  const incomingMap = new Map<string, string[]>();
  const outgoingMap = new Map<string, string[]>();

  for (const conn of plan.connections) {
    if (!outgoingMap.has(conn.from_course)) outgoingMap.set(conn.from_course, []);
    outgoingMap.get(conn.from_course)!.push(conn.to_course);
    if (!incomingMap.has(conn.to_course)) incomingMap.set(conn.to_course, []);
    incomingMap.get(conn.to_course)!.push(conn.from_course);
  }


  const years = new Set<number>();
  plan.courses.forEach((c) => years.add(c.year));
  const sortedYears = Array.from(years).sort((a, b) => a - b);

  const yearSections: YearSection[] = [];
  let currentY = 0;

  for (const year of sortedYears) {
    const yearCourses = plan.courses
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);

    const yearCourseIds = new Set(yearCourses.map((c) => c.id));

    const columnRoots = yearCourses.filter((c) => {
      const incoming = incomingMap.get(c.id) ?? [];
      return !incoming.some((id) => yearCourseIds.has(id));
    });

    type Column = Course[];
    const columns: Column[] = [];
    const placed = new Set<string>();

    for (const root of columnRoots) {
      const column: Course[] = [];
      let current: Course | undefined = root;
      while (current && !placed.has(current.id)) {
        column.push(current);
        placed.add(current.id);
        const nextId: string | undefined = (outgoingMap.get(current.id) ?? []).find((id) =>
          yearCourseIds.has(id)
        );
        current = nextId ? yearCourses.find((c) => c.id === nextId) : undefined;
      }
      columns.push(column);
    }

    for (const course of yearCourses) {
      if (!placed.has(course.id)) {
        columns.push([course]);
        placed.add(course.id);
      }
    }

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

    const courseStartX = YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET;
    let rowY = currentY + YEAR_SECTION_PADDING;

    for (let rowIndex = 0; rowIndex < columnRows.length; rowIndex++) {
      const rowCols = columnRows[rowIndex];
      const rowMaxLen = Math.max(1, ...rowCols.map((col) => col.length));
      let x = courseStartX;

      for (const column of rowCols) {
        let y = rowY;
        for (const course of column) {
          nodes.push({
            id: course.id,
            type: 'course',
            position: { x, y },
            data: {
              course,
              incomingIds: incomingMap.get(course.id) ?? [],
              outgoingIds: outgoingMap.get(course.id) ?? [],
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
      rowY += rowMaxLen * NODE_HEIGHT + (rowMaxLen - 1) * COLUMN_GAP + (isLastRow ? 0 : ROW_PADDING);
    }
    currentY += sectionHeight;
  }

  // Build a year lookup for all nodes
  const nodeYearMap = new Map<string, number>();
  plan.courses.forEach((c) => nodeYearMap.set(c.id, c.year));

  // Edges — attach gapY, edgeIndex, totalEdges for clean routing in CourseEdge
  for (const conn of plan.connections) {
    const sourceYear = nodeYearMap.get(conn.from_course) ?? sortedYears[0];
    const sourceSection = yearSections.find((s) => s.year === sourceYear);

    // gapY sits in the whitespace below the source year band,
    // exactly halfway between the bottom of that band and the top of the next
    const sourceSectionBottom = sourceSection
      ? sourceSection.y + sourceSection.height
      : 0;
    const nextSection = yearSections.find((s) => s.year > sourceYear);
    const nextSectionTop = nextSection ? nextSection.y : sourceSectionBottom + 40;
    const gapY = (sourceSectionBottom + nextSectionTop) / 2;

    edges.push({
      id: conn.id,
      source: conn.from_course,
      target: conn.to_course,
      sourceHandle: 'source',
      targetHandle: `target-${conn.from_course}`,
      type: 'courseEdge',
      data: {
        gapY,
      },
    });
  }

  return { nodes, edges, yearSections };
}