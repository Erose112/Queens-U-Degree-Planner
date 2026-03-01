import { useState, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import  NavBar  from "../components/NavBar";
import { COLOURS } from "../utils/colours";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormErrors {
  program?: string;
  spec?: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────
const PROGRAMS: string[] = [
  "Bachelor of Computing (Hons)",
  "Bachelor of Computing",
  "Computing and Mathematics",
  "Computing and Physics",
  "Biomedical Computing",
  "Cognitive Science",
];

const SPECIALIZATIONS: string[] = [
  "Artificial Intelligence",
  "Biomedical Informatics",
  "Cloud Computing",
  "Computer Games",
  "Data Analytics",
  "General",
  "Networks & Security",
  "Software Design",
  "Computing, Mathematics & Analytics (COMA)",
];

const COURSE_SUGGESTIONS: string[] = [
  "CISC 101", "CISC 102", "CISC 110", "CISC 121", "CISC 124",
  "CISC 203", "CISC 204", "CISC 220", "CISC 221", "CISC 223",
  "CISC 226", "CISC 235", "CISC 322", "CISC 324", "CISC 326",
  "CISC 360", "CISC 365", "CISC 497",
  "MATH 110", "MATH 112", "MATH 120", "MATH 121", "MATH 210",
  "MATH 212", "MATH 221", "MATH 280", "MATH 281", "MATH 310",
  "MATH 311", "MATH 326", "MATH 339", "MATH 401", "MATH 413",
  "MATH 414", "MATH 418",
  "STAT 161", "STAT 252", "STAT 268", "STAT 269", "STAT 353",
  "STAT 361", "STAT 463",
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLElement>(null);

  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [selectedSpec, setSelectedSpec] = useState<string>("");
  const [courseInput, setCourseInput] = useState<string>("");
  const [takenCourses, setTakenCourses] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});


  const handleCourseInput = (val: string) => {
    setCourseInput(val);
    if (val.length >= 2) {
      const q = val.toUpperCase();
      setSuggestions(
        COURSE_SUGGESTIONS.filter(
          (c) => c.startsWith(q) && !takenCourses.includes(c)
        ).slice(0, 6)
      );
    } else {
      setSuggestions([]);
    }
  };

  const addCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    if (c && !takenCourses.includes(c)) {
      setTakenCourses((prev) => [...prev, c]);
    }
    setCourseInput("");
    setSuggestions([]);
  };

  const removeCourse = (c: string) => {
    setTakenCourses((prev) => prev.filter((x) => x !== c));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && courseInput.trim()) {
      e.preventDefault();
      addCourse(suggestions[0] ?? courseInput);
    }
    if (e.key === "Escape") setSuggestions([]);
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!selectedProgram) errs.program = "Please select a program.";
    if (!selectedSpec) errs.spec = "Please select a specialization.";
    return errs;
  };

  const handleGenerate = () => {
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    navigate("/course-planner", {
      state: {
        program: selectedProgram,
        specialization: selectedSpec,
        completedCourses: takenCourses,
      },
    });
  };

  const handleAbout = () => {
    navigate("/about", {});
  }

  return (
    <div className="font-sans min-h-screen flex flex-col" style={{ background: COLOURS.grey }}>
      <style>{`
        body { font-family: 'DM Sans', sans-serif; }
        .font-playfair { font-family: 'Playfair Display', serif; }

        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .animate-pop-in { animation: popIn 0.15s ease both; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up-1 { animation: fadeUp 0.6s ease both; }
        .animate-fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
        .animate-fade-up-3 { animation: fadeUp 0.6s 0.3s  ease both; }

        .card-nav::before {
          content: ''; position: absolute; inset: 0;
          background: ${COLOURS.blue}; transform: scaleY(0); transform-origin: bottom;
          transition: transform 0.25s ease; border-radius: 14px;
        }
        .card-nav:hover::before { transform: scaleY(1); }
        .card-nav:hover .card-text { color: ${COLOURS.white} !important; }
        .card-text { transition: color 0.2s; }

        select.styled {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23002452' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
        }
      `}</style>

      <NavBar onAbout={handleAbout} activePage="Home" />

      {/* Main Page*/}
      <section
        className="relative overflow-hidden px-10 pt-[80px] pb-[80px] text-center flex flex-col justify-center"
        style={{ 
            minHeight: "calc(100vh - 70px)",
            background: `linear-gradient(180deg, ${COLOURS.white} 70%, ${COLOURS.grey} 100%)` 
        }}
      >

        <p className="animate-fade-up-1 text-[14px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: COLOURS.red }}>
          Queen's University · Course Planner
        </p>

        <h1
          className="animate-fade-up-2 font-playfair font-black leading-[1.1] mt-3 mb-5"
          style={{ fontSize: "clamp(38px, 6vw, 72px)", color: COLOURS.blue }}
        >
          Plan Your Degree.<br />
          <span style={{ color: COLOURS.yellow }} className="italic">Your Way.</span>
        </h1>

        <p
          className="animate-fade-up-3 max-w-[520px] mx-auto mb-10 text-lg leading-[1.65] font-light"
          style={{ color: COLOURS.darkGrey }}
        >
          Select your program, add the courses you've already completed, and get a
          personalized year-by-year academic plan; built around your interests.
        </p>

        {/* How it works strip */}
        <div className="flex justify-center gap-0 flex-wrap">
          {[
            { n: "1", label: "Choose Program & Specialization" },
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
                <span className="text-[13px] font-medium max-w-[100px] block" style={{ color: COLOURS.darkGrey }}>
                  {step.label}
                </span>
              </div>
              {i < 2 && <div className="w-10 h-[2px] flex-shrink-0" style={{ background: COLOURS.grey }} />}
            </div>
          ))}
        </div>
      </section>


      {/* Fill out form*/}
      <section ref={formRef} className="pt-24 px-10 pb-24 max-w-[860px] mx-auto">
        <div
          className="bg-white rounded-2xl p-12 max-w"
          style={{
            boxShadow: `0 4px 40px ${COLOURS.blue}14`,
            border: `1px solid ${COLOURS.grey}`,
          }}
        >
          <h2 className="font-playfair text-[28px] font-bold mb-1.5" style={{ color: COLOURS.blue }}>
            Build Your Academic Plan
          </h2>
          <p className="text-[15px] mb-10" style={{ color: COLOURS.darkGrey }}>
            Fill in the details below and we'll generate a personalised course roadmap.
          </p>

          {/* Program + Spec row */}
          <div className="flex gap-7 flex-wrap mb-8">
            {/* Program */}
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: COLOURS.blue, color: COLOURS.white }}
                >
                  1
                </span>
                <label className="font-semibold text-[15px]" style={{ color: COLOURS.blue }}>Program</label>
              </div>
              <select
                className={`styled w-full px-4 py-3 rounded-xl border-2 bg-white font-sans text-[15px] cursor-pointer transition-colors focus:outline-none ${errors.program ? "border-red-600" : ""}`}
                style={{ color: COLOURS.blue, borderColor: errors.program ? undefined : COLOURS.grey }}
                value={selectedProgram}
                onChange={(e) => {
                  setSelectedProgram(e.target.value);
                  setErrors((prev) => ({ ...prev, program: undefined }));
                }}
              >
                <option value="">Select a program…</option>
                {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.program && (
                <p className="text-[13px] mt-1.5 font-medium" style={{ color: COLOURS.red }}>{errors.program}</p>
              )}
            </div>

            {/* Specialization */}
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                  style={{ background: COLOURS.blue, color: COLOURS.white }}
                >
                  2
                </span>
                <label className="font-semibold text-[15px]" style={{ color: COLOURS.blue }}>Specialization</label>
              </div>
              <select
                className={`styled w-full px-4 py-3 rounded-xl border-2 bg-white font-sans text-[15px] cursor-pointer transition-colors focus:outline-none ${errors.spec ? "border-red-600" : ""}`}
                style={{ color: COLOURS.blue, borderColor: errors.spec ? undefined : COLOURS.grey }}
                value={selectedSpec}
                onChange={(e) => {
                  setSelectedSpec(e.target.value);
                  setErrors((prev) => ({ ...prev, spec: undefined }));
                }}
              >
                <option value="">Select a specialization…</option>
                {SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.spec && (
                <p className="text-[13px] mt-1.5 font-medium" style={{ color: COLOURS.red }}>{errors.spec}</p>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px mb-8" style={{ background: COLOURS.grey }} />

          {/* Courses taken */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                style={{ background: COLOURS.blue, color: COLOURS.white }}
              >
                3
              </span>
              <label className="font-semibold text-[15px]" style={{ color: COLOURS.blue }}>
                Courses Already Completed
                <span className="font-normal ml-1.5 text-[13px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </label>
            </div>
            <div className="relative">
              <input
                className="w-full px-4 py-3 rounded-xl border-2 bg-white font-sans text-[15px] transition-colors focus:outline-none"
                style={{ borderColor: COLOURS.grey, color: COLOURS.blue }}
                type="text"
                placeholder="Type a course code, e.g. MATH 121…"
                value={courseInput}
                onChange={(e) => handleCourseInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = COLOURS.blue; }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = COLOURS.grey; }}
              />
              {suggestions.length > 0 && (
                <div
                  className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white rounded-xl overflow-hidden z-50"
                  style={{ border: `2px solid ${COLOURS.blue}`, boxShadow: `0 8px 24px ${COLOURS.blue}1f` }}
                >
                  {suggestions.map((s) => (
                    <div
                      key={s}
                      className="px-4 py-2.5 cursor-pointer text-sm font-medium transition-colors"
                      style={{ color: COLOURS.blue }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}66`; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      onClick={() => addCourse(s)}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs mt-1.5" style={{ color: COLOURS.darkGrey }}>
              Press Enter or click a suggestion to add. Click ✕ on a tag to remove it.
            </p>
          </div>

          {/* Tags */}
          {takenCourses.length > 0 && (
            <div
              className="flex flex-wrap gap-2 p-4 rounded-xl mb-8 border border-dashed"
              style={{ background: `${COLOURS.grey}33`, borderColor: COLOURS.grey }}
            >
              {takenCourses.map((c) => (
                <span
                  key={c}
                  className="animate-pop-in inline-flex items-center gap-1.5 pr-2 pl-3 py-1.5 rounded-full text-[13px] font-medium tracking-[0.02em]"
                  style={{ background: COLOURS.blue, color: COLOURS.white }}
                >
                  {c}
                  <button
                    onClick={() => removeCourse(c)}
                    title="Remove"
                    className="ml-[1px] w-[18px] h-[18px] rounded-full border-none cursor-pointer flex items-center justify-center text-xs leading-none transition-colors"
                    style={{ background: `${COLOURS.white}40`, color: COLOURS.white }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.white}73`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.white}40`; }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Generate button */}
          <div className={takenCourses.length ? "" : "mt-8"}>
            <button
              className="w-full py-[18px] rounded-xl border-none font-sans text-[17px] font-bold tracking-[0.04em] cursor-pointer transition-all flex items-center justify-center gap-2.5"
              style={{
                background: COLOURS.blue,
                color: COLOURS.white,
                boxShadow: `0 4px 16px ${COLOURS.blue}4d`,
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = COLOURS.yellow;
                btn.style.color = COLOURS.blue;
                btn.style.transform = "translateY(-2px)";
                btn.style.boxShadow = `0 8px 24px ${COLOURS.yellow}59`;
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = COLOURS.blue;
                btn.style.color = COLOURS.white;
                btn.style.transform = "translateY(0)";
                btn.style.boxShadow = `0 4px 16px ${COLOURS.blue}4d`;
              }}
              onClick={handleGenerate}
            >
              <span>Generate My Plan</span>
            </button>
            {(errors.program || errors.spec) && (
              <p className="text-center mt-3 text-sm" style={{ color: COLOURS.red }}>
                Please complete all required fields above.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="text-center py-6 px-10 text-[13px]"
        style={{ background: COLOURS.blue, color: `${COLOURS.white}80` }}
      >
        Queen's Course Planner · For informational use only · Always verify with the official academic calendar.
      </footer>
    </div>
  );
}