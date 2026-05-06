import { COLOURS } from "../utils/colours";

type NavbarProps = {
    onAbout?: () => void;
    onHome?: () => void;
    onPlan?: () => void;
    activePage?: "Home" | "Plan" | "About" | "None";
  };
  
  export default function Navbar({ onAbout, onHome, onPlan, activePage }: NavbarProps) {
    const handlers = {
      Home: onHome,
      Plan: onPlan,
      About: onAbout,
    };
  
    return (
        <>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,700;1,300&family=Playfair+Display:wght@700;900&display=swap');
          `}</style>
          <nav
            className="px-10 h-[70px] flex items-center justify-between sticky top-0 z-[100] shadow-[0_2px_12px_rgba(0,0,0,0.18)]"
            style={{ background: COLOURS.blue }}
          >
            <div className="flex items-center gap-2.5">
              <span className="font-playfair font-bold text-xl tracking-[0.01em]" style={{ color: COLOURS.white }}>
                Queen's Degree Planner
              </span>
            </div>
            <div className="flex gap-6">
              {(["Home", "Plan", "About"] as const).map((l) => (
                <button
                  key={l}
                  className="text-[16px] font-medium cursor-pointer transition-colors bg-transparent border-none p-0"
                  style={{ color: activePage === l ? COLOURS.white : `${COLOURS.white}b3` }}
                  onClick={handlers[l]}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = COLOURS.white;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color =
                      activePage === l ? COLOURS.white : `${COLOURS.white}b3`;
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          </nav>
        </>
      );
  }