// components/courseplan/SectionSideBar.tsx

import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ProgramStructure, SelectedCourse } from '../../types/plan';
import { COLOURS } from '../../utils/colours';
import { LOGIC_REQUIRED } from '../../utils/program';
import { formatProgramName, formatCourseName, getSectionLabel } from '../../utils/formatNames';

// Types 
interface Props {
  programs: ProgramStructure[];
  selectedCourses: SelectedCourse[];
  allCourses: { course_id: number; course_code: string; title: string | null; credits: number | null }[];
  onAdd: (courseCode: string, courseId: number, isElective: boolean) => void;
  onRemove: (courseId: number) => void;
  onRedoSection: (courseIds: number[]) => void;
  courseErrors: Map<number, string>;
}

interface SideBarCourse {
  courseId: number;
  courseCode: string;
  title: string | null;
  credits: number | null;
  isSelected: boolean;
  error: string | null;
}

interface SideBarSection {
  key: string;
  sectionName: string;
  programName: string;
  creditReq: number | null;
  courses: SideBarCourse[];
}

// Helpers 

/**
 * Builds sidebar sections from CHOICE sections only.
 * Required sections are handled by autoFillRequired in the store — those
 * courses are auto-added and locked; they don't belong in the sidebar.
 */
function buildSections(
  programs: ProgramStructure[],
  selectedCourses: SelectedCourse[],
  courseErrors: Map<number, string>,
): SideBarSection[] {
  const selectedIds = new Set(selectedCourses.map(c => c.courseId));

  const sections: SideBarSection[] = [];

  for (const program of programs) {
    for (const section of program.sections) {
      // Skip required sections — those courses are auto-filled and locked
      if (section.logic_type === LOGIC_REQUIRED) continue;

      sections.push({
        key: `${program.program_id}-${section.section_id}`,
        sectionName: getSectionLabel(sections.length),
        programName: formatProgramName(program.program_name),
        creditReq: section.credit_req ?? null,
        courses: section.section_courses.map(c => ({
          courseId: c.course_id,
          courseCode: formatCourseName(c.course_code),
          title: c.title,
          credits: c.credits,
          isSelected: selectedIds.has(c.course_id),
          error: courseErrors.get(c.course_id) ?? null,
        })),
      });
    }
  }

  return sections;
}

function requirementLabel(creditReq: number | null, totalCourses: number): string {
  if (creditReq !== null && creditReq > 0) {
    return `Choose ${creditReq} unit${creditReq !== 1 ? 's' : ''} from ${totalCourses} course${totalCourses !== 1 ? 's' : ''}`;
  }
  return `Choose from ${totalCourses} course${totalCourses !== 1 ? 's' : ''}`;
}

function selectedCredits(courses: SideBarCourse[]): number {
  return courses
    .filter(c => c.isSelected)
    .reduce((sum, c) => sum + (c.credits ?? 3), 0);
}

// Completion check (pure, no hooks) 
function isSectionComplete(section: SideBarSection): boolean {
  if (section.creditReq !== null && section.creditReq > 0) {
    return selectedCredits(section.courses) >= section.creditReq;
  }
  return section.courses.every(c => c.isSelected);
}

// Main component 
export function SectionSideBar({ programs, selectedCourses, allCourses, onAdd, onRemove, onRedoSection, courseErrors }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return [];
    
    const q = raw.toUpperCase().replace(/\s+/g, '');
    const looksLikeCode = /[A-Z]/i.test(raw);

    return allCourses
      .filter(c => {
        const code = c.course_code.toUpperCase().replace(/\s+/g, '');
        const codeMatch = code.includes(q);
        const titleMatch = c.title?.toLowerCase().includes(raw.toLowerCase());
        return looksLikeCode ? codeMatch : (codeMatch || titleMatch);
      })
      .slice(0, 10);
  }, [searchQuery, allCourses]);

  const sections = useMemo(
    () => buildSections(programs, selectedCourses, courseErrors),
    [programs, selectedCourses, courseErrors],
  );

  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());

  // Track which keys were already complete so we only react to *transitions*
  const prevCompleteRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const nowComplete = new Set(
      sections.filter(isSectionComplete).map(s => s.key),
    );

    // Find keys that just became complete this render
    const newlyComplete = [...nowComplete].filter(
      k => !prevCompleteRef.current.has(k),
    );
    // Find keys that just became incomplete (user removed a course)
    const newlyIncomplete = [...prevCompleteRef.current].filter(
      k => !nowComplete.has(k),
    );

    if (newlyComplete.length > 0 || newlyIncomplete.length > 0) {
      setOpenKeys(prev => {
        const next = new Set(prev);
        newlyComplete.forEach(k => next.delete(k));    // auto-close when done
        newlyIncomplete.forEach(k => next.add(k));     // re-open when un-done
        return next;
      });
    }

    prevCompleteRef.current = nowComplete;
  }, [sections]);

  // Completed sections toggle is blocked — they render locked at the bottom
  const toggle = (key: string) => {
    setOpenKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Sort: incomplete first, complete last
  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => {
      const ac = isSectionComplete(a) ? 1 : 0;
      const bc = isSectionComplete(b) ? 1 : 0;
      return ac - bc;
    }),
    [sections],
  );

  const [electiveOpen, setElectiveOpen] = useState(false);

  const selectedElectives = useMemo(() => {
    // Build exclusion set from ALL sections (required + choice)
    const sectionCourseIds = new Set(
      programs.flatMap(p =>
        p.sections.flatMap(s => s.section_courses.map(c => c.course_id))
      )
    );

    return selectedCourses
      .filter(c => !sectionCourseIds.has(c.courseId))
      .map(c => {
        const found = allCourses.find(a => a.course_id === c.courseId);
        return found ? {
          courseId: found.course_id,
          courseCode: formatCourseName(found.course_code),
          title: found.title,
          credits: found.credits,
          isSelected: true,
          error: courseErrors.get(found.course_id) ?? null,
        } : null;
      })
      .filter(Boolean) as SideBarCourse[];
  }, [selectedCourses, programs, allCourses, courseErrors]);

  const prevElectiveCount = useRef(0);
  useEffect(() => {
    if (selectedElectives.length > 0 && prevElectiveCount.current === 0) {
      setElectiveOpen(true);
    }
    prevElectiveCount.current = selectedElectives.length;
  }, [selectedElectives.length]);


  const pendingClearId = useRef<number | null>(null);
  const handleSearchAdd = (code: string, id: number) => {
    onAdd(code, id, true);
    pendingClearId.current = id;
  };

  useEffect(() => {
    if (pendingClearId.current === null) return;
    const id = pendingClearId.current;
    
    if (courseErrors.has(id)) {
      // Error was set — don't clear, let user see it
      pendingClearId.current = null;
    } else {
      // No error — course was added successfully
      setSearchQuery('');
      pendingClearId.current = null;
    }
  }, [courseErrors]);


  const multiProgram = programs.length > 1;
  const completedCount = sections.filter(isSectionComplete).length;

  if (sections.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-300 text-sm">
        No optional sections available
      </div>
    );
  }

  return (
    <div className="flex flex-col h-auto max-h-full overflow-hidden rounded-lg border border-gray-200 bg-white">

      {/* ── Header ── */}
      <div className="flex-none px-4 pt-3 pb-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <p
            className="text-[18px] font-bold tracking-widest uppercase"
            style={{ color: COLOURS.blue }}
          >
            Course Sections
          </p>
          {/* Overall completion pill */}
          {completedCount > 0 && (
            <span 
              className="text-[16px] font-semibold px-2 py-0.5"
                style={{ color: COLOURS.blue }}
              >
              {completedCount}/{sections.length} done
            </span>
          )}
        </div>
        <p className="text-[16px] text-gray-500 mt-0.5">
          Drag and Drop or Click · Click
          <span className="font-bold text-gray-800"> ✕</span> to remove
        </p>
      </div>

      {sortedSections.map((section, index) => {
      const isComplete = isSectionComplete(section);
      const prevIsComplete = index > 0 && isSectionComplete(sortedSections[index - 1]);
      const isOpen = openKeys.has(section.key);
      const selCredits = selectedCredits(section.courses);
      const selCount = section.courses.filter(c => c.isSelected).length;
      const progressPct =
        section?.creditReq !== null && section?.creditReq > 0
          ? Math.min(100, (selCredits / section.creditReq) * 100)
          : Math.min(100, (selCount / Math.max(1, section.courses.length)) * 100);

      return (
        <React.Fragment key={section.key}>
          {isComplete && !prevIsComplete && (
            <div className="px-4 py-2 border-b border-gray-100">
              <p 
                className="text-[18px] font-bold tracking-widest uppercase"
                style={{ color: COLOURS.blue }}
              >
                Completed Sections
              </p>
            </div>
          )}

          <div className={isComplete ? 'opacity-75' : ''}>
            <button
              onClick={() => toggle(section.key)}
              className="w-full text-left px-4 py-2.5 transition-colors hover:bg-gray-50/100 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {multiProgram && (
                    <p
                      className="text-[16px] font-bold tracking-widest uppercase mb-0.5 truncate"
                      style={{ color: COLOURS.blue, opacity: 0.45 }}
                    >
                      {section.programName}
                    </p>
                  )}
                  <p className="text-[16px] font-semibold leading-tight truncate"
                    style={{ color: COLOURS.blue }}
                  >
                    {section.sectionName}
                  </p>
                  <p className="text-[14px] text-gray-500 mt-0.5">
                    {requirementLabel(section.creditReq, section.courses.length)}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-none mt-0.5">
                  {isComplete ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const courseIds = section.courses.map(c => c.courseId);
                          prevCompleteRef.current.delete(section.key);
                          onRedoSection(courseIds);
                        }}
                        className="text-[16px] font-medium px-2 py-0.5 rounded transition-colors hover:text-red-400"
                        style={{ color: COLOURS.red }}
                      >
                        Redo
                      </button>
                    </div>
                  ) : section?.creditReq !== null && section?.creditReq > 0 ? (
                    <span className="text-[15px] text-gray-500 tabular-nums whitespace-nowrap">
                      {selCredits}/{section.creditReq}u
                    </span>
                  ) : (
                    <span className="text-[15px] text-gray-500 tabular-nums whitespace-nowrap">
                      {selCount}/{section.courses.length}
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 text-gray-500 flex-none transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {!isComplete && (
                <div className="mt-2 h-0.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPct}%`,
                      background: COLOURS.brightBlue,
                      opacity: 0.6,
                    }}
                  />
                </div>
              )}
            </button>

            {isOpen && (
              <div
                className="pb-1.5 bg-gray-50/40 overflow-y-auto"
                style={{ maxHeight: section.courses.length >= 6 ? '265px' : undefined }}
              >
                {section.courses.length === 0 ? (
                  <p className="px-4 py-2 text-[16px] text-gray-300 italic">
                    No courses listed
                  </p>
                ) : (
                  section.courses.map(course => (
                    <CourseRow
                      key={course.courseId}
                      course={course}
                      onAdd={(code, id) => onAdd(code, id, false)}
                      onRemove={onRemove}
                      isLocked={isComplete}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </React.Fragment>
      );
    })}

      {/* ── Search any course ── */}
      <div className="flex-none border-t border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <p
            className="text-[18px] font-bold tracking-widest uppercase"
            style={{ color: COLOURS.blue }}
          >
            Add Any Course
          </p>
          {selectedElectives.length > 0 && (
            <button
              onClick={() => setElectiveOpen(o => !o)}
              className="flex items-center gap-1 text-[14px] text-gray-500 hover:text-gray-600 transition-colors"
            >
              <span>{selectedElectives.length} added</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-150 ${electiveOpen ? 'rotate-180' : ''}`}
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Selected electives list */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by course code..."
          className="w-full text-[14px] px-3 py-1.5 rounded border border-gray-200 outline-none focus:border-gray-400 transition-colors"
        />

        {searchResults.length > 0 && (
          <div className="mt-1.5 divide-y divide-gray-100 rounded border border-gray-100 bg-white overflow-hidden">
            {searchResults.map(course => {
              const isSelected = selectedCourses.some(c => c.courseId === course.course_id);
              const error = courseErrors.get(course.course_id) ?? null;
              return (
                <CourseRow
                  key={course.course_id}
                  course={{
                    courseId: course.course_id,
                    courseCode: formatCourseName(course.course_code),
                    title: course.title,
                    credits: course.credits,
                    isSelected,
                    error,
                  }}
                  onAdd={handleSearchAdd}
                  onRemove={onRemove}
                />
              );
            })}
          </div>
        )}

        {/* Selected electives list */}
        {electiveOpen && selectedElectives.length > 0 && (
          <div
            className="mt-2 rounded border border-gray-100 bg-white divide-y divide-gray-100 overflow-y-auto"
            style={{ maxHeight: selectedElectives.length > 5 ? '220px' : undefined }}
          >
            {selectedElectives.map(course => (
              <CourseRow
                key={course.courseId}
                course={course}
                onAdd={(code, id) => onAdd(code, id, true)}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// CourseRow 
function CourseRow({
  course,
  onAdd,
  onRemove,
  isLocked = false,
}: {
  course: SideBarCourse;
  onAdd: (code: string, id: number, isElective: boolean) => void;
  onRemove: (id: number) => void;
  isLocked?: boolean;
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ courseId: course.courseId, courseCode: course.courseCode }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable={!course.isSelected && !isLocked}
      onDragStart={!isLocked ? handleDragStart : undefined}
      onClick={() => !course.isSelected && !isLocked && onAdd(course.courseCode, course.courseId, false)}
      className={`group flex items-center gap-2.5 px-4 py-1.5 transition-colors select-none
        ${course.isSelected
          ? 'bg-white cursor-default'
          : isLocked
            ? 'cursor-default'
            : 'cursor-grab hover:bg-white'
        }`}
    >
      {/* Selected indicator bar */}
      <span
        className="flex-none w-0.5 h-9 rounded-full transition-colors"
        style={{ 
          backgroundColor: course.error ? COLOURS.red : course.isSelected ? COLOURS.brightBlue : COLOURS.grey,
          opacity: 0.9,
        }}
      />

      {/* Course info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[14px] font-semibold leading-tight ${
              course.isSelected ? 'text-gray-500' : 'text-gray-700'
            }`}
          >
            {formatCourseName(course.courseCode)}
          </span>
          {course.credits != null && (
            <span className="text-[14px] text-gray-500 tabular-nums">
              {course.credits}u
            </span>
          )}
        </div>
        {course.title && (
          <p className="text-[14px] text-gray-400 truncate leading-tight mt-0.5">
            {course.title}
          </p>
        )}
        {course.error && (
          <p className="text-[12px] text-red-400 leading-tight mt-0.5">
            {course.error}
          </p>
        )}
      </div>

      {/* Action button */}
      {course.isSelected && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(course.courseId); }}
          className="flex-none text-[14px] font-semibold transition-opacity text-gray-300 px-1.5 py-0.5 rounded"
          style={{ color: COLOURS.red }}
          title="Remove course"
        >
          ✕
        </button>
      )}

    </div>
  );
}