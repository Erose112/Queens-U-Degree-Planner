import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import { COLOURS } from "../utils/colours";
import { generatePlan, getPrograms, getCourses, type Program } from "../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FormErrors {
  program?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const formRef = useRef<HTMLElement>(null);

  // Programs fetched from backend
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);

  // Course codes fetched from backend
  const [courseCodes, setCourseCodes] = useState<string[]>([]);

  // Program searchable dropdown
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [programInput, setProgramInput] = useState<string>("");
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
  const programRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Completed courses
  const [courseInput, setCourseInput] = useState<string>("");
  const [takenCourses, setTakenCourses] = useState<string[]>([]);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const courseRef = useRef<HTMLDivElement>(null);

  // Favourite courses
  const [favInput, setFavInput] = useState<string>("");
  const [favCourses, setFavCourses] = useState<string[]>([]);
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const favRef = useRef<HTMLDivElement>(null);

  // ─── Fetch programs + courses on mount ───────────────────────────────────
  useEffect(() => {
    getPrograms()
      .then(setPrograms)
      .catch(() => setProgramsError("Failed to load programs. Backend not running"))
      .finally(() => setProgramsLoading(false));

    getCourses()
      .then((courses) => setCourseCodes(courses.map((c) => c.course_code).sort()))
      .catch(() => {});
  }, []);

  // ─── Close dropdowns on outside click ────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (programRef.current && !programRef.current.contains(e.target as Node)) {
        setProgramDropdownOpen(false);
        // If user typed but didn't select, restore last valid selection
        if (!selectedProgram) setProgramInput("");
        else setProgramInput(selectedProgram);
      }
      if (courseRef.current && !courseRef.current.contains(e.target as Node)) {
        setCourseDropdownOpen(false);
      }
      if (favRef.current && !favRef.current.contains(e.target as Node)) {
        setFavDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedProgram]);

  // ─── Program helpers ──────────────────────────────────────────────────────
  const allProgramOptions = programs
    .slice()
    .sort((a, b) => a.program_name.localeCompare(b.program_name));

  const filteredPrograms = programInput.trim().length === 0
    ? allProgramOptions
    : allProgramOptions.filter((p) =>
        p.program_name.toLowerCase().includes(programInput.toLowerCase())
      );

  const handleProgramSelect = (name: string) => {
    setSelectedProgram(name);
    setProgramInput(name);
    setProgramDropdownOpen(false);
    setErrors((prev) => ({ ...prev, program: undefined }));
  };

  // ─── Course filter (empty query = show all) ───────────────────────────────
  const filterCourses = (val: string, exclude: string[]): string[] => {
    const q = val.trim().toUpperCase();
    if (!q) return courseCodes.filter((c) => !exclude.includes(c));
    return courseCodes.filter((c) => c.includes(q) && !exclude.includes(c));
  };

  // Completed courses handlers 
  const addCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    if (c && !takenCourses.includes(c)) {
      setTakenCourses((prev) => [...prev, c]);
      // Auto-remove from favourites if present
      setFavCourses((prev) => prev.filter((x) => x !== c));
    }
    setCourseInput("");
    setCourseDropdownOpen(false);
  };

  const removeCourse = (c: string) => {
    setTakenCourses((prev) => prev.filter((x) => x !== c));
    setFavCourses((prev) => prev.filter((x) => x !== c));
  };

  const handleCourseKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matches = filterCourses(courseInput, takenCourses);
      if (matches.length > 0) addCourse(matches[0]);
      else if (courseInput.trim()) addCourse(courseInput);
    }
    if (e.key === "Escape") setCourseDropdownOpen(false);
  };

  // Favourite courses handlers 
  const addFavCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    // Only allow favouriting courses that are already completed
    if (c && !favCourses.includes(c) && takenCourses.includes(c)) {
      setFavCourses((prev) => [...prev, c]);
    }
    setFavInput("");
    setFavDropdownOpen(false);
  };

  const removeFavCourse = (c: string) => setFavCourses((prev) => prev.filter((x) => x !== c));

  const handleFavKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matches = filterCourses(favInput, favCourses).filter(c => takenCourses.includes(c));
      if (matches.length > 0) addFavCourse(matches[0]);
      else if (favInput.trim()) addFavCourse(favInput);
    }
    if (e.key === "Escape") setFavDropdownOpen(false);
  };

  // Form submit 
  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!selectedProgram) errs.program = "Please select a program.";
    return errs;
  };

  const handleGenerate = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
  
    setErrors({});
    setServerError(null);
    setLoading(true);
  
    try {
      // Look up the program_id from the selected program name
      const program = programs.find((p) => p.program_name === selectedProgram);
      if (!program) {
        setErrors({ program: "Program not found." });
        return;
      }

      // Wait for the API to generate the plan
      await generatePlan({
        program_name: selectedProgram,
        completedCourses: takenCourses,
        favouriteCourses: favCourses,
      });

      // Navigate to course-planner once generation is complete
      navigate("/course-planner", {
        state: {
          programName: selectedProgram,
          completedCourses: takenCourses,
          favouriteCourses: favCourses,
        },
      });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleAbout = () => navigate("/about", {});

  // Shared dropdown container style 
  const dropdownContainer = (accentColor: string): React.CSSProperties => ({
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "white",
    border: `2px solid ${accentColor}`,
    borderRadius: "14px",
    boxShadow: `0 8px 32px ${accentColor}28`,
    zIndex: 50,
    overflow: "hidden",
    maxHeight: "224px",
    display: "flex",
    flexDirection: "column",
  });

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

        .dd-item { transition: background 0.1s ease; cursor: pointer; }
        .dd-item:hover { background: ${COLOURS.grey}cc !important; }

        .dd-scroll {
          overflow-y: auto;
          flex: 1;
          scrollbar-width: thin;
          scrollbar-color: ${COLOURS.grey} transparent;
        }
        .dd-scroll::-webkit-scrollbar { width: 5px; }
        .dd-scroll::-webkit-scrollbar-track { background: transparent; }
        .dd-scroll::-webkit-scrollbar-thumb { background: ${COLOURS.grey}; border-radius: 99px; }
      `}</style>

      <NavBar onAbout={handleAbout} activePage="Home" />

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden px-10 pt-[80px] pb-[80px] text-center flex flex-col justify-center"
        style={{
          minHeight: "calc(100vh - 70px)",
          background: `linear-gradient(180deg, ${COLOURS.white} 70%, ${COLOURS.grey} 100%)`
        }}
      >
        <p className="animate-fade-up-1 text-[16px] font-bold tracking-[0.12em] uppercase mb-3" style={{ color: COLOURS.red }}>
          Queen's University · Degree Planner
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

        {/* Steps */}
        <div className="flex justify-center gap-0 flex-wrap">
          {[
            { n: "1", label: "Choose Your Program" },
            { n: "2", label: "Add Completed Courses" },
            { n: "3", label: "Generate Your Plan" },
          ].map((step, i) => (
            <div key={i} className="flex items-center">
              <div className="text-center px-5">
                <div
                  className="w-[42px] h-[42px] rounded-full flex items-center justify-center font-bold text-base mx-auto mb-2"
                  style={{ background: COLOURS.blue, color: COLOURS.white, boxShadow: `0 4px 12px ${COLOURS.blue}33` }}
                >
                  {step.n}
                </div>
                <span className="text-[16px] font-medium max-w-[100px] block" style={{ color: COLOURS.darkGrey }}>
                  {step.label}
                </span>
              </div>
              {i < 2 && <div className="w-16 h-[2px] flex-shrink-0" style={{ background: COLOURS.darkGrey }} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── Form ── */}
      <section ref={formRef} className="pt-24 px-10 pb-24 max-w-[780px] mx-auto w-full">
        <div
          className="bg-white rounded-2xl p-12"
          style={{
            boxShadow: `0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)`,
            border: `1px solid ${COLOURS.grey}`,
          }}
        >
          <h2 className="font-playfair text-[28px] font-bold mb-1.5" style={{ color: COLOURS.blue }}>
            Build Your Academic Plan
          </h2>
          <p className="text-[16px] mb-10" style={{ color: COLOURS.darkGrey }}>
            Fill in the details below and we'll generate a personalised course roadmap.
          </p>

          {/* ── Step 1: Program ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                style={{ background: COLOURS.blue, color: COLOURS.white }}
              >
                1
              </span>
              <label className="font-semibold text-[16px]" style={{ color: COLOURS.blue }}>Program</label>
            </div>

            {programsError ? (
              <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{programsError}</p>
            ) : (
              <div ref={programRef} className="relative">
                {/* Search input */}
                <div className="relative">
                  <input
                    className="w-full px-4 py-3 pr-10 rounded-xl border-2 bg-white font-sans text-[16px] transition-colors focus:outline-none"
                    style={{
                      borderColor: errors.program ? COLOURS.red : programDropdownOpen ? COLOURS.blue : COLOURS.grey,
                      color: selectedProgram ? COLOURS.blue : COLOURS.darkGrey,
                    }}
                    type="text"
                    placeholder={programsLoading ? "Loading programs…" : "Search for a program…"}
                    disabled={programsLoading}
                    value={programInput}
                    onChange={(e) => {
                      setProgramInput(e.target.value);
                      setSelectedProgram("");
                      setProgramDropdownOpen(true);
                      setErrors((prev) => ({ ...prev, program: undefined }));
                    }}
                    onFocus={() => setProgramDropdownOpen(true)}
                  />
                  {/* Chevron / clear */}
                  <button
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: COLOURS.darkGrey }}
                    onClick={() => {
                      if (selectedProgram || programInput) {
                        setSelectedProgram("");
                        setProgramInput("");
                        setProgramDropdownOpen(true);
                      } else {
                        setProgramDropdownOpen((v) => !v);
                      }
                    }}
                  >
                    {selectedProgram || programInput ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points={programDropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Dropdown list */}
                {programDropdownOpen && !programsLoading && (
                  <div style={dropdownContainer(COLOURS.blue)}>
                    <div
                      className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
                      style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
                    >
                      {filteredPrograms.length} program{filteredPrograms.length !== 1 ? "s" : ""}
                    </div>
                    <div className="dd-scroll">
                      {filteredPrograms.length === 0 ? (
                        <div className="px-4 py-3 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                          No programs match "{programInput}"
                        </div>
                      ) : (
                        filteredPrograms.map((p) => (
                          <div
                            key={p.program_id}
                            className="dd-item px-4 py-3 text-[14px] font-medium"
                            style={{
                              color: selectedProgram === p.program_name ? COLOURS.white : COLOURS.blue,
                              background: selectedProgram === p.program_name ? COLOURS.blue : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (selectedProgram !== p.program_name)
                                (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`;
                            }}
                            onMouseLeave={(e) => {
                              if (selectedProgram !== p.program_name)
                                (e.currentTarget as HTMLDivElement).style.background = "transparent";
                            }}
                            onClick={() => handleProgramSelect(p.program_name)}
                          >
                            {p.program_name}
                            {p.program_type && (
                              <span className="ml-2 text-[12px] font-normal opacity-60">{p.program_type}</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {errors.program && (
              <p className="text-[14px] mt-1.5 font-medium" style={{ color: COLOURS.red }}>{errors.program}</p>
            )}
          </div>

          {/* Divider */}
          <div className="h-px my-10" style={{ background: COLOURS.grey }} />

          {/* ── Step 2: Completed courses ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                style={{ background: COLOURS.blue, color: COLOURS.white }}
              >
                2
              </span>
              <label className="font-semibold text-[16px]" style={{ color: COLOURS.blue }}>
                Courses Already Completed
                <span className="font-normal ml-1.5 text-[14px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </label>
            </div>

            <div ref={courseRef} className="relative">
              <input
                className="w-full px-4 py-3 rounded-xl border-2 bg-white font-sans text-[16px] transition-colors focus:outline-none"
                style={{
                  borderColor: courseDropdownOpen ? COLOURS.blue : COLOURS.grey,
                  color: COLOURS.blue,
                }}
                type="text"
                placeholder="Type to search, or scroll to browse all courses…"
                value={courseInput}
                onChange={(e) => {
                  setCourseInput(e.target.value);
                  setCourseDropdownOpen(true);
                }}
                onFocus={() => setCourseDropdownOpen(true)}
                onKeyDown={handleCourseKeyDown}
              />

              {courseDropdownOpen && courseCodes.length > 0 && (() => {
                const matches = filterCourses(courseInput, takenCourses);
                return (
                  <div style={dropdownContainer(COLOURS.blue)}>
                    <div
                      className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
                      style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
                    >
                      {matches.length} course{matches.length !== 1 ? "s" : ""}
                      {courseInput ? ` matching "${courseInput.toUpperCase()}"` : " — scroll to browse"}
                    </div>
                    <div className="dd-scroll">
                      {matches.length === 0 ? (
                        <div className="px-4 py-3 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                          No courses match "{courseInput}"
                        </div>
                      ) : (
                        matches.map((c) => (
                          <div
                            key={c}
                            className="dd-item px-4 py-2.5 text-[14px] font-semibold"
                            style={{ color: COLOURS.blue, background: "transparent" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                            onClick={() => addCourse(c)}
                          >
                            {c}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <p className="text-[14px] mt-1.5" style={{ color: COLOURS.darkGrey }}>
              Type to filter, scroll to browse, press Enter to add top match. Click ✕ on a tag to remove.
            </p>
          </div>

          {takenCourses.length > 0 && (
            <div
              className="flex flex-wrap gap-2 p-4 rounded-xl mb-8 border border-dashed max-w-[600px]"
              style={{ background: `${COLOURS.grey}33`, borderColor: COLOURS.grey }}
            >
              {takenCourses.map((c) => (
                <span
                  key={c}
                  className="animate-pop-in inline-flex items-center gap-1.5 pr-2 pl-3 py-1.5 rounded-full text-[14px] font-medium tracking-[0.02em]"
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

          {/* Divider */}
          <div className="h-px my-10" style={{ background: COLOURS.grey }} />

          {/* ── Step 3: Favourite courses ── */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold flex-shrink-0"
                style={{ background: COLOURS.yellow, color: COLOURS.white }}
              >
                3
              </span>
              <label className="font-semibold text-[16px]" style={{ color: COLOURS.yellow }}>
                Favourite Courses
                <span className="font-normal ml-1.5 text-[14px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </label>
            </div>

            {/* Info note */}
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-3 text-[14px] leading-snug"
              style={{ background: `${COLOURS.yellow}15`, border: `1px solid ${COLOURS.yellow}40`, color: COLOURS.darkGrey }}
            >
              <svg className="flex-shrink-0 mt-0.5" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={COLOURS.yellow} strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              Only courses you've completed can be marked as favourites. Removing a course from completed will also remove it from favourites.
            </div>

            <div ref={favRef} className="relative">
              <input
                className="w-full px-4 py-3 rounded-xl border-2 bg-white font-sans text-[16px] transition-colors focus:outline-none"
                style={{
                  borderColor: favDropdownOpen ? COLOURS.yellow : COLOURS.grey,
                  color: COLOURS.darkGrey,
                }}
                type="text"
                placeholder="Type to search, or scroll to browse all courses…"
                value={favInput}
                onChange={(e) => {
                  setFavInput(e.target.value);
                  setFavDropdownOpen(true);
                }}
                onFocus={() => setFavDropdownOpen(true)}
                onKeyDown={handleFavKeyDown}
              />

              {favDropdownOpen && courseCodes.length > 0 && (() => {
                const matches = filterCourses(favInput, favCourses).filter(c => takenCourses.includes(c));
                return (
                  <div style={dropdownContainer(COLOURS.yellow)}>
                    <div
                      className="px-4 py-2 text-[12px] font-semibold uppercase tracking-wider flex-shrink-0"
                      style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
                    >
                      {matches.length} course{matches.length !== 1 ? "s" : ""}
                      {favInput ? ` matching "${favInput.toUpperCase()}"` : " available — scroll to browse"}
                    </div>
                    <div className="dd-scroll">
                      {matches.length === 0 ? (
                        <div className="px-4 py-3 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                          No courses match "{favInput}"
                        </div>
                      ) : (
                        matches.map((c) => (
                          <div
                            key={c}
                            className="dd-item px-4 py-2.5 text-[14px] font-semibold"
                            style={{ color: COLOURS.darkGrey, background: "transparent" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                            onClick={() => addFavCourse(c)}
                          >
                            {c}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <p className="text-[14px] mt-1.5" style={{ color: COLOURS.darkGrey }}>
              Type to filter, scroll to browse, press Enter to add top match. Click ✕ on a tag to remove.
            </p>
          </div>

          {favCourses.length > 0 && (
            <div
              className="flex flex-wrap gap-2 p-4 rounded-xl mb-8 border border-dashed max-w-[600px]"
              style={{ background: `${COLOURS.yellow}18`, borderColor: `${COLOURS.yellow}99` }}
            >
              {favCourses.map((c) => (
                <span
                  key={c}
                  className="animate-pop-in inline-flex items-center gap-1.5 pr-2 pl-3 py-1.5 rounded-full text-[14px] font-medium tracking-[0.02em]"
                  style={{ background: COLOURS.yellow, color: COLOURS.white }}
                >
                  {c}
                  <button
                    onClick={() => removeFavCourse(c)}
                    title="Remove"
                    className="ml-[1px] w-[18px] h-[18px] rounded-full border-none cursor-pointer flex items-center justify-center text-xs leading-none transition-colors"
                    style={{ background: `${COLOURS.darkGrey}25`, color: COLOURS.white }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.darkGrey}45`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.darkGrey}25`; }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ── Generate button ── */}
          <div className={`flex flex-col items-center justify-center ${takenCourses.length || favCourses.length ? "" : "mt-8"}`}>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full max-w-[360px] py-[18px] rounded-xl border-none font-sans text-[18px] font-bold tracking-[0.04em] transition-all flex items-center justify-center gap-2.5"
              style={{
                background: COLOURS.blue,
                color: COLOURS.white,
                boxShadow: `0 4px 16px ${COLOURS.blue}4d`,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (loading) return;
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = COLOURS.yellow;
                btn.style.color = COLOURS.blue;
                btn.style.transform = "translateY(-2px)";
                btn.style.boxShadow = `0 8px 24px ${COLOURS.yellow}59`;
              }}
              onMouseLeave={(e) => {
                if (loading) return;
                const btn = e.currentTarget as HTMLButtonElement;
                btn.style.background = COLOURS.blue;
                btn.style.color = COLOURS.white;
                btn.style.transform = "translateY(0)";
                btn.style.boxShadow = `0 4px 16px ${COLOURS.blue}4d`;
              }}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    style={{ width: 18, height: 18, color: COLOURS.white }}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Generating…</span>
                </>
              ) : (
                <span>Generate My Plan</span>
              )}
            </button>

            {errors.program && (
              <p className="text-center mt-3 text-sm" style={{ color: COLOURS.red }}>
                {errors.program}
              </p>
            )}
            {serverError && (
              <p className="text-center mt-3 text-sm" style={{ color: COLOURS.red }}>
                {serverError}
              </p>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}