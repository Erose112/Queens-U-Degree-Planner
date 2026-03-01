import type { Node, Edge } from '@xyflow/react';
import type { CoursePlan, Course, ConnectionType, CourseNodeData, CourseChoiceNodeData } from '../types';
import type { CourseEdgeData } from '../components/CourseEdge';
import {
  YEAR_BAR_WIDTH,
  YEAR_SECTION_PADDING,
  NODE_WIDTH,
  NODE_HEIGHT,
  HORIZONTAL_GAP,
  COLUMN_GAP,
  YEAR_BAR_COURSE_OFFSET,
  CHOICE_SECTION_OFFSET
} from './coursePlanLayout';

export interface YearSection {
  year: number;
  y: number;
  height: number;
}

export function convertCoursePlanToFlow(plan: CoursePlan): {
  nodes: Node<CourseNodeData | CourseChoiceNodeData, string>[];
  edges: Edge<CourseEdgeData, 'courseEdge'>[];
  yearSections: YearSection[];
} {
  const nodes: Node<CourseNodeData | CourseChoiceNodeData, string>[] = [];
  const edges: Edge<CourseEdgeData, 'courseEdge'>[] = [];

  // Pre-compute incoming and outgoing neighbour IDs per node
  const incomingMap = new Map<string, string[]>();
  const outgoingMap = new Map<string, string[]>();

  for (const conn of plan.connections) {
    if (!outgoingMap.has(conn.from)) outgoingMap.set(conn.from, []);
    outgoingMap.get(conn.from)!.push(conn.to);
    if (!incomingMap.has(conn.to)) incomingMap.set(conn.to, []);
    incomingMap.get(conn.to)!.push(conn.from);
  }

  const years = new Set<number>();
  plan.courses.forEach((c) => years.add(c.year));
  plan.choices.forEach((c) => years.add(c.year));
  const sortedYears = Array.from(years).sort((a, b) => a - b);

  const yearSections: YearSection[] = [];
  let currentY = 0;

  for (const year of sortedYears) {
    const yearCourses = plan.courses
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);

    const yearChoices = plan.choices
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);

    // -----------------------------------------------------------------------
    // Build columns for this year.
    // A "column" is a vertical chain: the top course has no same-year
    // prerequisite, and each subsequent course is a same-year successor.
    // -----------------------------------------------------------------------

    // Set of course IDs in this year for quick lookup
    const yearCourseIds = new Set(yearCourses.map((c) => c.id));

    // Find courses that have NO incoming edge from within the same year
    // — these are column roots (they sit at the top of their column)
    const columnRoots = yearCourses.filter((c) => {
      const incoming = incomingMap.get(c.id) ?? [];
      return !incoming.some((id) => yearCourseIds.has(id));
    });

    // Build each column by following same-year outgoing edges downward
    type Column = Course[];
    const columns: Column[] = [];
    const placed = new Set<string>();

    for (const root of columnRoots) {
      const column: Course[] = [];
      let current: Course | undefined = root;
      while (current && !placed.has(current.id)) {
        column.push(current);
        placed.add(current.id);
        // Find the next course in the same year via an outgoing edge
        const nextId: string | undefined = (outgoingMap.get(current.id) ?? []).find((id) =>
          yearCourseIds.has(id)
        );
        current = nextId ? yearCourses.find((c) => c.id === nextId) : undefined;
      }
      columns.push(column);
    }

    // Any courses not placed (e.g. in a cycle or disconnected) get their own column
    for (const course of yearCourses) {
      if (!placed.has(course.id)) {
        columns.push([course]);
        placed.add(course.id);
      }
    }


    const maxColumnLength = Math.max(1, ...columns.map((col) => col.length));

    // Calculate this year's section height based on the tallest column
    // Account for choice nodes too — each choice stacks its options vertically
    const choiceHeight = yearChoices.reduce((max, choice) => {
      const h =
        choice.options.length * NODE_HEIGHT +
        (choice.options.length - 1) * COLUMN_GAP + // gaps between options
        40; // OR label height
      return Math.max(max, h);
    }, 0);

    const courseColumnHeight =
      maxColumnLength * NODE_HEIGHT +
      (maxColumnLength - 1) * COLUMN_GAP;

    const contentHeight = Math.max(courseColumnHeight, choiceHeight);
    const sectionHeight = contentHeight + YEAR_SECTION_PADDING * 2;


    yearSections.push({ year, y: currentY, height: sectionHeight });

    // -----------------------------------------------------------------------
    // Position courses within their columns
    // -----------------------------------------------------------------------
    const courseStartX = YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET;
    let x = courseStartX;

    for (const column of columns) {
      let y = currentY + YEAR_SECTION_PADDING;
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

    // Place choices after courses
    if (yearChoices.length > 0) {
      x += CHOICE_SECTION_OFFSET;
    }
    for (const choice of yearChoices) {
      nodes.push({
        id: choice.id,
        type: 'courseChoice',
        position: { x, y: currentY + YEAR_SECTION_PADDING },
        data: {
          choice: choice,
          incomingIds: incomingMap.get(choice.id) ?? [],
          outgoingIds: outgoingMap.get(choice.id) ?? [],
        } satisfies CourseChoiceNodeData,
        draggable: false,
      });
      x += (NODE_WIDTH + HORIZONTAL_GAP) * Math.max(1, choice.options.length) + 80;
    }
    currentY += sectionHeight;
  }

  // Edges
  for (const conn of plan.connections) {
    edges.push({
      id: conn.id,
      source: conn.from,
      target: conn.to,
      sourceHandle: 'source',
      targetHandle: `target-${conn.from}`,  // must match the handle id in CourseNode
      type: 'courseEdge',
      data: { connectionType: conn.type as ConnectionType },
    });
  }

  return { nodes, edges, yearSections };
}