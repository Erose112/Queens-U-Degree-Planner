/**
 * testDataExtraction.ts
 *
 * Helpers for extracting dynamic test data from ANY program structure and prerequisite graph.
 * Eliminates hardcoded course IDs and allows tests to run against all database programs.
 */

import type {
  CourseSection,
  PrerequisiteGraph,
  ProgramStructure,
  Program,
} from "../types/plan";
import {
  getPrograms,
  getProgramStructure,
  getPrerequisiteGraph,
} from "../services/api";

/**
 * Categorizes a course by its properties for test selection
 */
export type CourseCategory =
  | "required_no_prereq"
  | "required_with_prereq"
  | "choice_no_prereq"
  | "choice_with_prereq";

/**
 * A course extracted from a program with metadata for testing
 */
export interface DynamicTestCourse {
  courseId: number;
  courseCode: string;
  title: string | null;
  credits: number | null;
  year: 1 | 2 | 3 | 4;
  category: CourseCategory;
  prereqIds: number[];
}

/**
 * Complete context for testing a program, including dynamically extracted courses
 */
export interface WorkflowTestContext {
  program: ProgramStructure;
  graph: PrerequisiteGraph;
  testCourses: {
    requiredNoPrereq: DynamicTestCourse | null;
    requiredWithPrereq: DynamicTestCourse | null;
    choiceNoPrereq: DynamicTestCourse | null;
    choiceWithPrereq: DynamicTestCourse | null;
  };
  prerequisiteChain: DynamicTestCourse[];
}

/**
 * Get courses with prerequisites from the loaded graph
 */
export function coursesWithPrereqs(graph: PrerequisiteGraph): Set<number> {
  const withPrereqs = new Set<number>();
  for (const edge of graph.edges) {
    withPrereqs.add(edge.to_course_id);
  }
  return withPrereqs;
}

/**
 * Get courses without prerequisites from the loaded graph
 */
export function coursesWithNoPrereqs(graph: PrerequisiteGraph): Set<number> {
  const allCourseIds = new Set(graph.nodes.map((n) => n.course_id));
  const withPrereqs = coursesWithPrereqs(graph);
  return new Set(Array.from(allCourseIds).filter((id) => !withPrereqs.has(id)));
}

/**
 * Extract required courses that have no prerequisites
 */
export function getRequiredCoursesWithoutPrereqs(
  program: ProgramStructure,
  graph: PrerequisiteGraph
): CourseSection[] {
  const noPrerequsites = coursesWithNoPrereqs(graph);
  const courses: CourseSection[] = [];

  for (const section of program.sections) {
    for (const course of section.courses) {
      if (
        course.is_required &&
        noPrerequsites.has(course.course_id)
      ) {
        courses.push(course);
      }
    }
  }

  return courses;
}

/**
 * Extract required courses that have prerequisites
 */
export function getRequiredCoursesWithPrereqs(
  program: ProgramStructure,
  graph: PrerequisiteGraph
): CourseSection[] {
  const withPrerequisites = coursesWithPrereqs(graph);
  const courses: CourseSection[] = [];

  for (const section of program.sections) {
    for (const course of section.courses) {
      if (
        course.is_required &&
        withPrerequisites.has(course.course_id)
      ) {
        courses.push(course);
      }
    }
  }

  return courses;
}

/**
 * Extract choice courses that have no prerequisites
 */
export function getChoiceCoursesWithoutPrereqs(
  program: ProgramStructure,
  graph: PrerequisiteGraph
): CourseSection[] {
  const noPrerequsites = coursesWithNoPrereqs(graph);
  const courses: CourseSection[] = [];

  for (const section of program.sections) {
    for (const course of section.courses) {
      if (
        !course.is_required &&
        noPrerequsites.has(course.course_id)
      ) {
        courses.push(course);
      }
    }
  }

  return courses;
}

/**
 * Extract choice courses that have prerequisites
 */
export function getChoiceCoursesWithPrereqs(
  program: ProgramStructure,
  graph: PrerequisiteGraph
): CourseSection[] {
  const withPrerequisites = coursesWithPrereqs(graph);
  const courses: CourseSection[] = [];

  for (const section of program.sections) {
    for (const course of section.courses) {
      if (
        !course.is_required &&
        withPrerequisites.has(course.course_id)
      ) {
        courses.push(course);
      }
    }
  }

  return courses;
}

/**
 * Convert a CourseSection to a DynamicTestCourse with prerequisites extracted
 */
function toDynamicTestCourse(
  course: CourseSection,
  category: CourseCategory,
  graph: PrerequisiteGraph
): DynamicTestCourse {
  // Extract prerequisites for this course
  const prereqIds = new Set<number>();
  for (const edge of graph.edges) {
    if (edge.to_course_id === course.course_id) {
      prereqIds.add(edge.from_course_id);
    }
  }

  return {
    courseId: course.course_id,
    courseCode: course.course_code,
    title: course.title,
    credits: course.credits,
    year: 1, // Default; will be adjusted based on prerequisite placement
    category,
    prereqIds: Array.from(prereqIds),
  };
}

/**
 * Build a prerequisite chain for cascade testing.
 * Returns a sequence like [A, B, C] where A→B→C (A is prereq of B, etc.)
 */
export function buildPrerequisiteChain(
  program: ProgramStructure,
  graph: PrerequisiteGraph,
  maxChainLength: number = 3
): DynamicTestCourse[] {
  const chain: DynamicTestCourse[] = [];
  const visited = new Set<number>();

  // Find a course with prerequisites to start the chain
  const withPrereqs = coursesWithPrereqs(graph);
  const startCandidate = graph.nodes.find((n) => withPrereqs.has(n.course_id));

  if (!startCandidate) return [];

  let currentId = startCandidate.course_id;
  let depth = 0;

  // Walk backwards through prerequisites
  while (depth < maxChainLength && !visited.has(currentId)) {
    visited.add(currentId);

    // Find the course in the program
    let courseSection: CourseSection | null = null;
    for (const section of program.sections) {
      const found = section.courses.find((c) => c.course_id === currentId);
      if (found) {
        courseSection = found;
        break;
      }
    }

    // If course is not in program, it might be a prereq-only node
    if (!courseSection) {
      const node = graph.nodes.find((n) => n.course_id === currentId);
      if (node) {
        courseSection = {
          course_id: currentId,
          course_code: node.course_code,
          title: node.title,
          credits: node.credits,
          description: null,
          is_required: node.node_type === "required",
        };
      }
    }

    if (courseSection) {
      const category: CourseCategory = courseSection.is_required
        ? coursesWithNoPrereqs(graph).has(currentId)
          ? "required_no_prereq"
          : "required_with_prereq"
        : coursesWithNoPrereqs(graph).has(currentId)
          ? "choice_no_prereq"
          : "choice_with_prereq";

      chain.push(toDynamicTestCourse(courseSection, category, graph));
    }

    // Find a prerequisite of current course
    const prereq = graph.edges.find((e) => e.to_course_id === currentId);
    if (prereq) {
      currentId = prereq.from_course_id;
    } else {
      break; // No more prerequisites
    }

    depth++;
  }

  // Reverse so it goes from root prerequisite to dependent
  return chain.reverse();
}

/**
 * Build a complete test context for a given program
 */
export async function buildWorkflowTestContext(
  programId: number
): Promise<WorkflowTestContext> {
  const [program, graph] = await Promise.all([
    getProgramStructure(programId) as Promise<ProgramStructure>,
    getPrerequisiteGraph(programId) as Promise<PrerequisiteGraph>,
  ]);

  const requiredNoPrereq = getRequiredCoursesWithoutPrereqs(program, graph);
  const requiredWithPrereq = getRequiredCoursesWithPrereqs(program, graph);
  const choiceNoPrereq = getChoiceCoursesWithoutPrereqs(program, graph);
  const choiceWithPrereq = getChoiceCoursesWithPrereqs(program, graph);

  return {
    program,
    graph,
    testCourses: {
      requiredNoPrereq: requiredNoPrereq.length > 0
        ? toDynamicTestCourse(requiredNoPrereq[0], "required_no_prereq", graph)
        : null,
      requiredWithPrereq: requiredWithPrereq.length > 0
        ? toDynamicTestCourse(requiredWithPrereq[0], "required_with_prereq", graph)
        : null,
      choiceNoPrereq: choiceNoPrereq.length > 0
        ? toDynamicTestCourse(choiceNoPrereq[0], "choice_no_prereq", graph)
        : null,
      choiceWithPrereq: choiceWithPrereq.length > 0
        ? toDynamicTestCourse(choiceWithPrereq[0], "choice_with_prereq", graph)
        : null,
    },
    prerequisiteChain: buildPrerequisiteChain(program, graph),
  };
}

/**
 * Get programs suitable for testing (limited to a reasonable subset)
 */
export async function getTestingPrograms(): Promise<Program[]> {
  const allPrograms = await getPrograms();
  // Test with up to 3 programs to keep test suite fast
  return allPrograms.slice(0, Math.min(3, allPrograms.length));
}

/**
 * Find a course with OR-style prerequisites across multiple programs
 */
export function findCourseWithOrPrereqs(
  contexts: Map<number, WorkflowTestContext>
): { programId: number; courseId: number } | null {
  for (const [progId, ctx] of contexts) {
    for (const node of ctx.graph.nodes) {
      const edges = ctx.graph.edges.filter((e) => e.to_course_id === node.course_id);
      if (edges.length === 0) continue;

      const setIds = new Set(edges.map((e) => e.set_id));
      for (const setId of setIds) {
        const prereqSet = ctx.graph.prerequisite_sets.find((s) => s.set_id === setId);
        // OR-set has min_required === 1
        if (prereqSet && prereqSet.min_required === 1) {
          return { programId: progId, courseId: node.course_id };
        }
      }
    }
  }
  return null;
}

/**
 * Find a section with overfillable capacity (more courses than required credits)
 */
export function findOverfillableSectionInProgram(
  program: ProgramStructure
): { section: any; fillWith: number[]; overflow: number } | null {
  for (const section of program.sections) {
    if (section.logic_type === 2) { // LOGIC_CHOOSE_CREDITS
      // Find the minimum set of courses that satisfies the credit requirement
      const candidates = section.courses.filter((c) => !c.is_required);
      if (candidates.length < 2) continue;

      let filledCredits = 0;
      const fillWith: number[] = [];

      for (const course of candidates) {
        const credits = course.credits ?? 0;
        if (filledCredits >= section.credit_req) break;
        fillWith.push(course.course_id);
        filledCredits += credits;
      }

      if (filledCredits >= section.credit_req && candidates.length > fillWith.length) {
        return {
          section,
          fillWith,
          overflow: candidates.find((c) => !fillWith.includes(c.course_id))?.course_id ?? 0,
        };
      }
    }
  }
  return null;
}
