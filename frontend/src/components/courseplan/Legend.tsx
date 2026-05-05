// src/components/course-plan/Legend.tsx
import { COLOURS } from "../../utils/colours";

export const Legend = () => {
  return (
    <div className="px-4 py-3">
      <h3
        className="text-[18px] font-bold leading-tight mb-3"
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
      <span className="rounded-full w-4 h-4 flex-shrink-0" style={{ backgroundColor: colour }}>

      </span>

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
            className="text-[15px] font-semibold leading-none truncate"
            style={{ color: COLOURS.black }}
          >
            {" - " + description}
          </span>
        )}
      </div>
    </div>
  );
}