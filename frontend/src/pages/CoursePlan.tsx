// pages/CoursePlanPage.tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  useNodes,
  useUpdateNodeInternals,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { getCourses } from '../services/api';
import { CourseNode } from '../components/courseplan/CourseNode';
import { CourseEdge } from '../components/courseplan/CourseEdge';
import { Legend } from '../components/courseplan/Legend';
import { YearSideBar } from '../components/courseplan/YearSideBar';
import { SectionSideBar } from '../components/courseplan/SectionSideBar';
import CreditBar from '../components/CreditBar';
import Footer from '../components/Footer';
import ScrollToTop from '../components/ScrollToTop';
import { usePlanLayout } from '../hooks/planLayout';
import { usePlanStore } from '../store/planStore';
import { YEAR_BAR_WIDTH, YEAR_BAR_COURSE_OFFSET } from '../utils/coursePlanLayout';
import { COLOURS } from '../utils/colours';
import { getPlanCredits } from '../utils/credits';
import { CREDIT_LIMIT } from '../utils/program';
import type { Course, YearSection } from '../types/plan';
import NavBar from '../components/NavBar';

const nodeTypes: NodeTypes = { course: CourseNode };
const edgeTypes: EdgeTypes = { courseEdge: CourseEdge };

function NodeInternalsUpdater() {
  const nodes = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const didUpdate = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !didUpdate.current) {
      didUpdate.current = true;
      updateNodeInternals(nodes.map(n => n.id));
    }
  }, [nodes, updateNodeInternals]);
  return null;
}

function ChartInner({ yearSections }: { yearSections: YearSection[] }) {
  const { y, zoom } = useViewport();
  return <YearSideBar yearSections={yearSections} translateY={y} scale={zoom} />;
}

export default function CoursePlanPage() {
  const navigate = useNavigate();
  const { programs, graph, selectedCourses, addCourse, removeCourse, courseErrors, redoSection } = usePlanStore();
  const { nodes, edges, yearSections, onNodesChange, onEdgesChange } = usePlanLayout();

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [lockedNodeId, setLockedNodeId]   = useState<string | null>(null);
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

  // The active node for highlight is the locked one if set, otherwise hovered.
  // While locked, hovering other nodes has no effect.
  const activeNodeId = lockedNodeId ?? hoveredNodeId;

  const visibleEdges = useMemo(() => {
    if (!activeNodeId) return edges;
    return edges.map(edge => ({
      ...edge,
      style: {
        ...edge.style,
        opacity:
          edge.source === activeNodeId || edge.target === activeNodeId ? 1 : 0.05,
      },
      zIndex:
        edge.source === activeNodeId || edge.target === activeNodeId ? 10 : 0,
    }));
  }, [edges, activeNodeId]);

  const handleNodeClick = (_: React.MouseEvent, node: { id: string }) => {
    // Clicking the already-locked node unlocks it; clicking another locks it.
    setLockedNodeId(prev => prev === node.id ? null : node.id);
  };

  const handlePaneClick = () => {
    setLockedNodeId(null);
    setHoveredNodeId(null);
  };

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
      <ScrollToTop />

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
                exceedsLimit={getPlanCredits(selectedCourses, graph) > CREDIT_LIMIT}
                structuresLoaded={true}
              />
            </div>
          </div>

          <div className='pl-6 border-l border-gray-300 my-2 self-stretch flex items-center'>
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
          <div
            className="w-[73%] border border-gray-300 bg-white rounded-lg overflow-hidden relative"
            style={{ height: flowHeight }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={visibleEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeMouseEnter={(_, node) => { if (!lockedNodeId) setHoveredNodeId(node.id); }}
              onNodeMouseLeave={() => { if (!lockedNodeId) setHoveredNodeId(null); }}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              defaultViewport={{
                x: YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET,
                y: 0,
                zoom: 1,
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={true}
              panOnDrag={false}
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              minZoom={1}
              maxZoom={1}
            >
              <NodeInternalsUpdater />
              <Background color="#f3f4f6" gap={16} />
              <ChartInner yearSections={yearSections} />
            </ReactFlow>
          </div>

          <div style={{ height: flowHeight }} className="w-[27%]">
            <SectionSideBar
              programs={programs}
              selectedCourses={selectedCourses}
              courseErrors={courseErrors ?? new Map()}
              onAdd={addCourse}
              onRemove={removeCourse}
              allCourses={allCourses}
              onRedoSection={redoSection}
            />
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}