// src/components/course-plan/Legend.tsx
import { COLOURS } from "../../utils/colours";

export const Legend = () => {
  return (
    <div className="px-4 py-3">
      <h3
        className="text-[18px] font-semibold tracking-wider uppercase leading-tight mb-3"
        style={{ color: COLOURS.blue }}
      >
        Legend
      </h3>
      <div className="flex flex-col gap-1.5">
        <LegendItem colour={COLOURS.red} label="Required" description="Must be completed" />
        <LegendItem colour={COLOURS.yellow} label="Choice" description="Pick from a set" />
        <LegendItem colour={COLOURS.green} label="Elective" description="Flexible course" />
      </div>
    </div>
  );
};

function LegendItem({
  colour,
  label,
  description,
}: {
  colour: string;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 group">
      {/* Colour swatch: left accent bar + filled chip */}
      <div className="relative flex items-center justify-center w-7 h-6 rounded-md flex-shrink-0"
        style={{ backgroundColor: `${colour}30` }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md"
          style={{ backgroundColor: colour }}
        />
      </div>

      {/* Text */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="text-[15px] font-semibold leading-none flex-shrink-0"
          style={{ color: colour }}
        >
          {label}
        </span>
        {description && (
          <span
            className="text-[15px] text-gray-800 leading-none truncate"
          >
            {" — " + description}
          </span>
        )}
      </div>
    </div>
  );
}