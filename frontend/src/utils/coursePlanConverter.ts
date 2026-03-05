import type { Node, Edge } from '@xyflow/react';
import type { CoursePlan, Course, ConnectionType, CourseNodeData, CourseChoiceNodeData } from '../types';
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
  CHOICE_SECTION_OFFSET
} from './coursePlanLayout';

export interface YearSection {
  year: number;
  y: number;
  height: number;
}

const MAX_COLS = 5; // Maximum columns (course chains) per row before wrapping

// Helper: Calculate grid dimensions for choice options
function getChoiceGridDimensions(numOptions: number) {
  const cols = Math.ceil(Math.sqrt(numOptions));
  const rows = Math.ceil(numOptions / cols);
  const width = cols * (NODE_WIDTH + 10);
  const height = rows * (NODE_HEIGHT + 10) + (rows - 1) * 20;
  return { cols, rows, width, height };
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
    if (!outgoingMap.has(conn.from_course)) outgoingMap.set(conn.from_course, []);
    outgoingMap.get(conn.from_course)!.push(conn.to_course);
    if (!incomingMap.has(conn.to_course)) incomingMap.set(conn.to_course, []);
    incomingMap.get(conn.to_course)!.push(conn.from_course);
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

    let yearChoices = plan.choices
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);

    // -----------------------------------------------------------------------
    // Filter out choice options that are already rendered as standalone courses
    // -----------------------------------------------------------------------
    const yearCourseIds = new Set(yearCourses.map((c) => c.id));
    yearChoices = yearChoices
      .map((choice) => ({
        ...choice,
        // Remove options that already exist as standalone course nodes
        options: choice.options.filter((opt) => !yearCourseIds.has(opt.id)),
      }))
      // Skip entire choice groups if all options were filtered out
      .filter((choice) => choice.options.length > 0);

    // -----------------------------------------------------------------------
    // Build columns for this year.
    // A "column" is a vertical chain: the top course has no same-year
    // prerequisite, and each subsequent course is a same-year successor.
    // -----------------------------------------------------------------------

    // Find courses that have NO incoming edge from within the same year
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

    // Any courses not placed get their own column
    for (const course of yearCourses) {
      if (!placed.has(course.id)) {
        columns.push([course]);
        placed.add(course.id);
      }
    }

    // -----------------------------------------------------------------------
    // Split columns into rows of MAX_COLS
    // -----------------------------------------------------------------------
    const columnRows: Column[][] = [];
    for (let i = 0; i < columns.length; i += MAX_COLS) {
      columnRows.push(columns.slice(i, i + MAX_COLS));
    }

    // Calculate total course content height: sum of each row's tallest column
    const courseContentHeight = columnRows.reduce((totalH, rowCols, rowIndex) => {
      const rowMaxLen = Math.max(1, ...rowCols.map((col) => col.length));
      const rowHeight = rowMaxLen * NODE_HEIGHT + (rowMaxLen - 1) * COLUMN_GAP;
      // Add row padding between rows (not after the last row)
      return totalH + rowHeight + (rowIndex < columnRows.length - 1 ? ROW_PADDING : 0);
    }, 0);

    // Calculate choice height (for all choices stacked vertically)
    const allChoicesHeight = yearChoices.reduce((totalH, choice, idx) => {
      const { height } = getChoiceGridDimensions(choice.options.length);
      return totalH + height + (idx < yearChoices.length - 1 ? COLUMN_GAP : 0);
    }, 0);

    const contentHeight = Math.max(courseContentHeight, allChoicesHeight);
    const sectionHeight = contentHeight + YEAR_SECTION_PADDING * 2;

    yearSections.push({ year, y: currentY, height: sectionHeight });

    // -----------------------------------------------------------------------
    // Position courses row by row
    // -----------------------------------------------------------------------
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

      // Advance Y by this row's height plus inter-row padding (except after last row)
      const isLastRow = rowIndex === columnRows.length - 1;
      rowY += rowMaxLen * NODE_HEIGHT + (rowMaxLen - 1) * COLUMN_GAP + (isLastRow ? 0 : ROW_PADDING);
    }

    // -----------------------------------------------------------------------
    // Place choices to the right of the courses
    // -----------------------------------------------------------------------
    // Calculate the actual width used by courses (based on the widest row)
    let maxCourseWidth = 0;
    for (const rowCols of columnRows) {
      const rowWidth = rowCols.length * (NODE_WIDTH + HORIZONTAL_GAP) - HORIZONTAL_GAP;
      maxCourseWidth = Math.max(maxCourseWidth, rowWidth);
    }
    
    const choiceStartX = courseStartX + maxCourseWidth + CHOICE_SECTION_OFFSET;
    let choiceX = choiceStartX;
    let choiceY = currentY + YEAR_SECTION_PADDING;

    for (const choice of yearChoices) {
      const { width, height } = getChoiceGridDimensions(choice.options.length);
      
      nodes.push({
        id: choice.id,
        type: 'courseChoice',
        position: { x: choiceX, y: choiceY },
        data: {
          choice,
          incomingIds: incomingMap.get(choice.id) ?? [],
          outgoingIds: outgoingMap.get(choice.id) ?? [],
        } satisfies CourseChoiceNodeData,
        draggable: false,
        measured: { width, height },
        width: width,
        height: height,
      });
      
      choiceY += height + COLUMN_GAP;
    }

    currentY += sectionHeight;
  }

  // -------------------------------------------------------------------------
  // Edges
  // -------------------------------------------------------------------------
  for (const conn of plan.connections) {
    edges.push({
      id: conn.id,
      source: conn.from_course,
      target: conn.to_course,
      sourceHandle: 'source',
      targetHandle: `target-${conn.from_course}`,
      type: 'courseEdge',
      data: { connectionType: conn.type as ConnectionType },
    });
  }

  return { nodes, edges, yearSections };
}