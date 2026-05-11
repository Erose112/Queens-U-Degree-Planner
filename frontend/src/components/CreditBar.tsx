import { COLOURS } from "../utils/colours";
import { getCreditLimitForPrograms } from "../utils/credits";
import type { ProgramStructure } from "../types/plan";

interface CreditBarProps {
  effectiveTotal: number;
  savings: number;
  doubleCountedCourseCodes: string[];
  exceedsLimit: boolean;
  structuresLoaded: boolean;
  programs: ProgramStructure[];
}

export default function CreditBar({
  effectiveTotal,
  savings,
  doubleCountedCourseCodes,
  exceedsLimit,
  structuresLoaded,
  programs,
}: CreditBarProps) {
  const creditLimit = getCreditLimitForPrograms(programs);
  const pct = Math.min((effectiveTotal / creditLimit) * 100, 100);
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
          <span className="opacity-60"> / {creditLimit} units</span>
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
          <span className="opacity-50">{creditLimit - effectiveTotal} remaining</span>
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
