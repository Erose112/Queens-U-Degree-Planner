import { create } from 'zustand';
import { ProgramStructure, PrerequisiteGraph, SelectedCourse, ProgramSection } from '../types/plan';
import { LOGIC_REQUIRED, canTakeCourse, findEarliestYear, getCoursesToRemove } from '../utils/program';
import { mergeGraphs, pruneGraph } from '../utils/graph';
import { isCourseRequired } from '../utils/prerequisites';
import { getPrerequisiteCourseGraph, getPrerequisiteGraph, getProgramStructure } from '../services/api';

interface PlanStore {
  programs: ProgramStructure[];
  graph: PrerequisiteGraph | null;
  selectedCourses: SelectedCourse[];
  courseErrors: Map<number, string>;
  loadError: string | null;
  electiveGraphCache: Map<number, PrerequisiteGraph>;


  loadProgram: (programId: number, subplanId?: number | null) => Promise<void>;
  unloadProgram: (programId: number) => void;
  addCourse: (courseCode: string, courseId: number) => void;
  removeCourse: (courseId: number) => void;
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
      }));
      get().autoFillRequired();
    } catch {
      set({ loadError: `Failed to load program ${programId}.` });
    }
  },

  unloadProgram: (programId) => {
    const { programs, graph } = get();
    const remaining = programs.filter(p => p.program_id !== programId);
    set({
      programs: remaining,
      graph: graph ? pruneGraph(graph, remaining) : null,
      selectedCourses: get().selectedCourses.filter(c => c.addedBy === 'user'),
      courseErrors: new Map(),
    });
    get().autoFillRequired();
  },

  addCourse: async (courseCode, courseId, isElective = false) => {
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
          set(state => ({
            electiveGraphCache: new Map(state.electiveGraphCache).set(courseId, electiveGraph!),
            graph: mergeGraphs(state.graph, electiveGraph!),
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

    const earliestYear = findEarliestYear(courseCode);
    let placedYear: 1 | 2 | 3 | 4 | null = null;
    let lastFailReason = 'Cannot be placed in any year';

    for (let y = earliestYear; y <= 4; y++) {
      const year = y as 1 | 2 | 3 | 4;

      const result = canTakeCourse(courseId, year, selectedCourses, activeGraph, programs, isElective);
      console.log(`[addCourse] Validation for course ${courseCode} (ID: ${courseId}) in year ${year}:`, activeGraph, result);

      if (result.valid) {
        placedYear = year;
        console.log(`[addCourse] Placing course ${courseCode} (ID: ${courseId}) in year ${year}`);
        break;
      }

      lastFailReason = result.reason ?? lastFailReason;
    }

    if (placedYear === null) {
      set(state => ({
        courseErrors: new Map(state.courseErrors).set(courseId, lastFailReason),
      }));
      return;
    }

    // Successfully adding, clear this course's error and re-evaluate all other errored courses
    set(state => {
      const newSelectedCourses = [
        ...state.selectedCourses,
        { courseId, year: placedYear!, addedBy: 'user' as const },
      ];

      const errors = new Map(state.courseErrors);
      errors.delete(courseId);

      // Re-validate all previously errored courses against the updated plan
      for (const [erroredId] of errors) {
        const erroredNode = activeGraph.nodes.find(n => n.course_id === erroredId);
        if (!erroredNode) continue;
        const erroredYear = findEarliestYear(erroredNode.course_code);
        const recheck = canTakeCourse(erroredId, erroredYear, newSelectedCourses, activeGraph, programs, isElective);
        if (recheck.valid) errors.delete(erroredId);
      }

      return {
        selectedCourses: newSelectedCourses,
        courseErrors: errors,
      };
    });
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

    // Sort by year level derived from course code
    const ordered = [...requiredCourses].sort(
      (a, b) => findEarliestYear(a.courseCode) - findEarliestYear(b.courseCode)
    );

    let prev = -1;
    do {
      prev = get().selectedCourses.length;

      for (const { courseId, courseCode } of ordered) {
        const { selectedCourses } = get();
        if (selectedCourses.some(c => c.courseId === courseId)) continue;

        const year = findEarliestYear(courseCode);

        console.log(`[autoFillRequired] Auto-adding course ${courseCode} (ID: ${courseId}) for year ${year}`);

        set(state => ({
          selectedCourses: [
            ...state.selectedCourses,
            { courseId, year, addedBy: 'autofill' as const },
          ],
        }));
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
    });
  },

  resetPlan: () => {
    set({ selectedCourses: [], courseErrors: new Map() });
    get().autoFillRequired();
  },
}));