import { describe, it, expect } from "vitest";

import {
  canTakeCourse,
  findEarliestYear,
  getDependents,
  prereqSetsFor,
  buildPrereqPlan,
} from "../utils/prerequisiteUtils";
import {
  isSectionComplete,
  creditsByYear,
  creditsBySection,
  findOverfillableSection,
} from "../utils/creditUtils";
import { 
  type SelectedCourse, 
  coursesWithPrereqs,
  coursesWithNoPrereqs,
  coursesInSections,
  allCourses,
  buildSatisfyingSelection,
} from "../utils/programUtils";
import { getPrerequisiteGraph, getProgramStructure, getPrograms } from "../services/programs";
import { PrerequisiteGraph, ProgramStructure } from "../types/program";


const programs = await getPrograms();
const programId = programs[0]?.program_id;
const graphJson = await getPrerequisiteGraph(programId);
const graph     = graphJson    as unknown as PrerequisiteGraph;

const structureJson = await getProgramStructure(programId);
const structure = structureJson as unknown as ProgramStructure;

console.log(structure.sections.map(s => ({
  name: s.section_name,
  logic_type: s.logic_type
})));



// canTakeCourse
describe("canTakeCourse", () => {
  it("returns valid for a no-prereq course on an empty plan", () => {
    const id = coursesWithNoPrereqs()[0];
    expect(id).toBeDefined(); // guard: mock must have at least one no-prereq course
    const result = canTakeCourse(id, 1, [], graph, structure);
    expect(result.valid).toBe(true);
  });

  it("returns missing_prereqs when prerequisites are absent from the plan", () => {
    const id = coursesWithPrereqs()[0];
    expect(id).toBeDefined();
    // targetYear=4 gives the most room; an empty plan still can't satisfy prereqs
    const result = canTakeCourse(id, 4, [], graph, structure);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_prereqs");
    expect(result.missing!.length).toBeGreaterThan(0);
  });

  it("returns missing_prereqs when a prerequisite is in the same year (not prior)", () => {
    const courseId = coursesWithPrereqs()[0];
    expect(courseId).toBeDefined();
    const sets = prereqSetsFor(courseId);
    const firstPrereq = sets[0].courseIds[0];

    // Place the prereq in the SAME year as the course → must fail
    const plan: SelectedCourse[] = [{ courseId: firstPrereq, year: 2, addedBy: "user" }];
    const result = canTakeCourse(courseId, 2, plan, graph, structure);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("missing_prereqs");
  });

  it("returns valid when all prerequisites are satisfied in prior years", () => {
    const courseId = coursesWithPrereqs()[0];
    expect(courseId).toBeDefined();
    const plan = buildPrereqPlan(courseId, 4);
    expect(plan).not.toBeNull();
    const result = canTakeCourse(courseId, 4, plan!, graph, structure);
    expect(result.valid).toBe(true);
  });

  it("returns exceeds_section_credits when the section cap is already reached", () => {
    const overfill = findOverfillableSection();
    if (!overfill) {
      console.warn("No overfillable section found in mock — skipping test");
      return;
    }
    const { fillWith, overflow } = overfill;
    const plan: SelectedCourse[] = fillWith.map((id) => ({
      courseId: id,
      year: 1,
      addedBy: "user",
    }));
    const result = canTakeCourse(overflow, 1, plan, graph, structure);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("exceeds_section_credits");
  });

  it("returns exceeds_year_credits when the year cap is reached", () => {
    const YEAR_CAP = 30;

    // Find any course with enough credits to matter
    const anyNode = graph.nodes.find((n) => (n.credits ?? 0) > 0);
    expect(anyNode).toBeDefined();
    const creditPerCourse = anyNode!.credits!;

    // How many courses fill the year exactly to the cap?
    const countToFill = Math.floor(YEAR_CAP / creditPerCourse);
    if (countToFill >= graph.nodes.length) {
      console.warn("Not enough nodes to fill year cap — skipping test");
      return;
    }

    // Use nodes that have no prereqs and aren't in any section (to avoid side effects)
    const noPrereqIds = coursesWithNoPrereqs();
    const sectionIds = new Set(coursesInSections());
    const orphans = noPrereqIds.filter((id) => !sectionIds.has(id));

    if (orphans.length < countToFill + 1) {
      console.warn("Not enough orphan nodes to fill year cap — skipping test");
      return;
    }

    const plan: SelectedCourse[] = orphans
      .slice(0, countToFill)
      .map((id) => ({ courseId: id, year: 1, addedBy: "user" }));

    const overflow = orphans[countToFill];
    const result = canTakeCourse(overflow, 1, plan, graph, structure);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("exceeds_year_credits");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findEarliestYear
// ─────────────────────────────────────────────────────────────────────────────

describe("findEarliestYear", () => {
  it("returns 1 for every course with no prerequisites", () => {
    for (const id of coursesWithNoPrereqs()) {
      expect(findEarliestYear(id, graph, []), `course ${id}`).toBe(1);
    }
  });

  it("returns 1 when a course has prerequisites but none are placed yet", () => {
    for (const id of coursesWithPrereqs()) {
      expect(findEarliestYear(id, graph, []), `course ${id}`).toBe(1);
    }
  });

  it("returns year after the prerequisite when it is placed", () => {
    const courseId = coursesWithPrereqs()[0];
    const sets = prereqSetsFor(courseId);
    const prereqId = sets[0].courseIds[0];

    // Place the prereq in each year and verify the result is always prereqYear + 1
    const yearsToTest: Array<1 | 2 | 3 | 4> = [1, 2, 3];
    for (const prereqYear of yearsToTest) {
      const plan: SelectedCourse[] = [{ courseId: prereqId, year: prereqYear, addedBy: "user" }];
      const expected = Math.min(prereqYear + 1, 4) as 1 | 2 | 3 | 4;
      expect(
        findEarliestYear(courseId, graph, plan),
        `prereq in y${prereqYear}`
      ).toBe(expected);
    }
  });

  it("never returns a year greater than 4", () => {
    // Place every prereq in year 4 and verify result is always ≤ 4
    for (const courseId of coursesWithPrereqs()) {
      const plan: SelectedCourse[] = prereqSetsFor(courseId)
        .flatMap(({ courseIds }) => courseIds)
        .map((id) => ({ courseId: id, year: 4 as const, addedBy: "user" as const }));
      expect(findEarliestYear(courseId, graph, plan), `course ${courseId}`).toBeLessThanOrEqual(4);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDependents
// ─────────────────────────────────────────────────────────────────────────────

describe("getDependents", () => {
  it("never includes the root course itself", () => {
    for (const { course_id } of graph.nodes) {
      const plan: SelectedCourse[] = [{ courseId: course_id, year: 1, addedBy: "user" }];
      expect(
        getDependents(course_id, plan, graph),
        `course ${course_id}`
      ).not.toContain(course_id);
    }
  });

  it("returns an empty array when no dependents are in the plan", () => {
    // For every node that has outgoing edges, a plan containing ONLY that node
    // has no dependents placed → result should be empty
    const sources = [...new Set(graph.edges.map((e) => e.from_course_id))];
    for (const id of sources) {
      const plan: SelectedCourse[] = [{ courseId: id, year: 1, addedBy: "user" }];
      expect(getDependents(id, plan, graph), `course ${id}`).toEqual([]);
    }
  });

  it("returns direct dependents that are in the plan", () => {
    // For each edge A→B, build a plan with both, remove A, expect B in result
    for (const edge of graph.edges) {
      const plan: SelectedCourse[] = [
        { courseId: edge.from_course_id, year: 1, addedBy: "user" },
        { courseId: edge.to_course_id,   year: 2, addedBy: "user" },
      ];
      const result = getDependents(edge.from_course_id, plan, graph);

      // Only expect the dependent if removing from_course_id actually breaks to_course_id
      // (it might survive if the set has other satisfied alternatives)
      const sets = prereqSetsFor(edge.to_course_id);
      const setForThisEdge = sets.find((s) => s.setId === edge.set_id);
      if (!setForThisEdge) continue;

      const prereqSet = graph.prerequisite_sets.find((s) => s.set_id === edge.set_id);
      const minRequired = prereqSet?.min_required ?? setForThisEdge.courseIds.length;

      // If only one course satisfies this set, removal must cascade
      const satisfiedWithoutFrom = setForThisEdge.courseIds
        .filter((id) => id !== edge.from_course_id)
        .filter((id) => plan.some((p) => p.courseId === id)).length;

      if (satisfiedWithoutFrom < minRequired) {
        expect(result, `edge ${edge.from_course_id}→${edge.to_course_id}`).toContain(
          edge.to_course_id
        );
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isSectionComplete
// ─────────────────────────────────────────────────────────────────────────────

describe("isSectionComplete", () => {
  it("returns false for every section when no courses are selected", () => {
    for (const section of structure.sections) {
      expect(isSectionComplete(section, []), section.section_name).toBe(false);
    }
  });

  it("returns true for every section when the minimal satisfying set is selected", () => {
    for (const section of structure.sections) {
      const selection = buildSatisfyingSelection(section);
      if (selection === null) {
        console.warn(`Section "${section.section_name}" cannot be satisfied — skipping`);
        continue;
      }
      expect(isSectionComplete(section, selection), section.section_name).toBe(true);
    }
  });

  it("returns false when one course short of the satisfying set", () => {
    for (const section of structure.sections) {
      const selection = buildSatisfyingSelection(section);
      if (!selection || selection.length === 0) continue;
      const oneShort = selection.slice(0, -1); // drop the last course
      expect(
        isSectionComplete(section, oneShort),
        `${section.section_name} with one less course`
      ).toBe(false);
    }
  });

  it("ignores course IDs that do not belong to the section", () => {
    for (const section of structure.sections) {
      const selection = buildSatisfyingSelection(section);
      if (!selection) continue;
      // Add every other course in the program — should not change the result
      const outsideIds = structure.sections
        .filter((s) => s.section_id !== section.section_id)
        .flatMap((s) => s.courses.map((c) => c.course_id));
      expect(
        isSectionComplete(section, [...selection, ...outsideIds]),
        section.section_name
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// creditsByYear
// ─────────────────────────────────────────────────────────────────────────────

describe("creditsByYear", () => {
  it("always returns all four years in the result", () => {
    const result = creditsByYear([], allCourses);
    expect(Object.keys(result).map(Number).sort()).toEqual([1, 2, 3, 4]);
  });

  it("returns all zeros for an empty plan", () => {
    expect(creditsByYear([], allCourses)).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  it("places each course's credits in the correct year", () => {
    const yearsToTest: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
    for (const year of yearsToTest) {
      const course = allCourses[0]; // any course with known credits
      const plan: SelectedCourse[] = [{ courseId: course.course_id, year, addedBy: "user" }];
      const result = creditsByYear(plan, allCourses);
      expect(result[year], `year ${year}`).toBe(course.credits ?? 0);
      // All other years must be 0
      for (const otherYear of yearsToTest.filter((y) => y !== year)) {
        expect(result[otherYear], `year ${otherYear}`).toBe(0);
      }
    }
  });

  it("sums credits correctly when multiple courses share the same year", () => {
    const courses = allCourses.slice(0, 3);
    const expectedTotal = courses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
    const plan: SelectedCourse[] = courses.map((c) => ({
      courseId: c.course_id,
      year: 1,
      addedBy: "user",
    }));
    expect(creditsByYear(plan, allCourses)[1]).toBe(expectedTotal);
  });

  it("total credits across all years equals total credits in the plan", () => {
    const plan: SelectedCourse[] = allCourses.map((c, i) => ({
      courseId: c.course_id,
      year: ((i % 4) + 1) as 1 | 2 | 3 | 4,
      addedBy: "user",
    }));
    const result = creditsByYear(plan, allCourses);
    const totalFromResult = Object.values(result).reduce((a, b) => a + b, 0);
    const totalExpected = allCourses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
    expect(totalFromResult).toBe(totalExpected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// creditsBySection
// ─────────────────────────────────────────────────────────────────────────────

describe("creditsBySection", () => {
  it("always includes every section in the result", () => {
    const result = creditsBySection([], structure.sections);
    const expectedIds = structure.sections.map((s) => s.section_id).sort();
    expect(Object.keys(result).map(Number).sort()).toEqual(expectedIds);
  });

  it("returns 0 for every section when the plan is empty", () => {
    const result = creditsBySection([], structure.sections);
    for (const section of structure.sections) {
      expect(result[section.section_id], section.section_name).toBe(0);
    }
  });

  it("attributes each course's credits to the correct section", () => {
    for (const section of structure.sections) {
      for (const course of section.courses) {
        const plan: SelectedCourse[] = [{
          courseId: course.course_id,
          year: 1,
          addedBy: "user",
        }];
        const result = creditsBySection(plan, structure.sections);

        // Credits appear in the correct section
        expect(result[section.section_id], `course ${course.course_id}`).toBe(
          course.credits ?? 0
        );

        // All other sections that don't contain this course remain 0
        for (const other of structure.sections) {
          if (other.section_id === section.section_id) continue;
          if (other.courses.some((c) => c.course_id === course.course_id)) continue;
          expect(result[other.section_id], `other section ${other.section_id}`).toBe(0);
        }
      }
    }
  });

  it("sum of all section credits equals total credits in the plan", () => {
    const plan: SelectedCourse[] = allCourses.map((c) => ({
      courseId: c.course_id,
      year: 1,
      addedBy: "user",
    }));
    const result = creditsBySection(plan, structure.sections);
    const totalFromResult = Object.values(result).reduce((a, b) => a + b, 0);
    const totalExpected = allCourses.reduce((sum, c) => sum + (c.credits ?? 0), 0);
    expect(totalFromResult).toBe(totalExpected);
  });
});