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
import Footer from '../components/Footer';
import ScrollToTop from '../components/ScrollToTop';
import { usePlanLayout } from '../hooks/planLayout';
import { usePlanStore } from '../store/planStore';
import { YEAR_BAR_WIDTH, YEAR_BAR_COURSE_OFFSET } from '../utils/coursePlanLayout';
import { COLOURS } from '../utils/colours';
import { formatProgramName } from '../utils/formatNames';
import { getPlanCredits } from '../utils/credits';
import type { Course, YearSection } from '../types/plan';

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

  const programNames = programs.map(p => formatProgramName(p.program_name)).join(' + ');
  const totalCredits = programs.reduce((sum, p) => sum + p.total_credits, 0);

  if (programs.length === 0 || !graph) return null;

  return (
    <div className="min-h-screen flex flex-col gap-6" style={{ background: COLOURS.warmWhite }}>
      <ScrollToTop />
      <div className="px-8 flex-1">
        <div className="py-6 flex items-center gap-0">
          <div className="flex items-stretch gap-4 pr-10 border-r border-gray-300">
            <div className="w-1 rounded-full" style={{ background: COLOURS.blue }} />
            <div>
              <button
                onClick={() => navigate('/planner')}
                className="flex items-center gap-1.5 mb-1 text-[14px] font-medium tracking-wide cursor-pointer bg-transparent border-none p-0 transition-opacity opacity-50 hover:opacity-100"
                style={{ color: COLOURS.blue }}
              >
                Back to Planner
              </button>
              <div style={{ color: COLOURS.blue, fontFamily: "'Playfair Display', serif" }}>
                <div className="text-5xl font-black leading-none">Queen's</div>
                <div className="text-5xl font-semibold leading-tight">Degree Planner</div>
              </div>
            </div>
          </div>

          <div className="flex-1 px-8">
            <span className="text-2xl font-bold leading-tight" style={{ color: COLOURS.blue }}>
              {programNames}
            </span>
            <div className="flex items-center gap-3 mt-1.5 text-s text-gray-500">
              <span>
                Plan Credits:{' '}
                <span className="font-bold" style={{ color: COLOURS.blue }}>{getPlanCredits(selectedCourses, graph) + "/"}</span>
                <span className="font-bold" style={{ color: COLOURS.blue }}>{totalCredits}</span>
                
              </span>
              <span className="text-gray-500">|</span>
              <span>
                Total Credits:{' '}
                <span className="font-bold" style={{ color: COLOURS.blue }}>{getPlanCredits(selectedCourses, graph) + "/"}</span>
                <span className="font-bold" style={{ color: COLOURS.blue }}>{"120"}</span>
              </span>
              <span className="text-gray-500">|</span>
              <span>
                Courses selected:{' '}
                <span className="text-gray-600 font-medium">{selectedCourses.length}</span>
              </span>
            </div>
          </div>

          <div className="pl-6 border-l border-gray-300">
            <Legend />
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