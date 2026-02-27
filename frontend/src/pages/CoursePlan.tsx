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
import { convertCoursePlanToFlow } from '../utils/coursePlanConverter';
import type { CoursePlan, YearSection } from '../types';
import { CourseStatus, ConnectionType } from '../types';

import queensLogo from '../assets/Queens-U-Logo.png';

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
      {
        id: 'cisc121',
        code: 'CISC 121',
        name: 'Introduction to Computing Sci. I',
        units: 3,
        year: 1,
        position: 0,
        status: CourseStatus.COMPLETED,
      },
      {
        id: 'cisc124',
        code: 'CISC 124',
        name: 'Introduction to Computing Sci. II',
        units: 3,
        year: 1,
        position: 1,
        status: CourseStatus.COMPLETED,
      },
      {
        id: 'math110',
        code: 'MATH 110',
        name: 'Linear Algebra',
        units: 3,
        year: 1,
        position: 2,
        status: CourseStatus.COMPLETED,
      },
      {
        id: 'cisc203',
        code: 'CISC 203',
        name: 'Discrete Structures II',
        units: 3,
        year: 2,
        position: 0,
        status: CourseStatus.IN_PROGRESS,
      },
      {
        id: 'cisc235',
        code: 'CISC 235',
        name: 'Data Structures',
        units: 3,
        year: 2,
        position: 1,
        status: CourseStatus.REQUIRED,
      },
      {
        id: 'math212',
        code: 'MATH 212',
        name: 'Linear Algebra II',
        units: 3,
        year: 2,
        position: 2,
        status: CourseStatus.REQUIRED,
      },
    ],
    choices: [
      {
        id: 'math-choice-1',
        label: 'OR',
        year: 1,
        position: 3,
        status: CourseStatus.CHOICE,
        required: true,
        options: [
          {
            id: 'math120',
            code: 'MATH 120',
            name: 'Differential and Integral Calculus',
            units: 6,
            year: 1,
            position: 3,
            status: CourseStatus.CHOICE,
          },
          {
            id: 'math121',
            code: 'MATH 121',
            name: 'Integral Calculus',
            units: 3,
            year: 1,
            position: 3,
            status: CourseStatus.CHOICE,
          },
        ],
      },
    ],
    connections: [
      {
        id: 'conn1',
        from: 'cisc121',
        to: 'cisc124',
        type: ConnectionType.PREREQUISITE,
      },
      {
        id: 'conn2',
        from: 'cisc124',
        to: 'cisc203',
        type: ConnectionType.PREREQUISITE,
      },
      {
        id: 'conn3',
        from: 'cisc124',
        to: 'cisc235',
        type: ConnectionType.PREREQUISITE,
      },
      {
        id: 'conn4',
        from: 'math110',
        to: 'math212',
        type: ConnectionType.PREREQUISITE,
      },
    ],
  };

  const { nodes: initialNodes, edges: initialEdges, yearSections } = useMemo(
    () => convertCoursePlanToFlow(coursePlan),
    []
  );

  const [nodes] = useState(initialNodes);
  const [edges] = useState(initialEdges);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      <div className='grid grid-cols-10 gap-20'>

        <img className='col-span-3 w-full h-auto p-4' src = {queensLogo} alt="Queen's University" ></img>

        {/* Program header */}
        <div className="col-span-4 mb-4">
            <h1 className="text-xl font-bold text-gray-900">{coursePlan.programName}</h1>
            <p className="text-sm text-gray-500">{coursePlan.programCode}</p>
            <div className="flex gap-4 mt-1 text-xs text-gray-500">
            <span>Core: {coursePlan.coreUnits}u</span>
            <span>Options: {coursePlan.optionUnits}u</span>
            <span>Electives: {coursePlan.electiveUnits}u</span>
            <span className="font-semibold text-gray-700">Total: {coursePlan.totalUnits}u</span>
            </div>
        </div>

        <div className='col-span-3'>
            <Legend />
        </div>
        
      </div>

      <div
        className="mt-4 border border-gray-200 bg-white rounded-lg overflow-hidden relative"
        style={{ height: 600 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.1}
          maxZoom={2}
        >
          <NodeInternalsUpdater />
          <Background color="#f3f4f6" gap={16} />
          <ChartInner yearSections={yearSections} />
        </ReactFlow>
      </div>
    </div>
  );
}