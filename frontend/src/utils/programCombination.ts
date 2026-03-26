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

import type { Program, ProgramStructure, CourseSection } from "../types/plan";

// Re-export api types so callers only need one import
export type { Program, ProgramStructure };


export type CombinationId =
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


/** Slot key → selected Program (null = nothing chosen yet). */
export type SelectedPrograms = Record<string, Program | null>;

/**
 * Lazily-populated cache of ProgramStructure objects keyed by program_id.
 * Fetched once per program when the user selects it; avoids loading
 * every structure upfront.
 */
export type StructureCache = Record<number, ProgramStructure>;

// ─── Combination configs ───────────────────────────────────────────────────────

export const COMBINATIONS: CombinationConfig[] = [
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
      case "major":          return t === "major" || t === "honours major";
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


function flatCourses(structure: ProgramStructure): CourseSection[] {
  return structure.sections.flatMap((s) => s.courses);
}

/**
 * Courses the student *must* take (is_required = true).
 * These are treated as mandatory for double-counting analysis.
 */
export function mandatoryCourses(structure: ProgramStructure): CourseSection[] {
  return flatCourses(structure).filter((c) => c.is_required);
}

/**
 * Choice/elective courses (is_required = false).
 * When one of these is also mandatory in another plan it qualifies
 * for double-counting.
 */
export function supportingCourses(structure: ProgramStructure): CourseSection[] {
  return flatCourses(structure).filter((c) => !c.is_required);
}


export const CREDIT_LIMIT = 120;

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
export function calculateCredits(
  selections: SelectedPrograms,
  cache: StructureCache
): CreditSummary {
  const programs = Object.values(selections).filter(
    (p): p is Program => p !== null
  );

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

  const rawTotal = programs.reduce((sum, p) => sum + p.total_credits, 0);

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
    const m = new Map<number, CourseSection>();
    mandatoryCourses(s).forEach((c) => m.set(c.course_id, c));
    return m;
  });
  const supportingMaps = structures.map((s) => {
    const m = new Map<number, CourseSection>();
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
  cache: StructureCache
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
    const summary = calculateCredits(selections, cache);
    if (summary.exceedsLimit) {
      errors.credits =
        `This combination totals ${summary.effectiveTotal} units — ` +
        `${summary.delta} over the 120-unit degree limit.`;
    }
  }

  return errors;
}


/** Returns the CombinationConfig for a given id (throws if unknown). */
export function getCombination(id: CombinationId): CombinationConfig {
  const combo = COMBINATIONS.find((c) => c.id === id);
  if (!combo) throw new Error(`Unknown combination id: ${id}`);
  return combo;
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