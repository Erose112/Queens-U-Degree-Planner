import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";
import ScrollToTop from "../components/ScrollToTop";
import { COLOURS } from "../utils/colours";
import { generatePlan, getPrograms, getCourses, type Program } from "../services/api";
import NextPageButton from "../components/NextPageButton";

interface FormErrors {
  program?: string;
}

// ─── Sub-components moved OUTSIDE PlannerPage so they aren't recreated on every render ───

const StepBadge = ({ n, color }: { n: string; color: string }) => (
  <span
    className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
    style={{ background: color, color: COLOURS.white }}
  >
    {n}
  </span>
);

const InfoNote = ({ color, text }: { color: string; text: string }) => (
  <div
    className="flex items-start gap-2 px-3 py-2 rounded-lg text-[15px] leading-relaxed"
    style={{ background: `${color}12`, border: `1px solid ${color}35`, color: COLOURS.darkGrey }}
  >
    <svg className="flex-shrink-0 mt-[6px]" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
    </svg>
    {text}
  </div>
);

const TagList = ({
  items, onRemove, tagBg, bgColor, borderColor,
}: {
  items: string[]; onRemove: (c: string) => void;
  tagBg: string; bgColor: string; borderColor: string;
}) =>
  items.length > 0 ? (
    <div
      className="flex flex-wrap gap-2 p-3 rounded-xl border border-dashed"
      style={{ background: bgColor, borderColor }}
    >
      {items.map((c) => (
        <span
          key={c}
          className="animate-pop-in inline-flex items-center gap-1 pr-2 pl-2.5 py-1 rounded-full text-[14px] font-semibold"
          style={{ background: tagBg, color: COLOURS.white }}
        >
          {c}
          <button
            onClick={() => onRemove(c)}
            className="w-[15px] h-[15px] rounded-full border-none cursor-pointer flex items-center justify-center text-[12px] leading-none"
            style={{ background: `${COLOURS.white}35`, color: COLOURS.white }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.white}60`; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${COLOURS.white}35`; }}
          >✕</button>
        </span>
      ))}
    </div>
  ) : null;

const dropdownStyle = (accentColor: string): React.CSSProperties => ({
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
  maxHeight: "200px",
  display: "flex",
  flexDirection: "column",
});

const CourseDropdownInput = ({
  inputVal, setInputVal, dropdownOpen, setDropdownOpen,
  inputRef, accentColor, placeholder, disabled, onKeyDown, matches, onSelect, headerText,
}: {
  inputVal: string; setInputVal: (v: string) => void;
  dropdownOpen: boolean; setDropdownOpen: (v: boolean) => void;
  inputRef: React.RefObject<HTMLDivElement | null>; accentColor: string;
  placeholder: string; disabled?: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  matches: string[]; onSelect: (c: string) => void;
  headerText: string;
}) => (
  <div ref={inputRef} className="relative">
    <input
      className="w-full px-3 py-2.5 rounded-xl border-2 bg-white font-sans text-[14px] transition-colors focus:outline-none"
      style={{
        borderColor: dropdownOpen ? accentColor : COLOURS.grey,
        color: COLOURS.blue,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "text",
      }}
      type="text"
      placeholder={placeholder}
      disabled={disabled}
      value={inputVal}
      onChange={(e) => { setInputVal(e.target.value); setDropdownOpen(true); }}
      onFocus={() => !disabled && setDropdownOpen(true)}
      onKeyDown={onKeyDown}
    />
    {dropdownOpen && !disabled && (
      <div style={dropdownStyle(accentColor)}>
        <div
          className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider flex-shrink-0"
          style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
        >
          {headerText}
        </div>
        <div className="dd-scroll">
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px]" style={{ color: COLOURS.darkGrey }}>No matches found</div>
          ) : (
            matches.map((c) => (
              <div
                key={c}
                className="dd-item px-3 py-2 text-[13px] font-semibold"
                style={{ color: COLOURS.blue, background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = `${COLOURS.grey}cc`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                onClick={() => onSelect(c)}
              >
                {c}
              </div>
            ))
          )}
        </div>
      </div>
    )}
  </div>
);

// ─── Main page component ───────────────────────────────────────────────────────

export default function PlannerPage() {
  const navigate = useNavigate();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [courseCodes, setCourseCodes] = useState<string[]>([]);

  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [programInput, setProgramInput] = useState<string>("");
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
  const programRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const [courseInput, setCourseInput] = useState<string>("");
  const [takenCourses, setTakenCourses] = useState<string[]>([]);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const courseRef = useRef<HTMLDivElement>(null);

  const [favInput, setFavInput] = useState<string>("");
  const [favCourses, setFavCourses] = useState<string[]>([]);
  const [favDropdownOpen, setFavDropdownOpen] = useState(false);
  const favRef = useRef<HTMLDivElement>(null);

  const [interestedInput, setInterestedInput] = useState<string>("");
  const [interestedCourses, setInterestedCourses] = useState<string[]>([]);
  const [interestedDropdownOpen, setInterestedDropdownOpen] = useState(false);
  const interestedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPrograms()
      .then(setPrograms)
      .catch(() => setProgramsError("Failed to load programs. Backend not running"))
      .finally(() => setProgramsLoading(false));
    getCourses()
      .then((courses) => setCourseCodes(courses.map((c) => c.course_code).sort()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (programRef.current && !programRef.current.contains(e.target as Node)) {
        setProgramDropdownOpen(false);
        if (!selectedProgram) setProgramInput("");
        else setProgramInput(selectedProgram);
      }
      if (courseRef.current && !courseRef.current.contains(e.target as Node))
        setCourseDropdownOpen(false);
      if (favRef.current && !favRef.current.contains(e.target as Node))
        setFavDropdownOpen(false);
      if (interestedRef.current && !interestedRef.current.contains(e.target as Node))
        setInterestedDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedProgram]);

  const allProgramOptions = programs
    .slice()
    .sort((a, b) => a.program_name.localeCompare(b.program_name));

  const filteredPrograms =
    programInput.trim().length === 0
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

  const filterCourses = (val: string, exclude: string[]): string[] => {
    const q = val.trim().toUpperCase();
    if (!q) return courseCodes.filter((c) => !exclude.includes(c));
    return courseCodes.filter((c) => c.includes(q) && !exclude.includes(c));
  };

  const addCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    if (c && !takenCourses.includes(c)) {
      setTakenCourses((prev) => [...prev, c]);
      setInterestedCourses((prev) => prev.filter((x) => x !== c));
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

  const addFavCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    if (c && !favCourses.includes(c) && takenCourses.includes(c))
      setFavCourses((prev) => [...prev, c]);
    setFavInput("");
    setFavDropdownOpen(false);
  };
  const removeFavCourse = (c: string) =>
    setFavCourses((prev) => prev.filter((x) => x !== c));
  const handleFavKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matches = filterCourses(favInput, favCourses).filter((c) =>
        takenCourses.includes(c)
      );
      if (matches.length > 0) addFavCourse(matches[0]);
      else if (favInput.trim()) addFavCourse(favInput);
    }
    if (e.key === "Escape") setFavDropdownOpen(false);
  };

  const addInterestedCourse = (course: string) => {
    const c = course.trim().toUpperCase();
    if (c && !interestedCourses.includes(c) && !takenCourses.includes(c))
      setInterestedCourses((prev) => [...prev, c]);
    setInterestedInput("");
    setInterestedDropdownOpen(false);
  };
  const removeInterestedCourse = (c: string) =>
    setInterestedCourses((prev) => prev.filter((x) => x !== c));
  const handleInterestedKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matches = filterCourses(interestedInput, [...interestedCourses, ...takenCourses]);
      if (matches.length > 0) addInterestedCourse(matches[0]);
      else if (interestedInput.trim()) addInterestedCourse(interestedInput);
    }
    if (e.key === "Escape") setInterestedDropdownOpen(false);
  };

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
      const program = programs.find((p) => p.program_name === selectedProgram);
      if (!program) { setErrors({ program: "Program not found." }); return; }
      await generatePlan({
        program_name: selectedProgram,
        completedCourses: takenCourses,
        favouriteCourses: favCourses,
        interestedCourses: interestedCourses,
      });
      navigate("/visualizer", {
        state: {
          programName: selectedProgram,
          completedCourses: takenCourses,
          favouriteCourses: favCourses,
          interestedCourses: interestedCourses,
        },
      });
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: COLOURS.white,
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    border: `1px solid ${COLOURS.grey}`,
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  };

  return (
    <div className="font-sans min-h-screen flex flex-col" style={{ background: COLOURS.warmWhite }}>
      <ScrollToTop />
      <style>{`
        body { font-family: 'DM Sans', sans-serif; }
        .font-playfair { font-family: 'Playfair Display', serif; }
        @keyframes popIn {
          from { transform: scale(0.8); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: popIn 0.15s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in   { animation: fadeUp 0.4s ease both; }
        .animate-fade-up-5 { animation: fadeUp 0.6s 0.6s ease both; }
        .dd-item { transition: background 0.1s ease; cursor: pointer; }
        .dd-scroll {
          overflow-y: auto; flex: 1;
          scrollbar-width: thin;
          scrollbar-color: ${COLOURS.grey} transparent;
        }
        .dd-scroll::-webkit-scrollbar { width: 4px; }
        .dd-scroll::-webkit-scrollbar-thumb { background: ${COLOURS.grey}; border-radius: 99px; }
        .planner-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        @media (max-width: 800px) {
          .planner-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <NavBar onHome={() => navigate("/")} onPlan={() => navigate("/planner")} onAbout={() => navigate("/about")} activePage="Plan" />

      {/* ── Page header ── */}
      <div className="px-10 pt-10 pb-8 text-center" style={{ background: COLOURS.warmWhite }}>
        <div className="animate-fade-in max-w-[1100px] mx-auto">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium mb-5 bg-transparent border-none cursor-pointer"
            style={{ color: `${COLOURS.black}90` }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = COLOURS.blue; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = `${COLOURS.black}90`; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
            Back to Home
          </button>
          <h1
            className="font-playfair font-black leading-tight mb-3"
            style={{ fontSize: "clamp(26px, 4vw, 46px)", color: COLOURS.blue }}
          >
            Build Your Academic Plan
          </h1>
          <p className="text-[16px] font-light" style={{ color: COLOURS.black }}>
            Fill in the details below to generate your personalised year-by-year course roadmap.
          </p>
        </div>
      </div>

      {/* ── Form grid ── */}
      <section className="pt-4 px-[30px] pb-[40px] max-w-full mx-auto w-full">
        <div className="planner-grid">

          {/* ── Q1: Program ── */}
          <div style={cardStyle}>
            <div className="flex items-center gap-2">
              <StepBadge n="1" color={COLOURS.blue} />
              <span className="font-semibold text-[16px]" style={{ color: COLOURS.blue }}>
                Program
                <span className="ml-1 text-[14px] font-normal" style={{ color: COLOURS.red }}>*</span>
              </span>
            </div>

            {programsError ? (
              <p className="text-[14px] font-medium" style={{ color: COLOURS.red }}>{programsError}</p>
            ) : (
              <div ref={programRef} className="relative">
                <div className="relative">
                  <input
                    className="w-full px-3 py-2.5 pr-9 rounded-xl border-2 bg-white font-sans text-[14px] transition-colors focus:outline-none"
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
                  <button
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: COLOURS.darkGrey }}
                    onClick={() => {
                      if (selectedProgram || programInput) {
                        setSelectedProgram(""); setProgramInput(""); setProgramDropdownOpen(true);
                      } else {
                        setProgramDropdownOpen((v) => !v);
                      }
                    }}
                  >
                    {selectedProgram || programInput ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points={programDropdownOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                      </svg>
                    )}
                  </button>
                </div>

                {programDropdownOpen && !programsLoading && (
                  <div style={dropdownStyle(COLOURS.blue)}>
                    <div
                      className="px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wider flex-shrink-0"
                      style={{ color: COLOURS.darkGrey, borderBottom: `1px solid ${COLOURS.grey}` }}
                    >
                      {filteredPrograms.length} program{filteredPrograms.length !== 1 ? "s" : ""}
                    </div>
                    <div className="dd-scroll">
                      {filteredPrograms.length === 0 ? (
                        <div className="px-3 py-2.5 text-[14px]" style={{ color: COLOURS.darkGrey }}>
                          No programs match "{programInput}"
                        </div>
                      ) : (
                        filteredPrograms.map((p) => (
                          <div
                            key={p.program_id}
                            className="dd-item px-3 py-2.5 text-[14px] font-medium"
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
                              <span className="ml-2 text-[13px] font-normal opacity-60">{p.program_type}</span>
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
              <p className="text-[15px] font-medium" style={{ color: COLOURS.red }}>{errors.program}</p>
            )}

            <p className="text-[15px] mt-auto pt-1" style={{ color: COLOURS.darkGrey }}>
              Required · Determines available courses and requirements.
            </p>
          </div>

          {/* ── Q2: Completed Courses ── */}
          <div style={cardStyle}>
            <div className="flex items-center gap-2">
              <StepBadge n="2" color={COLOURS.blue} />
              <span className="font-semibold text-[16px]" style={{ color: COLOURS.blue }}>
                Completed Courses
                <span className="font-normal ml-1 text-[14px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </span>
            </div>

            <CourseDropdownInput
              inputVal={courseInput}
              setInputVal={setCourseInput}
              dropdownOpen={courseDropdownOpen}
              setDropdownOpen={setCourseDropdownOpen}
              inputRef={courseRef}
              accentColor={COLOURS.blue}
              placeholder="Search or browse all courses…"
              onKeyDown={handleCourseKeyDown}
              matches={filterCourses(courseInput, takenCourses)}
              onSelect={addCourse}
              headerText={
                courseInput
                  ? `${filterCourses(courseInput, takenCourses).length} matching "${courseInput.toUpperCase()}"`
                  : `${filterCourses("", takenCourses).length} courses — scroll to browse`
              }
            />

            <TagList
              items={takenCourses}
              onRemove={removeCourse}
              tagBg={COLOURS.blue}
              bgColor={`${COLOURS.grey}33`}
              borderColor={COLOURS.grey}
            />

            <p className="text-[15px] mt-auto pt-1" style={{ color: COLOURS.darkGrey }}>
              Press Enter to add the top match · Click ✕ to remove.
            </p>
          </div>

          {/* ── Q3: Favourite Courses ── */}
          <div style={cardStyle}>
            <div className="flex items-center gap-2">
              <StepBadge n="3" color={COLOURS.yellow} />
              <span className="font-semibold text-[16px]" style={{ color: COLOURS.yellow }}>
                Favourite Courses
                <span className="font-normal ml-1 text-[14px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </span>
            </div>

            <InfoNote
              color={COLOURS.yellow}
              text="Only completed courses can be favourited. Removing a completed course also removes it here."
            />

            <CourseDropdownInput
              inputVal={favInput}
              setInputVal={setFavInput}
              dropdownOpen={favDropdownOpen}
              setDropdownOpen={setFavDropdownOpen}
              inputRef={favRef}
              accentColor={COLOURS.yellow}
              placeholder={takenCourses.length === 0 ? "Add completed courses first…" : "Search your completed courses…"}
              disabled={takenCourses.length === 0}
              onKeyDown={handleFavKeyDown}
              matches={filterCourses(favInput, favCourses).filter((c) => takenCourses.includes(c))}
              onSelect={addFavCourse}
              headerText={
                favInput
                  ? `${filterCourses(favInput, favCourses).filter((c) => takenCourses.includes(c)).length} matching "${favInput.toUpperCase()}"`
                  : `${filterCourses("", favCourses).filter((c) => takenCourses.includes(c)).length} available`
              }
            />

            <TagList
              items={favCourses}
              onRemove={removeFavCourse}
              tagBg={COLOURS.yellow}
              bgColor={`${COLOURS.yellow}18`}
              borderColor={`${COLOURS.yellow}99`}
            />

            <p className="text-[15px] mt-auto pt-1" style={{ color: COLOURS.darkGrey }}>
              We'll prioritise similar courses in your generated plan.
            </p>
          </div>

          {/* ── Q4: Interested Courses ── */}
          <div style={cardStyle}>
            <div className="flex items-center gap-2">
              <StepBadge n="4" color={COLOURS.red} />
              <span className="font-semibold text-[16px]" style={{ color: COLOURS.red }}>
                Courses You're Interested In
                <span className="font-normal ml-1 text-[14px]" style={{ color: COLOURS.darkGrey }}>(optional)</span>
              </span>
            </div>

            <InfoNote
              color={COLOURS.red}
              text="Courses you haven't taken yet but are interested in."
            />

            <CourseDropdownInput
              inputVal={interestedInput}
              setInputVal={setInterestedInput}
              dropdownOpen={interestedDropdownOpen}
              setDropdownOpen={setInterestedDropdownOpen}
              inputRef={interestedRef}
              accentColor={COLOURS.red}
              placeholder="Search courses you'd like to take…"
              onKeyDown={handleInterestedKeyDown}
              matches={filterCourses(interestedInput, [...interestedCourses, ...takenCourses])}
              onSelect={addInterestedCourse}
              headerText={
                interestedInput
                  ? `${filterCourses(interestedInput, [...interestedCourses, ...takenCourses]).length} matching "${interestedInput.toUpperCase()}"`
                  : `${filterCourses("", [...interestedCourses, ...takenCourses]).length} courses — scroll to browse`
              }
            />

            <TagList
              items={interestedCourses}
              onRemove={removeInterestedCourse}
              tagBg={COLOURS.red}
              bgColor={`${COLOURS.red}0d`}
              borderColor={`${COLOURS.red}55`}
            />

            <p className="text-[15px] mt-auto pt-1" style={{ color: COLOURS.darkGrey }}>
              We'll try to incorporate these into your roadmap.
            </p>
          </div>
        </div>

        {/* ── CTA Button ── */}
        <div className="animate-fade-up-5 flex flex-col items-center pt-10">
          {serverError && (
            <p className="mb-4 text-[14px] font-medium" style={{ color: COLOURS.red }}>
              {serverError}
            </p>
          )}
          <NextPageButton
            onClick={handleGenerate}
            label="Generate My Plan"
            loading={loading}
            disabled={loading}
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}