import { useState, useEffect, useRef, useCallback, useMemo, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import NextPageButton from "../components/NextPageButton";
import { COLOURS } from "../utils/colours";
import { formatProgramName } from "../utils/formatNames";
import { getPrograms, getProgramStructure, getSubplans } from "../services/api";
import { Program, SelectedPrograms, StructureCache, Subplan } from "../types/plan";
import { usePlanStore } from "../store/planStore";
import {
  COMBINATIONS,
  CREDIT_LIMIT,
  type CombinationId,
  type CombinationConfig,
  type CombinationErrors,
  programsForSlot,
  calculateCredits,
  validateCombination,
  emptySelections,
  allStructuresLoaded,
} from "../utils/programCombination";


/** One selected subplan ID per slot key */
type SelectedSubplans = Record<string, number | null>;

/** Cache of subplan lists keyed by program_id */
type SubplanCache = Record<number, Subplan[]>;


const dropdownStyle = (accentColor: string): React.CSSProperties => ({
  background: "white",
  border: `2px solid ${accentColor}`,
  borderRadius: "14px",
  boxShadow: `0 8px 32px ${accentColor}28`,
  zIndex: 50,
  overflow: "hidden",
  maxHeight: "220px",
  display: "flex",
  flexDirection: "column",
  marginTop: "4px",
});


interface ProgramDropdownProps {
  programs: Program[];
  selected: Program | null;
  inputVal: string;
  setInputVal: (v: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (p: Program) => void;
  onClear: () => void;
  label: string;
  error?: string;
  loading: boolean;
  fetchingStructure?: boolean;
}

function ProgramDropdown({
  programs,
  selected,
  inputVal,
  setInputVal,
  open,
  setOpen,
  containerRef,
  onSelect,
  onClear,
  label,
  error,
  loading,
  fetchingStructure,
}: ProgramDropdownProps) {
  const filtered = programs.filter(
    (p) =>
      !inputVal.trim() ||
      formatProgramName(p.program_name)
        .toLowerCase()
        .includes(inputVal.toLowerCase())
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filtered.length > 0) onSelect(filtered[0]);
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[14px] font-semibold uppercase tracking-wider flex items-center gap-2"
        style={{ color: COLOURS.darkGrey }}
      >
        {label}
        {fetchingStructure && (
          <span
            className="text-[14px] font-normal normal-case tracking-normal px-2 py-0.5 rounded-full"
            style={{ background: `${COLOURS.blue}15`, color: COLOURS.blue }}
          >
            Loading details…
          </span>
        )}
      </label>

      <div ref={containerRef} className="relative">
        <input
          className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white font-sans text-[14px] transition-colors focus:outline-none"
          style={{
            borderColor: error ? COLOURS.red : open ? COLOURS.blue : COLOURS.grey,
            color: selected ? COLOURS.blue : COLOURS.darkGrey,
          }}
          type="text"
          placeholder={loading ? "Loading…" : `Search ${label.toLowerCase()}s…`}
          disabled={loading}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            onClear();
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {/* Clear / chevron */}
        <button
          tabIndex={-1}
          className="absolute right-2.5 top-1/2 -translate-y-1/2"
          style={{ background: "transparent", border: "none", cursor: "pointer", color: COLOURS.darkGrey }}
          onClick={() => {
            if (selected || inputVal) { onClear(); setInputVal(""); setOpen(true); }
            else setOpen(!open);
          }}
        >
          {selected || inputVal ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points={open ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
          )}
        </button>

        {open && !loading && (
          <div style={dropdownStyle(COLOURS.blue)}>
            <div
              className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
              style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
            >
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </div>
            <div className="dd-scroll">
              {filtered.length === 0 ? (
                <div className="px-3 py-2.5 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                  No matches for "{inputVal}"
                </div>
              ) : (
                filtered.map((p) => (
                  <div
                    key={p.program_id}
                    className="dd-item px-3 py-2.5 text-[14px] font-medium"
                    style={{
                      color: selected?.program_id === p.program_id ? COLOURS.white : COLOURS.blue,
                      background: selected?.program_id === p.program_id ? COLOURS.blue : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (selected?.program_id !== p.program_id)
                        (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`;
                    }}
                    onMouseLeave={(e) => {
                      if (selected?.program_id !== p.program_id)
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                    onClick={() => onSelect(p)}
                  >
                    {formatProgramName(p.program_name)}
                    {p.program_type && (
                      <span className="ml-2 text-[14px] font-normal opacity-50">{p.program_type}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{error}</p>
      )}
    </div>
  );
}

// ── SubplanPicker ─────────────────────────────────────────────────────────────

interface SubplanPickerProps {
  subplans: Subplan[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean; // true while structure is still being fetched
  error?: string;
}

function SubplanPicker({ subplans, selectedId, onSelect, loading, error }: SubplanPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedSubplan = subplans.find((s) => s.subplan_id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-1.5 animate-slide-down">
      <label
        className="text-[14px] font-semibold uppercase tracking-wider"
        style={{ color: COLOURS.darkGrey }}
      >
        Subplan
        {loading && (
          <span
            className="ml-2 text-[14px] font-normal normal-case tracking-normal px-2 py-0.5 rounded-full"
            style={{ background: `${COLOURS.blue}15`, color: COLOURS.blue }}
          >
            Loading subplans…
          </span>
        )}
      </label>

      <div ref={containerRef} className="relative">
        <button
          onClick={() => !loading && setOpen((v) => !v)}
          disabled={loading}
          className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white font-sans text-[14px] font-medium text-left transition-colors focus:outline-none"
          style={{
            borderColor: error ? COLOURS.red : open ? COLOURS.blue : COLOURS.grey,
            color: selectedSubplan ? COLOURS.blue : COLOURS.darkGrey,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading
            ? "Loading subplans…"
            : selectedSubplan
            ? selectedSubplan.subplan_name
            : "Select a subplan…"}
        </button>

        {/* Chevron */}
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200"
          style={{
            color: COLOURS.blue,
            transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {open && !loading && (
          <div style={dropdownStyle(COLOURS.blue)}>
            <div
              className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
              style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
            >
              {subplans.length} subplan{subplans.length !== 1 ? "s" : ""}
            </div>
            <div className="dd-scroll">
              {subplans.map((s) => (
                <div
                  key={s.subplan_id}
                  className="dd-item px-3 py-2.5 text-[14px] font-medium"
                  style={{
                    color: selectedId === s.subplan_id ? COLOURS.white : COLOURS.blue,
                    background: selectedId === s.subplan_id ? COLOURS.blue : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedId !== s.subplan_id)
                      (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`;
                  }}
                  onMouseLeave={(e) => {
                    if (selectedId !== s.subplan_id)
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                  onClick={() => { onSelect(s.subplan_id); setOpen(false); }}
                >
                  {s.subplan_name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{error}</p>
      )}
    </div>
  );
}

// ── CreditBar ─────────────────────────────────────────────────────────────────

function CreditBar({
  effectiveTotal,
  savings,
  doubleCountedCourseCodes,
  exceedsLimit,
  structuresLoaded,
}: {
  effectiveTotal: number;
  rawTotal: number;
  savings: number;
  doubleCountedCourseCodes: string[];
  exceedsLimit: boolean;
  structuresLoaded: boolean;
}) {
  const pct = Math.min((effectiveTotal / CREDIT_LIMIT) * 100, 100);
  const barColor = exceedsLimit
    ? COLOURS.red
    : effectiveTotal >= 100
    ? COLOURS.yellow
    : COLOURS.blue;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-2 rounded-full overflow-hidden" style={{ background: COLOURS.grey }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <div className="flex items-center justify-between text-[14px] flex-wrap gap-1">
        <span style={{ color: COLOURS.darkGrey }}>
          <span className="font-semibold" style={{ color: barColor }}>{effectiveTotal}</span>
          <span className="opacity-60"> / {CREDIT_LIMIT} units</span>
          {savings > 0 && structuresLoaded && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded-md text-[14px] font-semibold"
              style={{ background: `${COLOURS.blue}15`, color: COLOURS.blue }}
            >
              −{savings} double-counted
            </span>
          )}
        </span>
        {exceedsLimit ? (
          <span className="font-semibold text-[14px]" style={{ color: COLOURS.red }}>Exceeds limit</span>
        ) : (
          <span className="opacity-50">{CREDIT_LIMIT - effectiveTotal} remaining</span>
        )}
      </div>

      {doubleCountedCourseCodes.length > 0 && structuresLoaded && (
        <p className="text-[14px]" style={{ color: COLOURS.darkGrey }}>
          <span className="font-semibold">Double-counted: </span>
          {doubleCountedCourseCodes.join(", ")}
        </p>
      )}
    </div>
  );
}

// Combination Picker 
function CombinationPicker({
  selected,
  onSelect,
}: {
  selected: CombinationId;
  onSelect: (id: CombinationId) => void;
}) {
  const selectedConfig = COMBINATIONS.find((c) => c.id === selected)!;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white font-sans text-[14px] font-medium text-left transition-colors focus:outline-none cursor-pointer"
          style={{ borderColor: open ? COLOURS.blue : COLOURS.grey, color: COLOURS.blue }}
        >
          {selectedConfig.label}
        </button>
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200"
          style={{ color: COLOURS.blue, transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {open && (
          <div style={dropdownStyle(COLOURS.blue)}>
            <div
              className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
              style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
            >
              {COMBINATIONS.length} combinations
            </div>
            <div className="dd-scroll">
              {COMBINATIONS.map((c) => (
                <div
                  key={c.id}
                  className="dd-item px-3 py-2.5 text-[14px] font-medium"
                  style={{
                    color: selected === c.id ? COLOURS.white : COLOURS.blue,
                    background: selected === c.id ? COLOURS.blue : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (selected !== c.id)
                      (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`;
                  }}
                  onMouseLeave={(e) => {
                    if (selected !== c.id)
                      (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                  onClick={() => { onSelect(c.id); setOpen(false); }}
                >
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="text-[14px]" style={{ color: COLOURS.darkGrey }}>
        {selectedConfig.description}
      </p>
    </div>
  );
}


// Main Page 
export default function PlannerPage() {
  const navigate = useNavigate();
  const loadProgram = usePlanStore(s => s.loadProgram);
  const resetPrograms = usePlanStore(s => s.resetPrograms);

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);

  const [structureCache, setStructureCache] = useState<StructureCache>({});
  const fetchingIds = useRef<Set<number>>(new Set());

  // Subplan cache: program_id → Subplan[]
  const [subplanCache, setSubplanCache] = useState<SubplanCache>({});
  const fetchingSubplanIds = useRef<Set<number>>(new Set());

  const [combinationId, setCombinationId] = useState<CombinationId>("specialization");
  const combination: CombinationConfig = COMBINATIONS.find((c) => c.id === combinationId)!;

  // Debug logging flag — set to true to see detailed logs during development
  const DEBUG_LOG = false;

  const [selections, setSelections]       = useState<SelectedPrograms>(emptySelections(combination));
  const [inputVals, setInputVals]         = useState<Record<string, string>>({});
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  const [selectedSubplans, setSelectedSubplans] = useState<SelectedSubplans>({});

  const containerRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});
  for (const slot of combination.slots) {
    if (!containerRefs.current[slot.key]) {
      containerRefs.current[slot.key] = { current: null };
    }
  }

  const [errors, setErrors]           = useState<CombinationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const isSubmitting                  = useRef(false);

  // ── Fetch all programs on mount ───────────────────────────────────────────
  useEffect(() => {
    getPrograms()
      .then(setAllPrograms)
      .catch(() => setProgramsError("Failed to load programs. Is the backend running?"))
      .finally(() => setProgramsLoading(false));
  }, []);

  // ── Reset slots when combination changes ──────────────────────────────────
  useEffect(() => {
    setSelections(emptySelections(combination));
    setInputVals({});
    setOpenDropdowns({});
    setErrors({});
    setSelectedSubplans({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinationId]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      for (const slot of combination.slots) {
        const ref = containerRefs.current[slot.key];
        if (ref?.current && !ref.current.contains(e.target as Node)) {
          setOpenDropdowns((prev) => ({ ...prev, [slot.key]: false }));
          setInputVals((prev) => ({
            ...prev,
            [slot.key]: selections[slot.key]
              ? formatProgramName(selections[slot.key]!.program_name)
              : "",
          }));
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [combination.slots, selections]);

  // ── Lazy subplan fetch ────────────────────────────────────────────────────
  const fetchSubplans = useCallback(
    async (program: Program) => {
      const id = program.program_id;
      if (subplanCache[id] !== undefined || fetchingSubplanIds.current.has(id)) return;

      fetchingSubplanIds.current.add(id);
      try {
        const subplans: Subplan[] = await getSubplans(id);
        setSubplanCache((prev) => ({ ...prev, [id]: subplans }));
      } catch {
        // Store empty array so we don't retry on every render
        setSubplanCache((prev) => ({ ...prev, [id]: [] }));
      } finally {
        fetchingSubplanIds.current.delete(id);
      }
    },
    [subplanCache]
  );  const fetchStructure = useCallback(
    async (program: Program) => {
      const id = program.program_id;
      if (structureCache[id] !== undefined || fetchingIds.current.has(id)) return;

      fetchingIds.current.add(id);
      try {
        const structure = await getProgramStructure(id);
        setStructureCache((prev) => ({ ...prev, [id]: structure }));
      } catch {
        // Silently ignore
      } finally {
        fetchingIds.current.delete(id);
      }
    },
    [structureCache]
  );

  // Slot helpers 
  const setSlotSelection = (slotKey: string, program: Program) => {
    if (DEBUG_LOG) {
      console.group(`setSlotSelection: slot=${slotKey}`);
      console.log("program:", program.program_name, `(id=${program.program_id})`);
      console.log("has_subplans:", program.has_subplans);
      console.groupEnd();
    }

    setSelections((prev) => ({ ...prev, [slotKey]: program }));
    setInputVals((prev) => ({ ...prev, [slotKey]: formatProgramName(program.program_name) }));
    setOpenDropdowns((prev) => ({ ...prev, [slotKey]: false }));
    setErrors((prev) => { const e = { ...prev }; delete e[slotKey]; return e; });
    // Clear any previously selected subplan for this slot
    setSelectedSubplans((prev) => ({ ...prev, [slotKey]: null }));
    fetchStructure(program);
    // Kick off subplan fetch immediately if needed — ready before user reads the picker
    if (program.has_subplans) fetchSubplans(program);
  };

  const clearSlotSelection = (slotKey: string) => {
    setSelections((prev) => ({ ...prev, [slotKey]: null }));
    setSelectedSubplans((prev) => ({ ...prev, [slotKey]: null }));
  };

  // Derived values
  const safeSelections: SelectedPrograms = Object.fromEntries(
    combination.slots.map((s) => [s.key, selections[s.key] ?? null])
  );

  const filteredStructureCache: StructureCache = useMemo(() => {
    return Object.fromEntries(
      Object.entries(structureCache).map(([key, structure]) => {
        const programId = parseInt(key);
        const slot = combination.slots.find(
          (s) => safeSelections[s.key]?.program_id === programId
        );
        const chosenSubplanId = slot ? (selectedSubplans[slot.key] ?? null) : null;

        // No subplan chosen (or program has none) — keep all top-level sections only
        // Subplan chosen — keep top-level + that subplan's sections
        const allSections   = structure.sections;
        const filteredSections = allSections.filter(
          (s) => s.subplan_id === null || s.subplan_id === chosenSubplanId
        );

        if (DEBUG_LOG) {
          console.group(`filteredStructureCache: program_id=${programId} (${structure.program_name})`);
          console.log("chosenSubplanId:", chosenSubplanId ?? "none");
          console.log("total sections in cache:", allSections.length);
          console.table(allSections.map(s => ({
            section_id:  s.section_id,
            subplan_id:  s.subplan_id ?? "null",
            logic_type:  s.logic_type,
            credit_req:  s.credit_req,
            kept:        filteredSections.includes(s),
            courses:     s.section_courses.map(c => c.course_code).join(", "),
          })));
          console.log(
            `kept ${filteredSections.length}/${allSections.length} sections,`,
            `credit_req sum = ${filteredSections.reduce((s, sec) => s + (sec.credit_req ?? 0), 0)}`
          );
          console.groupEnd();
        }

        return [key, { ...structure, sections: filteredSections }];
      })
    );
  }, [structureCache, safeSelections, selectedSubplans, DEBUG_LOG, combination.slots]);

  const creditSummary   = useMemo(() => 
    calculateCredits(safeSelections, filteredStructureCache, selectedSubplans, subplanCache),
    [safeSelections, filteredStructureCache, selectedSubplans, subplanCache]
  );
  const structuresReady = allStructuresLoaded(combination, safeSelections, filteredStructureCache);
  const anySelected     = Object.values(safeSelections).some((p) => p !== null);

  const slotFetching = (slotKey: string): boolean => {
    const prog = safeSelections[slotKey];
    return (
      prog != null &&
      structureCache[prog.program_id] === undefined &&
      fetchingIds.current.has(prog.program_id)
    );
  };

  /** Returns the fetched subplan list for the program in a given slot. */
  const sublansForSlot = (slotKey: string): Subplan[] => {
    const prog = safeSelections[slotKey];
    if (!prog) return [];
    return subplanCache[prog.program_id] ?? [];
  };

  /**
   * Whether the form is complete enough to show the generate button.
   * All slots must be filled, and any program with subplans must have one selected.
   */
  const isFormComplete = (): boolean => {
    // All slots filled
    const allFilled = combination.slots.every((s) => safeSelections[s.key] !== null);
    if (!allFilled) return false;

    // Every has_subplans program must have a subplan chosen
    for (const slot of combination.slots) {
      const prog = safeSelections[slot.key];
      if (!prog?.has_subplans) continue;

      // Still fetching subplans — not complete yet
      const subplans = subplanCache[prog.program_id];
      if (subplans === undefined) return false;

      // Subplans exist but none chosen
      if (subplans.length > 0 && !selectedSubplans[slot.key]) return false;
    }

    return true;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const errs = validateCombination(combination, selections, structureCache, selectedSubplans, subplanCache);
    if (Object.keys(errs).length) {
      setErrors(errs);
      isSubmitting.current = false;
      return;
    }

    setErrors({});
    setServerError(null);
    setLoading(true);

    try {
      // Wipe any previously loaded programs before loading the new selection
      resetPrograms();

      const loads = combination.slots
        .map((slot) => {
          const prog = safeSelections[slot.key];
          if (!prog) return null;
          const subplanId = prog.has_subplans
            ? (selectedSubplans[slot.key] ?? null)
            : null;
          return { programId: prog.program_id, subplanId };
        })
        .filter((x): x is { programId: number; subplanId: number | null } => x !== null);

      await Promise.all(loads.map(({ programId, subplanId }) => loadProgram(programId, subplanId)));

      // Pass selectedSubplans through navigate state so the visualizer can use them
      navigate("/visualizer", { state: { selectedSubplans } });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };

  const formComplete = isFormComplete();

  // Render 
  return (
    <div className="font-sans flex flex-col min-h-screen" style={{ background: COLOURS.warmWhite }}>
      <ScrollToTop />

      <style>{`
        body { font-family: 'DM Sans', sans-serif; }
        .font-playfair { font-family: 'Playfair Display', serif; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in  { animation: fadeUp 0.4s ease both; }
        .animate-fade-in2 { animation: fadeUp 0.4s 0.08s ease both; }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down { animation: slideDown 0.25s ease both; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-cta { animation: fadeIn 0.3s ease both; }
        .dd-item { transition: background 0.1s ease; cursor: pointer; }
        .dd-scroll {
          overflow-y: auto; flex: 1;
          scrollbar-width: thin;
          scrollbar-color: ${COLOURS.grey} transparent;
        }
        .dd-scroll::-webkit-scrollbar { width: 4px; }
        .dd-scroll::-webkit-scrollbar-thumb { background: ${COLOURS.grey}; border-radius: 99px; }
        .slots-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${COLOURS.grey} transparent;
        }
        .slots-scroll::-webkit-scrollbar { width: 4px; }
        .slots-scroll::-webkit-scrollbar-thumb { background: ${COLOURS.grey}; border-radius: 99px; }
      `}</style>

      <NavBar
        onHome={() => navigate("/")}
        onPlan={() => navigate("/planner")}
        onAbout={() => navigate("/about")}
        activePage="Plan"
      />

      {/* ── Page header ── */}
      <div className="px-10 py-[30px] text-center" style={{ background: COLOURS.warmWhite }}>
        <div className="animate-fade-in max-w-[680px] mx-auto">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium mb-5 bg-transparent border-none cursor-pointer"
            style={{ color: `${COLOURS.black}90` }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = COLOURS.blue; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = `${COLOURS.black}90`; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            Back to Home
          </button>

          <h1
            className="font-playfair font-black leading-tight mb-3"
            style={{ fontSize: "clamp(26px, 4vw, 46px)", color: COLOURS.blue }}
          >
            Build Your Academic Plan
          </h1>
          <p className="text-[16px] font-light" style={{ color: COLOURS.black }}>
            Choose your degree combination and programs to generate your
            personalised year-by-year course roadmap.
          </p>
        </div>
      </div>

      {/* ── Main form ── */}
      <section className="px-6 pb-16 flex flex-col items-center">
        <div className="w-full max-w-[580px] flex flex-col gap-5">

          {/* Step 1 — Combination */}
          <div
            className="animate-fade-in flex flex-col gap-4 p-6 rounded-2xl"
            style={{ background: COLOURS.white, border: `1px solid ${COLOURS.grey}`, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
          >
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-wider mb-1" style={{ color: COLOURS.darkGrey }}>
                Step 1
              </p>
              <h2 className="text-[18px] font-bold" style={{ color: COLOURS.blue }}>Degree Combination</h2>
            </div>
            <CombinationPicker selected={combinationId} onSelect={setCombinationId} />
          </div>

          {/* Step 2 — Program dropdowns + subplan pickers */}
          <div
            className="animate-fade-in2 flex flex-col gap-5 p-6 rounded-2xl"
            style={{ background: COLOURS.white, border: `1px solid ${COLOURS.grey}`, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}
          >
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-wider mb-1" style={{ color: COLOURS.darkGrey }}>
                Step 2
              </p>
              <h2 className="text-[18px] font-bold" style={{ color: COLOURS.blue }}>Select Your Programs</h2>
            </div>

            {programsError ? (
              <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{programsError}</p>
            ) : (
              <div
                className="slots-scroll flex flex-col gap-5"
                style={{
                  maxHeight: "480px",
                  overflowY: "auto",
                  paddingRight: "4px",
                }}
              >
                {combination.slots.map((slot) => {
                  const prog = safeSelections[slot.key];
                  const subplans = sublansForSlot(slot.key);
                  const subplansLoading = prog?.has_subplans === true && subplanCache[prog.program_id] === undefined;

                  return (
                    <div key={slot.key} className="flex flex-col gap-3">
                      <ProgramDropdown
                        label={slot.label}
                        programs={programsForSlot(allPrograms, slot, safeSelections, slot.key)}
                        selected={safeSelections[slot.key]}
                        inputVal={inputVals[slot.key] ?? ""}
                        setInputVal={(v) => setInputVals((prev) => ({ ...prev, [slot.key]: v }))}
                        open={openDropdowns[slot.key] ?? false}
                        setOpen={(v) => setOpenDropdowns((prev) => ({ ...prev, [slot.key]: v }))}
                        containerRef={containerRefs.current[slot.key] as React.RefObject<HTMLDivElement | null>}
                        onSelect={(p) => setSlotSelection(slot.key, p)}
                        onClear={() => clearSlotSelection(slot.key)}
                        error={errors[slot.key]}
                        loading={programsLoading}
                        fetchingStructure={slotFetching(slot.key)}
                      />

                      {/* Subplan picker — shown when program has_subplans is true */}
                      {prog?.has_subplans && (
                        <div className="pl-4 border-l-2" style={{ borderColor: COLOURS.grey }}>
                          <SubplanPicker
                            subplans={subplans}
                            selectedId={selectedSubplans[slot.key] ?? null}
                            onSelect={(id) =>
                              setSelectedSubplans((prev) => ({ ...prev, [slot.key]: id }))
                            }
                            loading={subplansLoading}
                            error={errors[`${slot.key}_subplan`]}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Credit bar */}
            {anySelected && (
              <div
                className="animate-slide-down pt-4 mt-1 border-t flex flex-col gap-1"
                style={{ borderColor: COLOURS.grey }}
              >
                <p className="text-[14px] font-semibold uppercase tracking-wider mb-1" style={{ color: COLOURS.darkGrey }}>
                  Credit Estimate
                </p>
                <CreditBar
                  effectiveTotal={creditSummary.effectiveTotal}
                  rawTotal={creditSummary.rawTotal}
                  savings={creditSummary.doubleCountSavings}
                  doubleCountedCourseCodes={creditSummary.doubleCountedCourseCodes}
                  exceedsLimit={creditSummary.exceedsLimit}
                  structuresLoaded={structuresReady}
                />
                {errors.credits && (
                  <p className="text-[14px] font-semibold mt-1" style={{ color: COLOURS.red }}>
                    {errors.credits}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* CTA — only rendered when form is complete */}
          {formComplete && (
            <div className="animate-cta flex flex-col items-center gap-3 pt-2">
              {serverError && (
                <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{serverError}</p>
              )}
              <NextPageButton
                onClick={handleGenerate}
                label="Generate My Plan"
                loading={loading}
                disabled={loading}
              />
            </div>
          )}

        </div>
      </section>

      <Footer />
    </div>
  );
}