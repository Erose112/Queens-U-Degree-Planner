import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import NextPageButton from "../components/NextPageButton";
import { COLOURS } from "../utils/colours";

export default function HomePage() {
  const navigate = useNavigate();

  const handleStartPlanning = () => navigate("/planner");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLOURS.warmWhite }}>
      <style>{`
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
          <span style={{ color: COLOURS.yellow }}>Your Way.</span>
        </h1>

        <p
          className="animate-fade-up-3 max-w-[560px] mx-auto mb-12 text-lg leading-[1.7] font-light relative"
          style={{ color: COLOURS.darkGrey }}
        >
          Select your program, add the courses you've already completed, and get a personalized 
          year-by-year academic plan built around your interests.

        </p>

        {/* ── How it works steps ── */}
        <div className="animate-fade-up-4 flex justify-center gap-0 flex-wrap mb-14 relative">
          {[
            { n: "1", label: "Choose Your Program/s" },
            { n: "2", label: "Fill Out Your Plan Requirements" },
            { n: "3", label: "Save as a PDF!" },
          ].map((step, i) => (
            <div key={i} className="flex items-start">
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
                  className="text-[17px] font-medium block max-w-[100px]"
                  style={{ color: `${COLOURS.black}90` }}
                >
                  {step.label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className="w-16 h-[2px] flex-shrink-0 mt-[21px]"
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
          className="font-playfair text-[40px] font-bold text-center mb-12"
          style={{ color: COLOURS.blue }}
        >
          How it Works
        </h2>

        <div
          className="grid grid-cols-1 gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {[
            {
              title: "Select your Plan",
              desc: "Choose the degree type from the available degree combo options. Then select the specific program you're enrolled in. The planner will use this to determine your degree requirements and course options.",
              color: COLOURS.blue,
            },
            {
              title: "Fill out your Plan Requirements",
              desc: "Select courses from the choice sections in your plan. Add elective type courses using the \"Add Any Course\" feature. The planner will verify program/course requirements are met when adding courses.",
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
              <h3 className="font-semibold text-[18px] mb-2" style={{ color: COLOURS.blue }}>
                {card.title}
              </h3>
              <p className="text-[16px] leading-[1.65]" style={{ color: COLOURS.darkGrey }}>
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Guide Section */}
        <div
          className="flex flex-col gap-6 py-6 rounded-2xl"
        >

          {/* Warnings */}
          <div className="flex gap-8 p-7 rounded-2xl"
            style={{
              background: COLOURS.white,
              boxShadow: `0 2px 16px rgba(0,0,0,0.06)`,
              border: `1px solid ${COLOURS.grey}`,
              width: "100%",
            }}
          >
            {/* Text */}
            <div className="flex flex-col gap-3"
              style={{
                background: COLOURS.white,
                width: "100%",
              }}
            >
              <h3 className="font-semibold text-[18px]" style={{ color: COLOURS.red }}>
                Notice
              </h3>

              <ol className="flex flex-col gap-3" style={{ color: COLOURS.darkGrey }}>
                {[
                  "Not all program/course data is guaranteed to be accurate or up-to-date. Always double-check with official resources.",
                  "This tools is only for students in the Arts & Science faculty at Queen's, and will not work for other faculties or universities.",
                  "This tools is in active development and may contain bugs or incomplete features. If you encounter any issues, please report them to the developer.",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-[16px] leading-[1.65]">
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold mt-[5px]"
                      style={{ background: COLOURS.red, color: COLOURS.white }}
                    >
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}