// src/components/course-plan/Legend.tsx
import { COLOURS } from "../utils/colours";

export const Legend = () => {
  return (
    <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg ring-1 ring-black/5 px-4 py-3 w-56">
      
      {/* Header */}
      <h3
        className="text-[15px] font-semibold tracking-wider uppercase mb-3"
        style={{ color: COLOURS.darkGrey }}
      >
        Legend
      </h3>

      {/* Items */}
      <div className="space-y-2">
        <LegendItem colour={COLOURS.red} label="Required" />
        <LegendItem colour={COLOURS.yellow} label="Choice" />
        <LegendItem colour={COLOURS.brightBlue} label="Completed" />
      </div>
    </div>
  );
};


function LegendItem({
  colour,
  label,
}: {
  colour: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-5 h-5 rounded-full border"
        style={{
          backgroundColor: colour,
          borderColor: colour,
        }}
      />
      <span className="text-[14px] text-gray-700">{label}</span>
    </div>
  );
}