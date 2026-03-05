// src/components/course-plan/Legend.tsx
import { COLOURS } from "../../utils/colours";

export const Legend = () => {
  return (
    <div className="px-4 py-3">
      <h3
        className="text-[18px] font-semibold tracking-wider uppercase mb-2"
        style={{ color: COLOURS.darkGrey }}
      >
        Legend
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <LegendItem colour={COLOURS.brightBlue} label="Completed" />
        <LegendItem colour={COLOURS.red} label="Required" />
        <LegendItem colour={COLOURS.yellow} label="Choice" />
        <LegendItem colour={COLOURS.green} label="Elective" />
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
      <span className="text-[15px] text-gray-700">{label}</span>
    </div>
  );
}