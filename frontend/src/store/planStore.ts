import { create } from 'zustand';
import { ProgramStructure, PrerequisiteGraph, SelectedCourse } from '../types/plan';
import { LOGIC_REQUIRED } from '../utils/program';
import { canTakeCourse, findEarliestYear, getCoursesToRemove } from '../utils/program';
import { mergeGraphs, pruneGraph } from '../utils/graph';
import { getPrerequisiteGraph, getProgramStructure } from '../services/api';

interface PlanStore {
  programs: ProgramStructure[];
  graph: PrerequisiteGraph | null;
  selectedCourses: SelectedCourse[];
  lastError: string | null;

  loadProgram: (programId: number) => Promise<void>;
  unloadProgram: (programId: number) => void;
  addCourse: (courseId: number) => void;
  removeCourse: (courseId: number) => void;
  autoFillRequired: () => void;
  resetPlan: () => void;
}

// Shared helper — checks if a courseId is required by ANY loaded program
function isCourseRequired(courseId: number, programs: ProgramStructure[]): boolean {
  return programs
    .flatMap(p => p.sections)
    .filter(s => s.logic_type === LOGIC_REQUIRED)
    .flatMap(s => s.courses)
    .some(c => c.course_id === courseId);
}

export const usePlanStore = create<PlanStore>((set, get) => ({
  programs: [],
  graph: null,
  selectedCourses: [],
  lastError: null,

  loadProgram: async (programId) => {
    const { programs } = get();

    // Already loaded — no-op
    if (programs.some(p => p.program_id === programId)) return;

    try {
      const [structure, graph] = await Promise.all([
        getProgramStructure(programId),
        getPrerequisiteGraph(programId),
      ]);
      set(state => ({
        programs: [...state.programs, structure],
        graph: mergeGraphs(state.graph, graph),
      }));
      get().autoFillRequired();
    } catch {
      set({ lastError: `Failed to load program ${programId}.` });
    }
  },

  unloadProgram: (programId) => {
    const { programs, graph } = get();
    const remaining = programs.filter(p => p.program_id !== programId);
    set({
      programs: remaining,
      graph: graph ? pruneGraph(graph, remaining) : null,
      // Strip autofill courses — autoFillRequired will re-add what's still needed
      selectedCourses: get().selectedCourses.filter(c => c.addedBy === 'user'),
    });
    get().autoFillRequired();
  },

  addCourse: (courseId) => {
    const { graph, programs, selectedCourses } = get();  // programs not structure
    if (!graph || programs.length === 0) return;

    // Reject if already added
    if (selectedCourses.some(c => c.courseId === courseId)) return;

    const year = findEarliestYear(courseId, graph, selectedCourses);

    // canTakeCourse now receives the full programs array
    if (!canTakeCourse(courseId, year, selectedCourses, graph, programs)) {
      set({ lastError: `Prerequisites not met for course ${courseId}.` });
      return;
    }

    set({
      selectedCourses: [...selectedCourses, { courseId, year, addedBy: 'user' }],
      lastError: null,
    });
  },

  removeCourse: (courseId) => {
    const { selectedCourses, graph, programs } = get();  // programs not structure
    if (!graph || programs.length === 0) return;

    // Check across ALL loaded programs, not just one
    if (isCourseRequired(courseId, programs)) {
      set({ lastError: 'Required courses cannot be removed.' });
      return;
    }

    const toRemove = new Set([courseId, ...getCoursesToRemove(courseId, selectedCourses, graph)]);
    set({
      selectedCourses: selectedCourses.filter(c => !toRemove.has(c.courseId)),
      lastError: null,
    });
  },

  autoFillRequired: () => {
    const { programs, graph } = get();
    if (!graph || programs.length === 0) return;

    const requiredIds = [
      ...new Set(
        programs
          .flatMap(p => p.sections)
          .filter(s => s.logic_type === LOGIC_REQUIRED)
          .flatMap(s => s.courses)
          .map(c => c.course_id)
      ),
    ];

    const ordered = requiredIds.sort((a, b) =>
      findEarliestYear(a, graph, []) - findEarliestYear(b, graph, [])
    );

    let prev = -1;
    do {
      prev = get().selectedCourses.length;
      for (const id of ordered) {
        const { selectedCourses } = get();
        if (selectedCourses.some(c => c.courseId === id)) continue;
        const year = findEarliestYear(id, graph, selectedCourses);
        if (!canTakeCourse(id, year, selectedCourses, graph, programs)) continue;
        set(state => ({
          selectedCourses: [...state.selectedCourses, { courseId: id, year, addedBy: 'autofill' }],
        }));
      }
    } while (get().selectedCourses.length !== prev);
  },

  resetPlan: () => {
    set({ selectedCourses: [], lastError: null });  // was a comma, needs semicolon
    get().autoFillRequired();
  },
}));