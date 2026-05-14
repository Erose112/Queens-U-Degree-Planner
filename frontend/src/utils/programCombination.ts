/**
 * programCombinations.ts
 *
 * Business logic for program combination selection, credit calculation,
 * and validation.
 *
 * Credit rules (Queen's Academic Calendar, Academic Programs section 2):
 *
 *   Common Courses — a course in the core/options (mandatory) of TWO OR
 *       MORE plans may be double-counted toward both, up to a combined cap of
 *       12.0 units.
 *
 *   Supporting / Additional Required Courses — a course that is a
 *       *supporting requirement* (is_required=false / LOGIC_CHOOSE_CREDITS)
 *       for Plan A and a *mandatory requirement* (is_required=true /
 *       LOGIC_REQUIRED) for Plan B may be double-counted toward both, with
 *       no unit cap.
 *
 *   The effective total is:
 *     Σ(program.program_credits)
 *       − Rule 2b savings  (mandatory+supporting overlaps, uncapped)
 *       − Rule 2a savings  (mandatory+mandatory overlaps, capped at 12.0)
 *
 *   Each qualifying course is deducted once even if shared across 3+ plans.
 *
 * Degree credit limits:
 *   Honours degrees (BAH, BSH, BCH, BFH, BMS): 120.0 units
 *   General degrees (BA, BSC, BCP, BFA, BMT):   90.0 units
 */

import type { ProgramStructure, Course, Program } from "../types/plan";
import { SelectedPrograms, StructureCache } from "../types/plan"
import { LOGIC_CHOOSE_CREDITS, LOGIC_REQUIRED } from "./program";
import { getCreditLimitForCombination } from "./credits";

/** Maximum units that can be saved via the Rule 2a common-course mechanism. */
const COMMON_COURSE_CAP = 12;

export type CombinationId =
  | "major"
  | "specialization"
  | "specialization_minor"
  | "major_minor"
  | "major_double_minor"
  | "double_major"
  | "general";

/**
 * The role a slot plays within a combination.
 * Drives which program_type values appear in that slot's dropdown.
 */
export type ProgramRole = "specialization" | "major" | "minor" | "general";

export interface ProgramSlot {
  /** Unique key within this combination — used as the record key everywhere. */
  key: string;
  /** Human-readable label shown above the dropdown. */
  label: string;
  /** program_type values accepted in this slot (matched case-insensitively). */
  allowedTypes: ProgramRole[];
}

export interface CombinationConfig {
  id: CombinationId;
  /** Short label on the picker pill. */
  label: string;
  /** One-line description shown under the picker. */
  description: string;
  slots: ProgramSlot[];
}


//  Combination configs 
export const COMBINATIONS: CombinationConfig[] = [
  {
    id: "major",
    label: "Major",
    description: "A single major program (when exceeding the minimum unit threshold).",
    slots: [
      { key: "primary", label: "Major", allowedTypes: ["major"] },
    ],
  },
  {
    id: "specialization",
    label: "Specialization",
    description: "A single honours specialization program.",
    slots: [
      { key: "primary", label: "Specialization", allowedTypes: ["specialization"] },
    ],
  },
  {
    id: "specialization_minor",
    label: "Specialization + Minor",
    description: "An honours specialization paired with one minor.",
    slots: [
      { key: "primary", label: "Specialization", allowedTypes: ["specialization"] },
      { key: "minor1",  label: "Minor",           allowedTypes: ["minor"] },
    ],
  },
  {
    id: "major_minor",
    label: "Major + Minor",
    description: "One major program paired with one minor.",
    slots: [
      { key: "primary", label: "Major", allowedTypes: ["major"] },
      { key: "minor1",  label: "Minor", allowedTypes: ["minor"] },
    ],
  },
  {
    id: "major_double_minor",
    label: "Major + Double Minor",
    description: "One major program paired with two distinct minors.",
    slots: [
      { key: "primary", label: "Major",        allowedTypes: ["major"] },
      { key: "minor1",  label: "First Minor",  allowedTypes: ["minor"] },
      { key: "minor2",  label: "Second Minor", allowedTypes: ["minor"] },
    ],
  },
  {
    id: "double_major",
    label: "Double Major",
    description: "Two major programs pursued simultaneously.",
    slots: [
      { key: "primary",    label: "First Major",  allowedTypes: ["major"] },
      { key: "secondary",  label: "Second Major", allowedTypes: ["major"] },
    ],
  },
  {
    id: "general",
    label: "General",
    description: "A three-year Bachelor of Arts degree without honours.",
    slots: [
      { key: "primary", label: "General Program", allowedTypes: ["general"] },
    ],
  }
];


/**
 * Returns the minimum unit threshold for a program based on its degree type.
 *
 * A standalone Major is only permitted without a Minor when the Major exceeds
 * these thresholds (Academic Calendar, Academic Programs section 1):
 *
 * - Bachelor of Arts (Honours): 48 units
 * - Bachelor of Science (Honours): 60 units
 * - Bachelor of Computing (Honours): 60 units
 * - Other programs: null (no minimum / rule does not apply)
 */
export function getMinimumUnitsForProgram(programName: string): number | null {
  const name = programName.toLowerCase();
  if (name.includes("bachelor of arts")) return 48;
  if (name.includes("bachelor of fine art")) return 48;
  if (name.includes("bachelor of science")) return 60;
  if (name.includes("bachelor of computing")) return 60;
  return null;
}


/**
 * Returns true when a program_type string satisfies one of the allowed roles.
 *
 * "specialization" uses .includes() so "Honours Specialization",
 * "Joint Honours Specialization", etc. all match.
 * "major" is checked exactly so an Honours Major is still captured.
 */
export function programMatchesRole(
  programType: string,
  allowedRoles: ProgramRole[]
): boolean {
  const t = programType.toLowerCase().trim();
  return allowedRoles.some((role) => {
    switch (role) {
      case "specialization": return t.includes("specialization");
      case "major":          return t.includes("major") && !t.includes("specialization");
      case "minor":          return t === "minor";
      case "general":        return t === "general";
      default:               return false;
    }
  });
}

/**
 * Returns the subset of allPrograms valid for a slot,
 * excluding programs already selected in other slots.
 */
export function programsForSlot(
  allPrograms: Program[],
  slot: ProgramSlot,
  currentSelections: SelectedPrograms,
  thisSlotKey: string
): Program[] {
  const takenIds = new Set(
    Object.entries(currentSelections)
      .filter(([key, val]) => key !== thisSlotKey && val !== null)
      .map(([, val]) => val!.program_id)
  );

  return allPrograms
    .filter(
      (p) =>
        programMatchesRole(p.program_type, slot.allowedTypes) &&
        !takenIds.has(p.program_id)
    )
    .sort((a, b) => a.program_name.localeCompare(b.program_name));
}


function flatCourses(structure: ProgramStructure): Course [] {
  return structure.sections.flatMap((s) => s.section_courses);
}


function mandatoryCourses(structure: ProgramStructure): Course[] {
  return structure.sections
    .filter((s) => s.logic_type === LOGIC_REQUIRED)
    .flatMap((s) => s.section_courses);
}

function supportingCourses(structure: ProgramStructure): Course[] {
  return structure.sections
    .filter((s) => s.logic_type === LOGIC_CHOOSE_CREDITS)
    .flatMap((s) => s.section_courses);
}



export interface CreditSummary {
  /** Naïve sum of program_credits across all selected programs (no deductions). */
  rawTotal: number;

  /**
   * Rule 2b savings: credits saved when a course is a supporting requirement
   * in one plan and a mandatory requirement in another. No unit cap.
   */
  doubleCountSavings: number;

  /**
   * Rule 2a savings: credits saved when a course is mandatory (core/option)
   * in two or more plans simultaneously. Capped at 12.0 units total.
   */
  commonCourseSavings: number;

  /** rawTotal − doubleCountSavings − commonCourseSavings. */
  effectiveTotal: number;

  /** Sorted course codes double-counted under Rule 2b (for display). */
  doubleCountedCourseCodes: string[];

  /** Sorted course codes shared under Rule 2a (for display). */
  commonCourseCodes: string[];

  /** True when effectiveTotal > the applicable degree credit limit. */
  exceedsLimit: boolean;

  /** effectiveTotal − applicable limit. Negative = units still available. */
  delta: number;

  /** The credit limit that was applied (90 for general, 120 for honours). */
  creditLimit: number;
}

/**
 * Calculates effective total credits for the current selection.
 *
 * Implements both Queen's double-counting rules (Academic Programs section 2):
 *   - Rule 2a: mandatory+mandatory overlap, capped at COMMON_COURSE_CAP (12 units)
 *   - Rule 2b: mandatory+supporting overlap, uncapped
 *
 * Programs whose structure hasn't been fetched yet still contribute
 * their program_credits to rawTotal but are excluded from double-count
 * analysis — a conservative choice that avoids showing inflated savings.
 *
 * @param selections        Slot key → Program | null
 * @param cache             Lazily-loaded ProgramStructure objects, keyed by program_id
 * @param combinationId     Used to determine the applicable credit limit
 */
export function calculateCombinationCredits(
  selections: SelectedPrograms,
  cache: StructureCache,
  selectedSubplans: Record<string, number[]>,
  subplanCache: Record<number, { subplan_id: number; subplan_credits: number | null }[]>,
  combinationId?: CombinationId
): CreditSummary {
  const creditLimit = getCreditLimitForCombination(combinationId ?? "major");

  const programs = Object.values(selections).filter(
    (p): p is ProgramStructure => p !== null
  );

  if (programs.length === 0) {
    return {
      rawTotal: 0,
      doubleCountSavings: 0,
      commonCourseSavings: 0,
      effectiveTotal: 0,
      doubleCountedCourseCodes: [],
      commonCourseCodes: [],
      exceedsLimit: false,
      delta: -creditLimit,
      creditLimit,
    };
  }

  const rawTotal = programs.reduce((sum, p) => {
    let credits = p.program_credits;

    const slotKey = Object.keys(selections).find(
      k => selections[k]?.program_id === p.program_id
    );
    const chosenSubplanIds = slotKey ? (selectedSubplans[slotKey] ?? []) : [];

    // Sum credits from all selected subplans
    for (const subplanId of chosenSubplanIds) {
      const subplan = (subplanCache[p.program_id] ?? []).find(
        s => s.subplan_id === subplanId
      );
      const subplanCredits = subplan?.subplan_credits ?? 0;
      credits += subplanCredits;
    }
    return sum + credits;
  }, 0);


  // Only run double-count analysis when ≥2 structures are loaded
  const structures = programs
    .map((p) => cache[p.program_id])
    .filter((s): s is ProgramStructure => s !== undefined);

  if (structures.length < 2) {
    return {
      rawTotal,
      doubleCountSavings: 0,
      commonCourseSavings: 0,
      effectiveTotal: rawTotal,
      doubleCountedCourseCodes: [],
      commonCourseCodes: [],
      exceedsLimit: rawTotal > creditLimit,
      delta: rawTotal - creditLimit,
      creditLimit,
    };
  }

  // Build per-structure maps: course_id → Course
  const mandatoryMaps = structures.map((s) => {
    const m = new Map<number, Course>();
    mandatoryCourses(s).forEach((c) => m.set(c.course_id, c));
    return m;
  });
  const supportingMaps = structures.map((s) => {
    const m = new Map<number, Course>();
    supportingCourses(s).forEach((c) => m.set(c.course_id, c));
    return m;
  });

  // All unique course IDs across every loaded structure
  const allCourseIds = new Set<number>(
    structures.flatMap((s) => flatCourses(s).map((c) => c.course_id))
  );

  const doubleCountedCourseCodes: string[] = [];
  const commonCourseCodes: string[] = [];
  let doubleCountSavings = 0;  // Rule 2b — uncapped
  let commonCourseSavings = 0; // Rule 2a — capped at COMMON_COURSE_CAP

  for (const courseId of allCourseIds) {
    const isMandatoryAnywhere  = mandatoryMaps.some((m) => m.has(courseId));
    const isSupportingAnywhere = supportingMaps.some((m) => m.has(courseId));
    const mandatoryPlanCount   = mandatoryMaps.filter((m) => m.has(courseId)).length;

    const courseObj =
      mandatoryMaps.find((m) => m.has(courseId))?.get(courseId) ??
      supportingMaps.find((m) => m.has(courseId))?.get(courseId);
    const credits = courseObj?.credits ?? 3;

    if (isMandatoryAnywhere && isSupportingAnywhere) {
      // Rule 2b: supporting in one plan, mandatory in another — no cap.
      // Takes priority over 2a if the course qualifies under both.
      doubleCountSavings += credits;
      if (courseObj?.course_code) {
        doubleCountedCourseCodes.push(courseObj.course_code);
      }
    } else if (mandatoryPlanCount >= 2 && commonCourseSavings < COMMON_COURSE_CAP) {
      // Rule 2a: core/option requirement in 2+ plans — capped at 12.0 units total.
      const toAdd = Math.min(credits, COMMON_COURSE_CAP - commonCourseSavings);
      commonCourseSavings += toAdd;
      if (courseObj?.course_code) {
        commonCourseCodes.push(courseObj.course_code);
      }
    }
  }

  const effectiveTotal = rawTotal - doubleCountSavings - commonCourseSavings;

  return {
    rawTotal,
    doubleCountSavings,
    commonCourseSavings,
    effectiveTotal,
    doubleCountedCourseCodes: doubleCountedCourseCodes.sort(),
    commonCourseCodes: commonCourseCodes.sort(),
    exceedsLimit: effectiveTotal > creditLimit,
    delta: effectiveTotal - creditLimit,
    creditLimit,
  };
}


/** Per-slot and global errors. Keys match slot.key or "credits". */
export type CombinationErrors = Partial<Record<string, string>>;

/**
 * Validates a complete combination selection.
 * Returns {} when the selection is valid and ready to submit.
 */
export function validateCombination(
  combination: CombinationConfig,
  selections: SelectedPrograms,
  cache: StructureCache,
  selectedSubplans: Record<string, number[]>,
  subplanCache: Record<number, { subplan_id: number; subplan_credits: number | null }[]>
): CombinationErrors {
  const errors: CombinationErrors = {};

  for (const slot of combination.slots) {
    if (!selections[slot.key]) {
      errors[slot.key] = `Please select a ${slot.label.toLowerCase()}.`;
    }
  }

  // Run credit check only when all slots are filled
  const allFilled = combination.slots.every((s) => selections[s.key] !== null);
  if (allFilled) {
    const summary = calculateCombinationCredits(
      selections,
      cache,
      selectedSubplans,
      subplanCache,
      combination.id   // pass combination so the right limit is used
    );

    if (combination.id === "major") {
      // Standalone major: check the program-specific minimum unit threshold
      const program = selections.primary!;
      const minimumUnits = getMinimumUnitsForProgram(program.program_name);

      if (minimumUnits !== null && summary.effectiveTotal < minimumUnits) {
        errors.credits =
          `${program.program_name} requires a minimum of ${minimumUnits} units. ` +
          `Your current selection totals ${summary.effectiveTotal} units.`;
      } else if (summary.exceedsLimit) {
        errors.credits =
          `This combination totals ${summary.effectiveTotal} units — ` +
          `${summary.delta} over the ${summary.creditLimit}-unit degree limit.`;
      }
    } else if (summary.exceedsLimit) {
      errors.credits =
        `This combination totals ${summary.effectiveTotal} units — ` +
        `${summary.delta} over the ${summary.creditLimit}-unit degree limit.`;
    }
  }

  return errors;
}

/** Creates a blank selections map (all slots null) for a combination. */
export function emptySelections(combination: CombinationConfig): SelectedPrograms {
  return Object.fromEntries(combination.slots.map((s) => [s.key, null]));
}

/**
 * True only when every slot has a selection AND its structure is in the cache.
 * Useful for deciding whether to show a "loading structure…" indicator.
 */
export function allStructuresLoaded(
  combination: CombinationConfig,
  selections: SelectedPrograms,
  cache: StructureCache
): boolean {
  return combination.slots.every((s) => {
    const prog = selections[s.key];
    return prog !== null && cache[prog.program_id] !== undefined;
  });
}

/**
 * Checks if the form is complete enough to display the generate button.
 *
 * Requirements:
 * 1. All slots must be filled with a program selection
 * 2. Any program with subplans must have one selected
 * 3. Subplan data must be fully loaded for programs that have them
 *
 * Returns false while still loading subplans; returns true when ready to submit.
 */
export function isFormComplete(
  combination: CombinationConfig,
  selections: SelectedPrograms,
  selectedSubplans: Record<string, number[]>,
  subplanCache: Record<number, { subplan_id: number; subplan_credits: number | null }[]>
): boolean {
  const allFilled = combination.slots.every((s) => selections[s.key] !== null);
  if (!allFilled) return false;

  for (const slot of combination.slots) {
    const prog = selections[slot.key];
    if (!prog || (prog.num_subplans_required ?? 0) <= 0) continue;

    const subplans = subplanCache[prog.program_id];
    if (subplans === undefined) return false;

    const numRequired = prog.num_subplans_required ?? 0;
    const numSelected = (selectedSubplans[slot.key] ?? []).length;
    
    // Only require subplans if there are available options
    if (subplans.length > 0 && numSelected < numRequired) return false;
  }

  return true;
}