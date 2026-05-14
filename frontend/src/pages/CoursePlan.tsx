// pages/CoursePlanPage.tsx
import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getCourses } from '../services/api';
import { CoursePlanChart } from '../components/courseplan/CoursePlanChart';
import { Legend } from '../components/courseplan/Legend';
import { SectionSideBar } from '../components/courseplan/SectionSideBar';
import CreditBar from '../components/CreditBar';
import Footer from '../components/Footer';
import { usePlanLayout } from '../hooks/planLayout';
import { usePlanStore } from '../store/planStore';
import { COLOURS } from '../utils/colours';
import { getPlanCredits, getCreditLimitForPrograms } from '../utils/credits';
import type { Course, ProgramList } from '../types/plan';
import NavBar from '../components/NavBar';

export default function CoursePlanPage() {
  const navigate = useNavigate();
  const { programs, graph, selectedCourses, addCourse, removeCourse, courseErrors, redoSection } = usePlanStore();
  const { nodes, edges, yearSections, onNodesChange, onEdgesChange } = usePlanLayout();

  const [allCourses, setAllCourses]       = useState<Course[]>([]);

  useEffect(() => {
    getCourses().then(setAllCourses).catch(() => {});
  }, []);

  useEffect(() => {
    if (programs.length === 0) navigate('/planner');
  }, [programs, navigate]);

  const flowHeight = useMemo(() => {
    if (yearSections.length === 0) return 600;
    const last = yearSections[yearSections.length - 1];
    return last.y + last.height;
  }, [yearSections]);

  // Extract programLists from all programs
  const programLists = useMemo((): ProgramList[] => {
    return programs.flatMap(p => (p.course_lists || []));
  }, [programs]);

  // The active node for highlight is the locked one if set, otherwise hovered.
  // While locked, hovering other nodes has no effect.

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { courseId } = JSON.parse(raw) as { courseId: number };
      const { courseCode } = JSON.parse(raw) as { courseCode: string };
      const { isElective } = JSON.parse(raw) as { isElective: boolean };
      if (typeof courseId === 'number') addCourse(courseCode, courseId, isElective ? 'elective' : 'choice');
    } catch {
      // malformed drag payload — ignore
    }
  };

  const programNames = programs.map(p => p.program_name).join(' + ');

  if (programs.length === 0 || !graph) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLOURS.warmWhite }}>
      <NavBar
        onHome={() => navigate("/")}
        onPlan={() => navigate("/planner")}
        onAbout={() => navigate("/about")}
        activePage="None"
      />
      <div className="px-8 pb-6 flex-1">
        <div className="py-6 flex items-center">

          <div className="pl-6 border-r border-gray-300 my-2">
            <Legend />
          </div>

          <div className="flex-1 px-8 min-w-0">
            <div className="min-w-0">
              <span 
                className="sm:text-xl md:text-2xl text-lg font-bold leading-tight block truncate transition-all" 
                style={{ color: COLOURS.blue }}
                title={programNames}
              >
                {programNames}
              </span>
            </div>
            <div className="mt-3">
              <CreditBar
                effectiveTotal={getPlanCredits(selectedCourses, graph)}
                savings={0}
                doubleCountedCourseCodes={[]}
                exceedsLimit={getPlanCredits(selectedCourses, graph) > getCreditLimitForPrograms(programs)}
                structuresLoaded={true}
                programs={programs}
              />
            </div>
          </div>

          <div className='px-6 border-l border-gray-300 my-2 self-stretch flex items-center'>
            <div className='flex text-s text-gray-500 gap-2 flex-wrap'>
              {programs.map((program, index) => (
                <div key={program.program_id} className='flex items-center gap-2'>
                  {index > 0 && <span className='text-gray-500'>|</span>}
                  {program.program_link ? (
                    <a
                      href={program.program_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline cursor-pointer whitespace-nowrap"
                      style={{ color: COLOURS.blue}}
                      title={program.program_name}
                    >
                      View Program Link
                    </a>
                  ) : (
                    <span className='text-gray-400 whitespace-nowrap'>(No link)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-6 items-start w-full">
          <CoursePlanChart
            nodes={nodes}
            edges={edges}
            yearSections={yearSections}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onDrop={handleDrop}
            flowHeight={flowHeight}
            programNames={programNames}
          />

          <div style={{ height: flowHeight }} className="w-[27%]">
            <SectionSideBar
              programs={programs}
              selectedCourses={selectedCourses}
              courseErrors={courseErrors ?? new Map()}
              onAdd={addCourse}
              onRemove={removeCourse}
              allCourses={allCourses}
              onRedoSection={redoSection}
              programLists={programLists}
            />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}