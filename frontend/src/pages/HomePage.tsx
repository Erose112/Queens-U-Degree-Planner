import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import NextPageButton from "../components/NextPageButton";
import { COLOURS } from "../utils/colours";

export default function HomePage() {
  const navigate = useNavigate();

  const handleStartPlanning = () => navigate("/planner");

  return (
    <div className="font-sans min-h-screen flex flex-col" style={{ background: COLOURS.warmWhite }}>
      <style>{`
        body { font-family: 'DM Sans', sans-serif; }
        .font-playfair { font-family: 'Playfair Display', serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up-1 { animation: fadeUp 0.6s ease both; }
        .animate-fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
        .animate-fade-up-3 { animation: fadeUp 0.6s 0.3s  ease both; }
        .animate-fade-up-4 { animation: fadeUp 0.6s 0.45s ease both; }
        .animate-fade-up-5 { animation: fadeUp 0.6s 0.6s  ease both; }
      `}</style>

      <NavBar
        onHome={() => navigate("/")}
        onPlan={() => navigate("/planner")}
        onAbout={() => navigate("/about")}
        activePage="Home"
      />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-center px-10 pt-[80px] pb-[40px]"
        style={{
          minHeight: "calc(100vh - 70px)",
          background: `${COLOURS.warmWhite}`,
        }}
      >
        {/* Subtle background decoration */}
        <div
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% -10%, ${COLOURS.blue}0f 0%, transparent 70%)`,
          }}
        />

        <p
          className="animate-fade-up-1 text-[16px] font-bold tracking-[0.12em] uppercase mb-3 relative"
          style={{ color: COLOURS.red }}
        >
          Queen's University · Degree Planner
        </p>

        <h1
          className="animate-fade-up-2 font-playfair font-black leading-[1.1] mt-3 mb-5 relative"
          style={{ fontSize: "clamp(38px, 6vw, 76px)", color: COLOURS.blue }}
        >
          Plan Your Degree.<br />
          <span style={{ color: COLOURS.yellow }} className="italic">Your Way.</span>
        </h1>

        <p
          className="animate-fade-up-3 max-w-[560px] mx-auto mb-12 text-lg leading-[1.7] font-light relative"
          style={{ color: COLOURS.darkGrey }}
        >
          Select your program, add the courses you've already completed, and get a
          personalised year-by-year academic plan; built around your interests.
        </p>

        {/* ── How it works steps ── */}
        <div className="animate-fade-up-4 flex justify-center gap-0 flex-wrap mb-14 relative">
          {[
            { n: "1", label: "Choose Your Program" },
            { n: "2", label: "Add Completed Courses" },
            { n: "3", label: "Generate Your Plan" },
          ].map((step, i) => (
            <div key={i} className="flex items-center">
              <div className="text-center px-5">
                <div
                  className="w-[42px] h-[42px] rounded-full flex items-center justify-center font-bold text-base mx-auto mb-2"
                  style={{
                    background: COLOURS.blue,
                    color: COLOURS.white,
                    boxShadow: `0 4px 12px ${COLOURS.blue}33`,
                  }}
                >
                  {step.n}
                </div>
                <span
                  className="text-[15px] font-medium block max-w-[100px]"
                  style={{ color: `${COLOURS.black}90` }}
                >
                  {step.label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className="w-16 h-[2px] flex-shrink-0"
                  style={{ background: `${COLOURS.darkGrey}55` }}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── CTA Button ── */}
        <div className="animate-fade-up-5 relative flex flex-col pb-12 items-center">
          <NextPageButton
            onClick={handleStartPlanning}
            label="Start Planning"
          />
        </div>
      </section>

      

      {/* ── Feature highlights ── */}
      <section className="py-24 px-10 max-w-[900px] mx-auto w-full gap-6">
        <h2
          className="font-playfair text-[32px] font-bold text-center mb-12"
          style={{ color: COLOURS.blue }}
        >
          Everything you need to succeed
        </h2>

        <div
          className="grid grid-cols-1 gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              ),
              title: "Track Completed Courses",
              desc: "Mark courses you've already taken and let the planner build on top of your progress.",
              color: COLOURS.blue,
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              ),
              title: "Highlight Favourites",
              desc: "Tell us what subjects you love; we'll prioritise similar courses in your future plan.",
              color: COLOURS.yellow,
            },
          ].map((card, i) => (
            <div
              key={i}
              className="p-7 rounded-2xl"
              style={{
                background: COLOURS.white,
                boxShadow: `0 2px 16px rgba(0,0,0,0.06)`,
                border: `1px solid ${COLOURS.grey}`,
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${card.color}18`, color: card.color }}
              >
                {card.icon}
              </div>
              <h3 className="font-semibold text-[17px] mb-2" style={{ color: COLOURS.blue }}>
                {card.title}
              </h3>
              <p className="text-[15px] leading-[1.65]" style={{ color: COLOURS.darkGrey }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Guide Section */}
        <div
          className="flex gap-8 p-7 rounded-2xl mt-6"
          style={{
            background: COLOURS.white,
            boxShadow: `0 2px 16px rgba(0,0,0,0.06)`,
            border: `1px solid ${COLOURS.grey}`,
            width: "100%",
            minHeight: "140px",
          }}
        >
          {/* Icon */}
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${COLOURS.black}18`, color: COLOURS.black }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-[17px]" style={{ color: COLOURS.blue }}>
              Instructions
            </h3>

            <ol className="flex flex-col gap-3" style={{ color: COLOURS.darkGrey }}>
              {[
                "Select your program and courses from the list.",
                "Pick your favourite subjects and interested courses to personalise your plan.",
                'Click "Generate Plan" to see your personalised degree roadmap.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-[15px] leading-[1.65]">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-bold mt-[2px]"
                    style={{ background: `${COLOURS.blue}`, color: COLOURS.white }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            <p
              className="text-[15px] leading-[1.6] px-3 py-2 rounded-lg"
              style={{
                color: COLOURS.darkGrey,
                background: `${COLOURS.yellow}18`,
                borderLeft: `3px solid ${COLOURS.yellow}`,
              }}
            >
              ⚠️ The generated plan is a suggestion and may not perfectly align with all degree requirements. Always double-check with an academic advisor to ensure your plan meets graduation criteria.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}