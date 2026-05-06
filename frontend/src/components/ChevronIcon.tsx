import { COLOURS } from "../utils/colours";

interface ChevronIconProps {
  open: boolean;
}

export default function ChevronIcon({ open }: ChevronIconProps) {
  return (
    <div
      className="pointer-events-none absolute right-3 flex items-center justify-center transition-transform duration-200"
      style={{
        color: COLOURS.blue,
        top: "11px",
        transform: open ? "rotate(180deg)" : "none",
        width: "20px",
        height: "20px",
        zIndex: 10,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}
