import { getPrograms, getProgramStructure } from "../services/programs";
import { CourseSection, ProgramSection, ProgramStructure } from "../types/program";
import { LOGIC_REQUIRED, SelectedCourse } from "./programUtils";

const programs = await getPrograms();
const programId = programs[0]?.program_id;
const structureJson = await getProgramStructure(programId);

const structure = structureJson as unknown as ProgramStructure;


// Public API
/**
 * Find a section that can be overfilled:
 * Returns a section whose courses have enough combined credits that
 * selecting all of them would exceed credit_req, along with an
 * ordered list of courses to add and the one that tips it over.
 */
export function findOverfillableSection(): {
  section: ProgramSection;
  fillWith: number[];
  overflow: number;
} | null {
  for (const section of structure.sections) {
    // LOGIC_REQUIRED sections mandate all courses — no credit cap to overflow
    if (section.logic_type === LOGIC_REQUIRED) continue;

    const courses = [...section.courses].sort(
      (a, b) => (a.credits ?? 0) - (b.credits ?? 0)
    );
    let accumulated = 0;
    const fillWith: number[] = [];
    let overflow: number | null = null;

    for (const course of courses) {
      const cr = course.credits ?? 0;
      if (accumulated + cr <= section.credit_req) {
        accumulated += cr;
        fillWith.push(course.course_id);
      } else if (overflow === null) {
        overflow = course.course_id;
      }
    }

    if (accumulated === section.credit_req && overflow !== null) {
      return { section, fillWith, overflow };
    }
  }
  return null;
}


/**
 * isSectionComplete
 *
 * Returns true when the section's logic rule is satisfied by the selected courses.
 *
 * Logic rules:
 *  - LOGIC_REQUIRED (1):       All courses must be selected; earned credits must reach credit_req.
 *  - LOGIC_CHOOSE_CREDITS (2): Selected courses must sum to = credit_req credits.
 *
 * @param section     The program section to evaluate.
 * @param selectedIds The set of course IDs currently in the student's plan.
 */
export function isSectionComplete(
  section: ProgramSection,
  selectedIds: number[]
): boolean {
  const selectedSet = new Set(selectedIds);

  const earned = section.courses
    .filter((c) => selectedSet.has(c.course_id))
    .reduce((sum, c) => sum + (c.credits ?? 0), 0);

  if (section.logic_type === LOGIC_REQUIRED) {
    // All courses in the section must be present
    return section.courses.every((c) => selectedSet.has(c.course_id));
  } else {
    // Must accumulate at least credit_req credits from the section's options
    return earned >= (section.credit_req ?? 0);
  }
}

/**
 * isProgramComplete
 *
 * Returns true when every section is complete AND total earned credits meets
 * the program's overall credit requirement.
 *
 * Sections are treated as independent and non-overlapping.
 *
 * @param program     The full program structure.
 * @param selectedIds The set of course IDs currently in the student's plan.
 */
export function isProgramComplete(
  program: ProgramStructure,
  selectedIds: number[]
): boolean {
  const allSectionsComplete = program.sections.every((section) =>
    isSectionComplete(section, selectedIds)
  );
  if (!allSectionsComplete) return false;

  const selectedSet = new Set(selectedIds);
  const totalEarned = program.sections
    .flatMap((s) => s.courses)
    .filter((c) => selectedSet.has(c.course_id))
    .reduce((sum, c) => sum + (c.credits ?? 0), 0);

  return totalEarned >= program.total_credits;
}

/**
 * creditsByYear
 *
 * Returns a mapping of year → total credits placed in that year.
 * All four years are always present in the output (defaulting to 0).
 *
 * @param plan    The current list of placed courses.
 * @param courses A flat list of all CourseSection objects (used to look up credits).
 */
export function creditsByYear(
  plan: SelectedCourse[],
  courses: CourseSection[]
): Record<1 | 2 | 3 | 4, number> {
  const creditMap = new Map(courses.map((c) => [c.course_id, c.credits ?? 0]));

  const result: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const entry of plan) {
    result[entry.year] += creditMap.get(entry.courseId) ?? 0;
  }
  return result;
}

/**
 * creditsBySection
 *
 * Returns a mapping of section_id → total credits from that section currently
 * in the plan. Every section in the input is always represented (defaulting to 0).
 *
 * @param plan     The current list of placed courses.
 * @param sections The full list of program sections.
 */
export function creditsBySection(
  plan: SelectedCourse[],
  sections: ProgramSection[]
): Record<number, number> {
  const selectedSet = new Set(plan.map((p) => p.courseId));

  const result: Record<number, number> = {};
  for (const section of sections) {
    result[section.section_id] = section.courses
      .filter((c) => selectedSet.has(c.course_id))
      .reduce((sum, c) => sum + (c.credits ?? 0), 0);
  }
  return result;
}