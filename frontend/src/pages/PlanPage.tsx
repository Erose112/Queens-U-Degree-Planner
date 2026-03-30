import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import NextPageButton from "../components/NextPageButton";
import { COLOURS } from "../utils/colours";
import { formatProgramName } from "../utils/formatNames";
import { getPrograms, getProgramStructure } from "../services/api";
import { Program, SelectedPrograms, StructureCache } from "../types/plan";
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

// Dropdown component 
const dropdownStyle = (accentColor: string): React.CSSProperties => ({
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "white",
  border: `2px solid ${accentColor}`,
  borderRadius: "14px",
  boxShadow: `0 8px 32px ${accentColor}28`,
  zIndex: 50,
  overflow: "hidden",
  maxHeight: "220px",
  display: "flex",
  flexDirection: "column",
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

          {/* Only show savings badge once both structures are loaded */}
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

// Combination pill picker 
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

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="relative">
        {/* Trigger button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white font-sans text-[14px] font-medium text-left transition-colors focus:outline-none cursor-pointer"
          style={{
            borderColor: open ? COLOURS.blue : COLOURS.grey,
            color: COLOURS.blue,
          }}
        >
          {selectedConfig.label}
        </button>

        {/* Chevron */}
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-transform duration-200"
          style={{ color: COLOURS.blue, transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        {/* Dropdown panel */}
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

// Main page 

export default function PlannerPage() {
  const navigate = useNavigate();
  const loadProgram = usePlanStore(s => s.loadProgram);

  // All programs list (for dropdowns)
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);

  // Lazily-loaded ProgramStructure cache, keyed by program_id
  const [structureCache, setStructureCache] = useState<StructureCache>({});
  // Which program IDs are currently being fetched (prevents duplicate requests)
  const fetchingIds = useRef<Set<number>>(new Set());

  // Active combination
  const [combinationId, setCombinationId] = useState<CombinationId>("specialization");
  const combination: CombinationConfig = COMBINATIONS.find((c) => c.id === combinationId)!;

  // Per-slot: selected program + search text + dropdown open
  const [selections, setSelections]       = useState<SelectedPrograms>(emptySelections(combination));
  const [inputVals, setInputVals]         = useState<Record<string, string>>({});
  const [openDropdowns, setOpenDropdowns] = useState<Record<string, boolean>>({});

  // Per-slot refs for outside-click handling
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

  // ── Fetch all programs on mount 
  useEffect(() => {
    getPrograms()
      .then(setAllPrograms)
      .catch(() => setProgramsError("Failed to load programs. Is the backend running?"))
      .finally(() => setProgramsLoading(false));
  }, []);

  // ── Reset slots when combination changes 
  useEffect(() => {
    setSelections(emptySelections(combination));
    setInputVals({});
    setOpenDropdowns({});
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinationId]);

  // ── Close dropdowns on outside click 
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      for (const slot of combination.slots) {
        const ref = containerRefs.current[slot.key];
        if (ref?.current && !ref.current.contains(e.target as Node)) {
          setOpenDropdowns((prev) => ({ ...prev, [slot.key]: false }));
          // Restore input text to selected name (or clear if nothing selected)
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

  // ── Lazy structure fetch ──
  const fetchStructure = useCallback(
    async (program: Program) => {
      const id = program.program_id;
      if (structureCache[id] !== undefined || fetchingIds.current.has(id)) return;

      fetchingIds.current.add(id);
      try {
        const structure = await getProgramStructure(id);
        setStructureCache((prev) => ({ ...prev, [id]: structure }));
      } catch {
        // Silently ignore — credit bar will show "(loading credit details…)"
      } finally {
        fetchingIds.current.delete(id);
      }
    },
    [structureCache]
  );

  // ── Slot helpers ──
  const setSlotSelection = (slotKey: string, program: Program) => {
    setSelections((prev) => ({ ...prev, [slotKey]: program }));
    setInputVals((prev) => ({ ...prev, [slotKey]: formatProgramName(program.program_name) }));
    setOpenDropdowns((prev) => ({ ...prev, [slotKey]: false }));
    setErrors((prev) => { const e = { ...prev }; delete e[slotKey]; return e; });
    fetchStructure(program); // kick off lazy load
  };

  const clearSlotSelection = (slotKey: string) => {
    setSelections((prev) => ({ ...prev, [slotKey]: null }));
  };

  // ── Derived values ──
  // Guard every derived value against the one-render gap that exists between
  // combinationId changing (synchronous) and the useEffect that resets
  // selections running (after render). During that gap, new slot keys are
  // not yet present in `selections`, so selections[slotKey] === undefined.
  const safeSelections: SelectedPrograms = Object.fromEntries(
    combination.slots.map((s) => [s.key, selections[s.key] ?? null])
  );

  const creditSummary   = calculateCredits(safeSelections, structureCache);
  const structuresReady = allStructuresLoaded(combination, safeSelections, structureCache);
  const anySelected     = Object.values(safeSelections).some((p) => p !== null);

  // Which slots are currently fetching their structure?
  const slotFetching = (slotKey: string): boolean => {
    const prog = safeSelections[slotKey];
    return (
      prog != null &&
      structureCache[prog.program_id] === undefined &&
      fetchingIds.current.has(prog.program_id)
    );
  };

  // ── Submit ──
  const handleGenerate = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;

    const errs = validateCombination(combination, selections, structureCache);
    if (Object.keys(errs).length) {
      setErrors(errs);
      isSubmitting.current = false;
      return;
    }

    setErrors({});
    setServerError(null);
    setLoading(true);

    try {
      // Load all selected programs into the store before navigating
      const programIds = Object.values(selections)
        .map(s => s?.program_id)
        .filter((id): id is number => id != null);
      await Promise.all(programIds.map(id => loadProgram(id)));

      navigate("/visualizer");
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
      isSubmitting.current = false;
    }
  };


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
        .dd-item { transition: background 0.1s ease; cursor: pointer; }
        .dd-scroll {
          overflow-y: auto; flex: 1;
          scrollbar-width: thin;
          scrollbar-color: ${COLOURS.grey} transparent;
        }
        .dd-scroll::-webkit-scrollbar { width: 4px; }
        .dd-scroll::-webkit-scrollbar-thumb { background: ${COLOURS.grey}; border-radius: 99px; }
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

          {/* Step 2 — Program dropdowns */}
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
              combination.slots.map((slot) => (
                <ProgramDropdown
                  key={slot.key}
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
              ))
            )}

            {/* Credit bar — shown as soon as any program is selected */}
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

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 pt-2">
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
        </div>
      </section>

      <Footer />
    </div>
  );
}