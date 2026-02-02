import type { Node, Edge } from '@xyflow/react';
import type { CoursePlan, Course, CourseChoice, ConnectionType } from '../types';
import type { CourseNodeData, CourseChoiceNodeData, YearBarNodeData } from '../types';
import type { CourseEdgeData } from '../components/CourseEdge';
import {
  YEAR_BAR_WIDTH,
  NODE_WIDTH,
  NODE_HEIGHT,
  HORIZONTAL_GAP,
  VERTICAL_GAP,
  YEAR_BAR_COURSE_OFFSET,
} from './coursePlanLayout';

export function convertCoursePlanToFlow(plan: CoursePlan): {
  nodes: Node<CourseNodeData | CourseChoiceNodeData | YearBarNodeData, string>[];
  edges: Edge<CourseEdgeData, 'courseEdge'>[];
} {
  const nodes: Node<CourseNodeData | CourseChoiceNodeData | YearBarNodeData, string>[] = [];
  const edges: Edge<CourseEdgeData, 'courseEdge'>[] = [];

  const years = new Set<number>();
  plan.courses.forEach((c) => years.add(c.year));
  plan.choices.forEach((c) => years.add(c.year));
  const sortedYears = Array.from(years).sort((a, b) => a - b);

  let currentY = 0;

  for (const year of sortedYears) {
    const sectionTopY = currentY;
    // One row per year (courses/choices laid out horizontally)
    const sectionHeight = NODE_HEIGHT + VERTICAL_GAP;

    // Vertical year bar segment on the left
    nodes.push({
      id: `year-${year}`,
      type: 'yearBar',
      position: { x: 0, y: sectionTopY },
      data: { year, height: sectionHeight } satisfies YearBarNodeData,
      width: YEAR_BAR_WIDTH,
      height: sectionHeight,
      draggable: false,
      selectable: false,
    });

    // Courses in this year (by position)
    const yearCourses = plan.courses
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);
    const yearChoices = plan.choices
      .filter((c) => c.year === year)
      .sort((a, b) => a.position - b.position);

    // Merge courses and choices by position for layout
    type RowItem = { type: 'course'; course: Course } | { type: 'choice'; choice: CourseChoice };
    const rowItems: RowItem[] = [];
    let ci = 0;
    let chi = 0;
    while (ci < yearCourses.length || chi < yearChoices.length) {
      const c = yearCourses[ci];
      const ch = yearChoices[chi];
      if (c != null && (ch == null || c.position <= ch.position)) {
        rowItems.push({ type: 'course', course: c });
        ci++;
      } else if (ch != null) {
        rowItems.push({ type: 'choice', choice: ch });
        chi++;
      }
    }

    const courseStartX = YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET;
    let x = courseStartX;
    for (const item of rowItems) {
      if (item.type === 'course') {
        nodes.push({
          id: item.course.id,
          type: 'course',
          position: { x, y: currentY },
          data: { course: item.course } satisfies CourseNodeData,
          draggable: false,
        });
        x += NODE_WIDTH + HORIZONTAL_GAP;
      } else {
        nodes.push({
          id: item.choice.id,
          type: 'courseChoice',
          position: { x, y: currentY },
          data: { choice: item.choice } satisfies CourseChoiceNodeData,
          draggable: false,
        });
        // Choice takes more width (multiple options)
        x += (NODE_WIDTH + HORIZONTAL_GAP) * Math.max(1, item.choice.options.length) + 80;
      }
    }

    currentY += sectionHeight;
  }

  // Edges from connections
  for (const conn of plan.connections) {
    edges.push({
      id: conn.id,
      source: conn.from,
      target: conn.to,
      type: 'courseEdge',
      data: { connectionType: conn.type as ConnectionType } satisfies CourseEdgeData,
    });
  }

  return { nodes, edges };
}
