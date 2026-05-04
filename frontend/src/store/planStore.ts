import { create } from 'zustand';
import { ProgramStructure, PrerequisiteGraph, SelectedCourse, ProgramSection, NodeType } from '../types/plan';
import { LOGIC_REQUIRED, findEarliestYear, canTakeCourse, getCoursesToRemove } from '../utils/program';
import { mergeGraphs } from '../utils/graph';
import { isCourseRequired } from '../utils/prerequisites';
import { getPrerequisiteCourseGraph, getPrerequisiteGraph, getProgramStructure } from '../services/api';

interface PlanStore {
  programs: ProgramStructure[];
  graph: PrerequisiteGraph | null;
  selectedCourses: SelectedCourse[];
  courseErrors: Map<number, string>;
  loadError: string | null;
  electiveGraphCache: Map<number, PrerequisiteGraph>;
  selectedSubplan: Record<number, number | null>; // program_id -> subplan_id

  loadProgram: (programId: number, subplanId?: number | null) => Promise<void>;
  addCourse: (courseCode: string, courseId: number, nodeType: NodeType) => void;
  removeCourse: (courseId: number) => void;
  reevaluateAllCourses: () => void;
  autoFillRequired: () => void;
  redoSection: (courseIds: number[]) => void;
  resetPrograms: () => void;
  resetPlan: () => void;
}



export const usePlanStore = create<PlanStore>((set, get) => ({
  programs: [],
  graph: null,
  selectedCourses: [],
  courseErrors: new Map(),
  loadError: null,
  electiveGraphCache: new Map(),
  selectedSubplan: {},

  loadProgram: async (programId: number, subplanId?: number | null) => {
    const { programs } = get();
    if (programs.some(p => p.program_id === programId)) return;

    console.group(`loadProgram: id=${programId} subplanId=${subplanId ?? "none"}`);

    try {
      const [structure, graph] = await Promise.all([
        getProgramStructure(programId),
        getPrerequisiteGraph(programId),
      ]);

      const filteredStructure = {
        ...structure,
        sections: structure.sections.filter(
          (s: ProgramSection) => s.subplan_id == null || s.subplan_id === (subplanId ?? null)
        ),
      };

      set(state => ({
        programs: [...state.programs, filteredStructure],
        graph: mergeGraphs(state.graph, graph),
        selectedSubplan: { ...state.selectedSubplan, [programId]: subplanId ?? null },
      }));
      get().autoFillRequired();
    } catch {
      set({ loadError: `Failed to load program ${programId}.` });
    }
  },

  addCourse: async (courseCode, courseId, nodeType) => {
    console.log(`addCourse: ${courseCode} (ID: ${courseId}) nodeType=${nodeType}`);
    const { graph, programs, selectedCourses, electiveGraphCache } = get();
    if (!graph || programs.length === 0) return;
    if (selectedCourses.some(c => c.courseId === courseId)) return;

    // Determine which graph to validate against
    let activeGraph = graph;
    const isInGraph = graph.nodes.some(n => n.course_id === courseId);

    if (!isInGraph) {
      // Check cache first
      let electiveGraph = electiveGraphCache.get(courseId);

      if (!electiveGraph) {
        try {
          electiveGraph = await getPrerequisiteCourseGraph(courseId);
          console.log(`[addCourse] Fetched elective graph for course ${courseCode} (ID: ${courseId}):`, electiveGraph);
          if (!electiveGraph) {
            set(state => ({
              courseErrors: new Map(state.courseErrors).set(courseId, 'Failed to load prerequisites for this course.'),
            }));
            return;
          }
          set(state => ({
            electiveGraphCache: new Map(state.electiveGraphCache).set(courseId, electiveGraph!),
            graph: mergeGraphs(state.graph, electiveGraph),
          }));
        } catch {
          set(state => ({
            courseErrors: new Map(state.courseErrors).set(courseId, 'Failed to load prerequisites for this course.'),
          }));
          return;
        }
        activeGraph = get().graph!;
      } else {
        activeGraph = mergeGraphs(graph, electiveGraph);
      }
    }

    const placedYear = findEarliestYear(courseId, selectedCourses, activeGraph, programs, nodeType);

    if (placedYear === null) {
      // Call canTakeCourse at year 4 to surface the most meaningful reason
      const reason = canTakeCourse(courseId, 4, selectedCourses, activeGraph, programs, nodeType).reason
        ?? 'Cannot be placed in any year';
      set(state => ({
        courseErrors: new Map(state.courseErrors).set(courseId, reason),
      }));
      return;
    }

    set(state => {
      const newSelectedCourses = [
        ...state.selectedCourses,
        { courseId, year: placedYear, nodeType },
      ];

      const errors = new Map(state.courseErrors);
      errors.delete(courseId);

      for (const [erroredId] of errors) {
        if (findEarliestYear(erroredId, newSelectedCourses, activeGraph, programs, nodeType) !== null) {
          errors.delete(erroredId);
        }
      }

      return { selectedCourses: newSelectedCourses, courseErrors: errors };
    });

    get().reevaluateAllCourses();
  },

  removeCourse: (courseId) => {
    const { selectedCourses, graph, programs } = get();
    if (!graph || programs.length === 0) return;

    if (isCourseRequired(courseId, programs)) {
      set(state => ({
        courseErrors: new Map(state.courseErrors).set(courseId, 'Required courses cannot be removed.'),
      }));
      return;
    }

    const toRemove = new Set([courseId, ...getCoursesToRemove(courseId, selectedCourses, graph, programs)]);
    set({
      selectedCourses: selectedCourses.filter(c => !toRemove.has(c.courseId)),
    });
  },


  reevaluateAllCourses: () => {
    const { selectedCourses, graph, programs } = get();
    if (!graph || programs.length === 0) return;

    // Topological sort using Kahn's algorithm
    // Only consider edges where both endpoints are in the current plan
    const plannedIds = new Set(selectedCourses.map(c => c.courseId));

    const inDegree = new Map<number, number>();
    const dependents = new Map<number, number[]>(); // prereq → courses that depend on it

    for (const course of selectedCourses) {
      if (!inDegree.has(course.courseId)) inDegree.set(course.courseId, 0);
      if (!dependents.has(course.courseId)) dependents.set(course.courseId, []);
    }

    for (const edge of graph.edges) {
      // edge: from_course_id is the prereq, to_course_id depends on it
      if (!plannedIds.has(edge.from_course_id) || !plannedIds.has(edge.to_course_id)) continue;
      inDegree.set(edge.to_course_id, (inDegree.get(edge.to_course_id) ?? 0) + 1);
      dependents.get(edge.from_course_id)!.push(edge.to_course_id);
    }

    const queue = selectedCourses
      .filter(c => (inDegree.get(c.courseId) ?? 0) === 0)
      .map(c => c.courseId);

    const sorted: number[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const dep of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDegree);
        if (newDegree === 0) queue.push(dep);
      }
    }

    // If there's a cycle, append remaining
    for (const course of selectedCourses) {
      if (!sorted.includes(course.courseId)) sorted.push(course.courseId);
    }

    // Re-place each course in topological order
    // Build incrementally so each course is validated against already-placed ones
    const courseMap = new Map(selectedCourses.map(c => [c.courseId, c]));
    const newPlacements: SelectedCourse[] = [];

    for (const courseId of sorted) {
      const original = courseMap.get(courseId)!;
      const bestYear = findEarliestYear(courseId, newPlacements, graph, programs, original.nodeType);
      newPlacements.push({ ...original, year: bestYear ?? original.year });
    }

    set({ selectedCourses: newPlacements });
  },


  autoFillRequired: () => {
    const { programs, graph } = get();
    if (!graph || programs.length === 0) return;

    // Deduplicate by course_id, keeping both id and code
    const requiredCourses = [
      ...new Map(
        programs
          .flatMap(p => p.sections)
          .filter(s => s.logic_type === LOGIC_REQUIRED)
          .flatMap(s => s.section_courses)
          .map(c => [c.course_id, { courseId: c.course_id, courseCode: c.course_code }])
      ).values(),
    ];

    console.log('[autoFillRequired] requiredCourses:', requiredCourses);

    const ordered = [...requiredCourses].sort((a, b) => {
      const numA = parseInt(a.courseCode.match(/\d+/)?.[0] ?? '0');
      const numB = parseInt(b.courseCode.match(/\d+/)?.[0] ?? '0');
      return numA - numB;
    });

    let prev = -1;
    do {
      prev = get().selectedCourses.length;

      for (const { courseId, courseCode } of ordered) {
        const { selectedCourses } = get();
        if (selectedCourses.some(c => c.courseId === courseId)) continue;

        const year = findEarliestYear(courseId, get().selectedCourses, graph, programs, "required");
        if (year !== null) {
          console.log(`[autoFillRequired] Auto-adding ${courseCode} (ID: ${courseId}) in year ${year}`);
          set(state => ({
            selectedCourses: [...state.selectedCourses, { courseId, year, nodeType: 'required' as const }],
          }));
        }
      }
    } while (get().selectedCourses.length !== prev);
  },

  redoSection: (courseIds) => {
    const { selectedCourses, graph, programs } = get();
    if (!graph || programs.length === 0) return;

    const toRemove = new Set<number>();
    for (const courseId of courseIds) {
      if (isCourseRequired(courseId, programs)) continue; // never remove required
      toRemove.add(courseId);
      getCoursesToRemove(courseId, selectedCourses, graph, programs).forEach(id => toRemove.add(id));
    }

    set({
      selectedCourses: selectedCourses.filter(c => !toRemove.has(c.courseId)),
      courseErrors: new Map(),
    });
  },

  resetPrograms: () => {
    set({
      programs: [],
      graph: null,
      selectedCourses: [],
      courseErrors: new Map(),
      loadError: null,
      electiveGraphCache: new Map(),
      selectedSubplan: {},
    });
  },

  resetPlan: () => {
    set({ selectedCourses: [], courseErrors: new Map() });
    get().autoFillRequired();
  },
}));