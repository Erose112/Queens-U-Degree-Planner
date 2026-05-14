import { useState, useRef } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { COLOURS } from "../utils/colours";
import ChevronIcon from "./ChevronIcon";
import { Subplan } from "../types/plan";

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

interface MultiSubplanPickerProps {
  numRequired: number;
  allSubplans: Subplan[];
  selectedIds: number[];
  onSelect: (index: number, id: number) => void;
  loading: boolean;
  error?: string;
}

/**
 * Renders N subplan picker dropdowns based on numRequired.
 * When a subplan is selected in one picker, it's filtered from the others (mutual exclusivity).
 */
export function MultiSubplanPicker({
  numRequired,
  allSubplans,
  selectedIds,
  onSelect,
  loading,
  error,
}: MultiSubplanPickerProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Close dropdowns when clicking outside
  useOutsideClick(
    { current: Object.values(containerRefs.current).find(x => x) || null },
    () => setOpenIndex(null)
  );

  // Build available subplans for each picker position
  // Position i can show: all unselected subplans + its currently selected one (if any)
  const availableByIndex = Array.from({ length: numRequired }, (_, i) => {
    const currentlySelectedId = selectedIds[i] ?? null;
    return allSubplans.filter(
      (s) =>
        s.subplan_id === currentlySelectedId || // Always show currently selected
        !selectedIds.includes(s.subplan_id) // Show unselected ones
    );
  });

  return (
    <div className="flex flex-col gap-3 animate-slide-down">
      {Array.from({ length: numRequired }, (_, index) => {
        const selectedId = selectedIds[index] ?? null;
        const selectedSubplan = allSubplans.find((s) => s.subplan_id === selectedId) ?? null;
        const available = availableByIndex[index];
        const isOpen = openIndex === index;

        return (
          <div
            key={index}
            className="flex items-start gap-2"
            ref={(el) => { containerRefs.current[index] = el; }}
          >
            {/* Index badge */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold mt-[11px]"
              style={{ background: `${COLOURS.blue}15`, color: COLOURS.blue }}
            >
              {index + 1}
            </div>

            {/* Picker dropdown */}
            <div className="flex-1 relative">
              <button
                onClick={() => !loading && setOpenIndex(isOpen ? null : index)}
                disabled={loading}
                className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white text-[14px] font-medium text-left transition-colors focus:outline-none"
                style={{
                  borderColor: error ? COLOURS.red : isOpen ? COLOURS.blue : COLOURS.grey,
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
              <ChevronIcon open={isOpen} />

              {/* Dropdown menu */}
              {isOpen && !loading && (
                <div style={dropdownStyle(COLOURS.blue)}>
                  <div
                    className="px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
                    style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
                  >
                    {available.length} subplan{available.length !== 1 ? "s" : ""}
                  </div>
                  <div className="dd-scroll">
                    {available.length === 0 ? (
                      <div className="px-3 py-2.5 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                        No available subplans
                      </div>
                    ) : (
                      available.map((s) => (
                        <div
                          key={s.subplan_id}
                          className="px-3 py-2.5 text-[14px] font-medium transition-colors duration-100 cursor-pointer"
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
                          onClick={() => {
                            onSelect(index, s.subplan_id);
                            setOpenIndex(null);
                          }}
                        >
                          {s.subplan_name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {error && (
        <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{error}</p>
      )}
    </div>
  );
}
