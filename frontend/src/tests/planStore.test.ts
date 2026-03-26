/**
 * planStore.test.ts
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { usePlanStore } from "../store/planStore";
import {
  getPrerequisiteGraph,
  getProgramStructure,
  getPrograms,
} from "../services/api";
import type { PrerequisiteGraph, ProgramStructure } from "../types/plan";
import {
  buildWorkflowTestContext,
  getTestingPrograms,
  type WorkflowTestContext,
} from "./testDataExtraction";


// Fetched once for the entire file. Store tests reset Zustand in their own
// beforeEach so these objects are read-only from the tests' perspective.
let graph: PrerequisiteGraph;
let program: ProgramStructure;

beforeAll(async () => {
  const programs = await getPrograms();
  const programId: number = programs[0].program_id; // program 1
  [program, graph] = await Promise.all([
    getProgramStructure(programId) as Promise<ProgramStructure>,
    getPrerequisiteGraph(programId) as Promise<PrerequisiteGraph>,
  ]);
});


describe("API Services", () => {
  it("getPrograms returns a non-empty list with the expected shape", async () => {
    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
    expect(programs[0]).toMatchObject({
      program_id: expect.any(Number),
      program_name: expect.any(String),
      program_type: expect.any(String),
      total_credits: expect.any(Number),
    });
  });

  it("getProgramStructure returns section and course data for program 1", () => {
    expect(program.program_id).toBe(1);
    expect(program.sections.length).toBeGreaterThan(0);
    expect(program.sections[0].courses.length).toBeGreaterThan(0);
  });

  it("getPrerequisiteGraph returns nodes, edges, and prerequisite_sets for program 1", () => {
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.prerequisite_sets.length).toBeGreaterThan(0);
  });
});


// Workflow Simulation — Full User Journey with Dynamic Program Data
describe("Workflow Simulation - Full User Journey", () => {
  let testPrograms: Array<any> = [];
  let contexts: WorkflowTestContext[] = [];

  beforeAll(async () => {
    testPrograms = await getTestingPrograms();
    contexts = await Promise.all(
      testPrograms.map((p) => buildWorkflowTestContext(p.program_id))
    );
  });

  beforeEach(() => {
    usePlanStore.setState({
      programs: [],
      graph: null,
      selectedCourses: [],
      lastError: null,
    });
  });

  it("loads ANY program from the database and auto-fills required courses", async () => {
    if (testPrograms.length === 0) return;

    const programId = testPrograms[0].program_id;
    await usePlanStore.getState().loadProgram(programId);
    const state = usePlanStore.getState();

    expect(state.programs).toHaveLength(1);
    expect(state.selectedCourses.length).toBeGreaterThan(0);
    expect(state.selectedCourses.some((c) => c.addedBy === "autofill")).toBe(true);
  });

  it("allows adding a choice course from the dynamically loaded program", async () => {
    if (testPrograms.length === 0 || !contexts[0]) return;

    const ctx = contexts[0];
    const choiceCourse = ctx.testCourses.choiceNoPrereq;

    if (!choiceCourse) return; // Skip if program has no choice courses

    await usePlanStore.getState().loadProgram(ctx.program.program_id);
    usePlanStore.getState().addCourse(choiceCourse.courseId);

    const ids = usePlanStore.getState().selectedCourses.map((c) => c.courseId);
    expect(ids).toContain(choiceCourse.courseId);
  });

  it("cascades removal when a prerequisite course is deleted", async () => {
    if (testPrograms.length === 0 || !contexts[0]) return;

    const ctx = contexts[0];
    const chain = ctx.prerequisiteChain;

    if (chain.length < 2) return; // Need at least 2 courses in chain

    await usePlanStore.getState().loadProgram(ctx.program.program_id);

    // Inject the chain manually
    usePlanStore.setState((s) => ({
      selectedCourses: [
        ...s.selectedCourses,
        { courseId: chain[0].courseId, year: 1 as const, addedBy: "user" as const },
        { courseId: chain[1].courseId, year: 2 as const, addedBy: "user" as const },
      ],
    }));

    // Remove the prerequisite → should cascade
    usePlanStore.getState().removeCourse(chain[0].courseId);

    const ids = usePlanStore.getState().selectedCourses.map((c) => c.courseId);
    expect(ids).not.toContain(chain[0].courseId);
    expect(ids).not.toContain(chain[1].courseId);
  });

  it("resets to autofilled state without losing the loaded program", async () => {
    if (testPrograms.length === 0 || !contexts[0]) return;

    const ctx = contexts[0];
    const choiceCourse = ctx.testCourses.choiceNoPrereq;

    await usePlanStore.getState().loadProgram(ctx.program.program_id);
    const autofillCount = usePlanStore.getState().selectedCourses.length;

    if (choiceCourse) {
      usePlanStore.getState().addCourse(choiceCourse.courseId);
    }

    usePlanStore.getState().resetPlan();

    // Should be back to autofilled count
    expect(usePlanStore.getState().selectedCourses.length).toBe(autofillCount);

    // Program should still be loaded
    expect(usePlanStore.getState().programs).toHaveLength(1);
  });

  it("handles unloading and reloading a program consistently", async () => {
    if (testPrograms.length === 0 || !contexts[0]) return;

    const ctx = contexts[0];
    const programId = ctx.program.program_id;

    await usePlanStore.getState().loadProgram(programId);
    const autofilled1 = usePlanStore
      .getState()
      .selectedCourses.filter((c) => c.addedBy === "autofill");

    usePlanStore.getState().unloadProgram(programId);
    expect(usePlanStore.getState().programs).toHaveLength(0);
    expect(usePlanStore.getState().selectedCourses).toHaveLength(0);

    await usePlanStore.getState().loadProgram(programId);
    const autofilled2 = usePlanStore
      .getState()
      .selectedCourses.filter((c) => c.addedBy === "autofill");

    expect(autofilled2.length).toBe(autofilled1.length);
  });

  it("supports loading multiple programs and preserves courses across programs", async () => {
    if (testPrograms.length < 2 || contexts.length < 2) return;

    const prog1 = testPrograms[0];
    const prog2 = testPrograms[1];

    await usePlanStore.getState().loadProgram(prog1.program_id);
    const count1 = usePlanStore.getState().selectedCourses.length;

    await usePlanStore.getState().loadProgram(prog2.program_id);
    const count2 = usePlanStore.getState().selectedCourses.length;

    expect(count2).toBeGreaterThanOrEqual(count1);
    expect(usePlanStore.getState().programs).toHaveLength(2);
  });
});


// Year Placement Strategy
describe("Workflow Simulation - Year Placement", () => {
  let contexts: WorkflowTestContext[] = [];

  beforeAll(async () => {
    const testPrograms = await getTestingPrograms();
    contexts = await Promise.all(
      testPrograms.map((p) => buildWorkflowTestContext(p.program_id))
    );
  });

  beforeEach(() => {
    usePlanStore.setState({
      programs: [],
      graph: null,
      selectedCourses: [],
      lastError: null,
    });
  });

  it("places courses in correct years based on prerequisite dependencies", async () => {
    if (contexts.length === 0) return;

    const ctx = contexts[0];
    const chain = ctx.prerequisiteChain;

    if (chain.length < 2) return;

    await usePlanStore.getState().loadProgram(ctx.program.program_id);

    const prereq = usePlanStore
      .getState()
      .selectedCourses.find((c) => c.courseId === chain[0].courseId);
    expect(prereq?.year).toBeLessThanOrEqual(2);
  });
});
