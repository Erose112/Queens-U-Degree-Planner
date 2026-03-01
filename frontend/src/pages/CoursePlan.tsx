import { useState, useMemo, useRef, useEffect } from 'react';
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

import { CourseNode } from '../components/CourseNode';
import { CourseChoiceNode } from '../components/CourseChoiceNode';
import { CourseEdge } from '../components/CourseEdge';
import { Legend } from '../components/Legend';
import { YearSideBar } from '../components/YearSideBar';
import { YEAR_BAR_WIDTH, YEAR_BAR_COURSE_OFFSET } from '../utils/coursePlanLayout';
import { convertCoursePlanToFlow } from '../utils/coursePlanConverter';
import type { CoursePlan, YearSection } from '../types';
import { CourseStatus, ConnectionType } from '../types';
import { COLOURS } from '../utils/colours';
import Footer from '../components/Footer';


const nodeTypes: NodeTypes = {
  course: CourseNode,
  courseChoice: CourseChoiceNode,
};

const edgeTypes: EdgeTypes = {
  courseEdge: CourseEdge,
};

function NodeInternalsUpdater() {
  const nodes = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const didUpdate = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !didUpdate.current) {
      didUpdate.current = true;
      updateNodeInternals(nodes.map((n) => n.id));
    }
  }, [nodes, updateNodeInternals]);
  return null;
}

function ChartInner({ yearSections }: { yearSections: YearSection[] }) {
  const { y, zoom } = useViewport();
  return <YearSideBar yearSections={yearSections} translateY={y} scale={zoom} />;
}

export default function CoursePlanPage() {
  const coursePlan: CoursePlan = {
    id: '1',
    programName: 'Computing, Mathematics and Analytics',
    programCode: 'BComp (Hons) COMA-P-BCH',
    totalUnits: 120,
    coreUnits: 78,
    optionUnits: 12,
    electiveUnits: 30,
    courses: [
      // ── YEAR 1 ──
      {
        id: 'cisc121', code: 'CISC 121', name: 'Introduction to Computing Sci. I',
        units: 3, year: 1, position: 0, status: CourseStatus.COMPLETED,
      },
      {
        id: 'cisc124', code: 'CISC 124', name: 'Introduction to Computing Sci. II',
        units: 3, year: 1, position: 1, status: CourseStatus.COMPLETED,
      },
      {
        id: 'math110', code: 'MATH 110', name: 'Linear Algebra',
        units: 3, year: 1, position: 2, status: CourseStatus.COMPLETED,
      },
    
      // ── YEAR 2 ──
      {
        id: 'cisc203', code: 'CISC 203', name: 'Discrete Structures II',
        units: 3, year: 2, position: 0, status: CourseStatus.IN_PROGRESS,
      },
      {
        id: 'cisc235', code: 'CISC 235', name: 'Data Structures',
        units: 3, year: 2, position: 1, status: CourseStatus.REQUIRED,
      },
      {
        id: 'math212', code: 'MATH 212', name: 'Linear Algebra II',
        units: 3, year: 2, position: 2, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc221', code: 'CISC 221', name: 'Computer Architecture',
        units: 3, year: 2, position: 3, status: CourseStatus.REQUIRED,
      },
      {
        id: 'stat263', code: 'STAT 263', name: 'Intro to Mathematical Statistics',
        units: 3, year: 2, position: 4, status: CourseStatus.REQUIRED,
      },
    
      // ── YEAR 3 ──
      {
        id: 'cisc320', code: 'CISC 320', name: 'Introduction to Algorithms',
        units: 3, year: 3, position: 0, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc324', code: 'CISC 324', name: 'Operating Systems',
        units: 3, year: 3, position: 1, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc340', code: 'CISC 340', name: 'Computer Networks',
        units: 3, year: 3, position: 2, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc352', code: 'CISC 352', name: 'Artificial Intelligence',
        units: 3, year: 3, position: 3, status: CourseStatus.REQUIRED,
      },
      {
        id: 'math334', code: 'MATH 334', name: 'Numerical Methods',
        units: 3, year: 3, position: 4, status: CourseStatus.REQUIRED,
      },
    
      // ── YEAR 4 ──
      {
        id: 'cisc421', code: 'CISC 421', name: 'Machine Learning',
        units: 3, year: 4, position: 0, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc432', code: 'CISC 432', name: 'Advanced Database Systems',
        units: 3, year: 4, position: 1, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc455', code: 'CISC 455', name: 'Evolutionary Computation',
        units: 3, year: 4, position: 2, status: CourseStatus.REQUIRED,
      },
      {
        id: 'cisc499', code: 'CISC 499', name: 'Undergraduate Thesis',
        units: 6, year: 4, position: 3, status: CourseStatus.REQUIRED,
      },
    ],
    
    choices: [
      {
        id: 'math-choice-1', label: 'OR', year: 1, position: 3,
        status: CourseStatus.CHOICE, required: true,
        options: [
          {
            id: 'math120', code: 'MATH 120', name: 'Differential and Integral Calculus',
            units: 6, year: 1, position: 3, status: CourseStatus.CHOICE,
          },
          {
            id: 'math121', code: 'MATH 121', name: 'Integral Calculus',
            units: 3, year: 1, position: 3, status: CourseStatus.CHOICE,
          },
        ],
      },
      {
        id: 'cisc-elective-1', label: 'OR', year: 4, position: 4,
        status: CourseStatus.CHOICE, required: false,
        options: [
          {
            id: 'cisc440', code: 'CISC 440', name: 'Computer Graphics',
            units: 3, year: 4, position: 4, status: CourseStatus.CHOICE,
          },
          {
            id: 'cisc452', code: 'CISC 452', name: 'Neural & Genetic Computing',
            units: 3, year: 4, position: 4, status: CourseStatus.CHOICE,
          },
        ],
      },
    ],
    
    connections: [
      // Year 1 → 2
      { id: 'conn1', from: 'cisc121', to: 'cisc124', type: ConnectionType.PREREQUISITE },
      { id: 'conn2', from: 'cisc124', to: 'cisc203', type: ConnectionType.PREREQUISITE },
      { id: 'conn3', from: 'cisc124', to: 'cisc235', type: ConnectionType.PREREQUISITE },
      { id: 'conn4', from: 'math110', to: 'math212', type: ConnectionType.PREREQUISITE },
      { id: 'conn5', from: 'cisc124', to: 'cisc221', type: ConnectionType.PREREQUISITE },
    
      // Year 2 → 3
      { id: 'conn6', from: 'cisc235', to: 'cisc320', type: ConnectionType.PREREQUISITE },
      { id: 'conn7', from: 'cisc221', to: 'cisc324', type: ConnectionType.PREREQUISITE },
      { id: 'conn8', from: 'cisc203', to: 'cisc320', type: ConnectionType.PREREQUISITE },
      { id: 'conn9', from: 'stat263', to: 'cisc352', type: ConnectionType.PREREQUISITE },
      { id: 'conn10', from: 'math212', to: 'math334', type: ConnectionType.PREREQUISITE },
    
      // Year 3 → 4
      { id: 'conn11', from: 'cisc352', to: 'cisc421', type: ConnectionType.PREREQUISITE },
      { id: 'conn12', from: 'cisc320', to: 'cisc432', type: ConnectionType.PREREQUISITE },
      { id: 'conn13', from: 'cisc352', to: 'cisc455', type: ConnectionType.PREREQUISITE },
      { id: 'conn14', from: 'cisc320', to: 'cisc455', type: ConnectionType.PREREQUISITE },
      { id: 'conn15', from: 'math334', to: 'cisc421', type: ConnectionType.PREREQUISITE },
    ],
  };

  const { nodes: initialNodes, edges: initialEdges, yearSections } = useMemo(
    () => convertCoursePlanToFlow(coursePlan),
    []
  );

  const flowHeight = useMemo(() => {
    if (yearSections.length === 0) return 600;
    const last = yearSections[yearSections.length - 1];
    return last.y + last.height;
  }, [yearSections]);

  console.log('flowHeight:', flowHeight);
  console.log('yearSections:', yearSections);

  const [nodes] = useState(initialNodes);
  const [edges] = useState(initialEdges);

  return (
    <div className='min-h-screen flex flex-col gap-6 bg-white'>
      <div className="px-8">
        <div className="py-6 flex items-center gap-0">

          {/* Branding — left accent bar + title */}
          <div className="flex items-stretch gap-4 pr-10 border-r border-gray-200">
            <div className="w-1 rounded-full" style={{ background: COLOURS.blue }} />
            <div style={{ color: COLOURS.blue, fontFamily: "'Playfair Display', serif" }}>
              <div className="text-5xl font-black leading-none">Queen's</div>
              <div className="text-5xl font-semibold leading-tight">Course Planner</div>
            </div>
          </div>

          {/* Program info */}
          <div className="flex-1 px-8">
            <span className="text-2xl font-bold leading-tight" style={{ color: COLOURS.blue }}>
              {coursePlan.programName}
            </span>
            <p className="text-m text-gray-400 mt-0.5">{coursePlan.programCode}</p>
            <div className="flex items-center gap-3 mt-1.5 text-s text-gray-400">
              <span>Core: <span className="text-gray-600 font-medium">{coursePlan.coreUnits}u</span></span>
              <span className="text-gray-200">|</span>
              <span>Options: <span className="text-gray-600 font-medium">{coursePlan.optionUnits}u</span></span>
              <span className="text-gray-200">|</span>
              <span>Electives: <span className="text-gray-600 font-medium">{coursePlan.electiveUnits}u</span></span>
              <span className="text-gray-200">|</span>
              <span className="font-bold" style={{ color: COLOURS.blue }}>
                Total: {coursePlan.totalUnits}u
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="pl-8 border-l border-gray-200">
            <Legend />
          </div>
        </div>

        <div
          className="border border-gray-200 bg-white rounded-lg overflow-hidden relative"
          style={{ height: flowHeight }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET, y: 0, zoom: 1 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
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
      </div>

      <Footer />
    </div>
    
    
  );
}