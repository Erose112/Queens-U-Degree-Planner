/**
 * programCombinations.ts
 *
 * Business logic for program combination selection, credit calculation,
 * and validation. No React — independently testable.
 *
 * Credit rule (Queen's):
 *   A course that is a *supporting requirement* (is_required=false) for
 *   Plan A and a *mandatory requirement* (is_required=true) for Plan B
 *   may be double-counted toward both. The effective total is:
 *
 *     Σ(program.total_credits) − (unique double-counted courses × their credits)
 *
 *   Each qualifying course is deducted once even if shared across 3+ plans.
 */

import type { ProgramStructure, Course, Program } from "../types/plan";
import { SelectedPrograms, StructureCache } from "../types/plan"
import { LOGIC_CHOOSE_CREDITS, LOGIC_REQUIRED, CREDIT_LIMIT } from "./program";


export type CombinationId =
  | "major"
  | "specialization"
  | "specialization_minor"
  | "major_minor"
  | "major_double_minor"
  | "double_major";

/**
 * The role a slot plays within a combination.
 * Drives which program_type values appear in that slot's dropdown.
 */
export type ProgramRole = "specialization" | "major" | "minor";

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
];


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
  /** Naïve sum of total_credits across all selected programs (no deductions). */
  rawTotal: number;
  /**
   * Credits saved via the Queen's double-counting rule.
   * Uses the real CourseSection.credits value; falls back to 3 when null.
   */
  doubleCountSavings: number;
  /** rawTotal − doubleCountSavings — the value checked against the 120-unit cap. */
  effectiveTotal: number;
  /** Sorted course codes that were double-counted (for display). */
  doubleCountedCourseCodes: string[];
  /** True when effectiveTotal > CREDIT_LIMIT. */
  exceedsLimit: boolean;
  /** effectiveTotal − CREDIT_LIMIT. Negative = units still available. */
  delta: number;
}

/**
 * Calculates effective total credits for the current selection.
 *
 * Programs whose structure hasn't been fetched yet still contribute
 * their total_credits to rawTotal but are excluded from double-count
 * analysis — a conservative choice that avoids showing inflated savings.
 *
 * @param selections  Slot key → Program | null
 * @param cache       Lazily-loaded ProgramStructure objects, keyed by program_id
 */
export function calculateCombinationCredits(
  selections: SelectedPrograms,
  cache: StructureCache,
  selectedSubplans: Record<string, number | null>,
  subplanCache: Record<number, { subplan_id: number; subplan_credits: number | null }[]>
): CreditSummary {
  const programs = Object.values(selections).filter(
    (p): p is ProgramStructure => p !== null
  );
  // Debug logging disabled

  if (programs.length === 0) {
    return {
      rawTotal: 0,
      doubleCountSavings: 0,
      effectiveTotal: 0,
      doubleCountedCourseCodes: [],
      exceedsLimit: false,
      delta: -CREDIT_LIMIT,
    };
  }

  const rawTotal = programs.reduce((sum, p) => {
    // Base program credits
    let credits = p.total_credits;

    // Find if this program has a chosen subplan
    const slotKey = Object.keys(selections).find(
      k => selections[k]?.program_id === p.program_id
    );
    const chosenSubplanId = slotKey ? (selectedSubplans[slotKey] ?? null) : null;

    if (chosenSubplanId !== null) {
      const subplan = (subplanCache[p.program_id] ?? []).find(
        s => s.subplan_id === chosenSubplanId
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
      effectiveTotal: rawTotal,
      doubleCountedCourseCodes: [],
      exceedsLimit: rawTotal > CREDIT_LIMIT,
      delta: rawTotal - CREDIT_LIMIT,
    };
  }

  // Build per-structure maps: course_id → CourseSection
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
  let doubleCountSavings = 0;

  for (const courseId of allCourseIds) {
    const isMandatoryAnywhere  = mandatoryMaps.some((m) => m.has(courseId));
    const isSupportingAnywhere = supportingMaps.some((m) => m.has(courseId));

    if (isMandatoryAnywhere && isSupportingAnywhere) {
      // Prefer the mandatory map to get the canonical credit value
      const courseObj =
        mandatoryMaps.find((m) => m.has(courseId))?.get(courseId) ??
        supportingMaps.find((m) => m.has(courseId))?.get(courseId);

      doubleCountSavings += courseObj?.credits ?? 3;

      if (courseObj?.course_code) {
        doubleCountedCourseCodes.push(courseObj.course_code);
      }
    }
  }

  const effectiveTotal = rawTotal - doubleCountSavings;

  return {
    rawTotal,
    doubleCountSavings,
    effectiveTotal,
    doubleCountedCourseCodes: doubleCountedCourseCodes.sort(),
    exceedsLimit: effectiveTotal > CREDIT_LIMIT,
    delta: effectiveTotal - CREDIT_LIMIT,
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
  selectedSubplans: Record<string, number | null>,
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
    const summary = calculateCombinationCredits(selections, cache, selectedSubplans, subplanCache);
    if (summary.exceedsLimit) {
      errors.credits =
        `This combination totals ${summary.effectiveTotal} units — ` +
        `${summary.delta} over the 120-unit degree limit.`;
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
  selectedSubplans: Record<string, number | null>,
  subplanCache: Record<number, { subplan_id: number; subplan_credits: number | null }[]>
): boolean {
  // All slots must be filled
  const allFilled = combination.slots.every((s) => selections[s.key] !== null);
  if (!allFilled) return false;

  // Every program with has_subplans must have a subplan chosen
  for (const slot of combination.slots) {
    const prog = selections[slot.key];
    if (!prog?.has_subplans) continue;

    // Still fetching subplans — not complete yet
    const subplans = subplanCache[prog.program_id];
    if (subplans === undefined) return false;

    // Subplans exist but none chosen
    if (subplans.length > 0 && !selectedSubplans[slot.key]) return false;
  }

  return true;
}