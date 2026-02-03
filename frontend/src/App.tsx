import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css'

import { useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CourseNode } from './components/CourseNode';
import { CourseChoiceNode } from './components/CourseChoiceNode';
import { YearBarNode } from './components/YearBarNode';
import { CourseEdge } from './components/CourseEdge';
import { Legend } from './components/Legend';
import { convertCoursePlanToFlow } from './utils/coursePlanConverter';
import type { CoursePlan } from './types';
import { CourseStatus, ConnectionType } from './types';

// Define node and edge types
const nodeTypes: NodeTypes = {
  course: CourseNode,
  courseChoice: CourseChoiceNode,
  yearBar: YearBarNode,
};

const edgeTypes: EdgeTypes = {
  courseEdge: CourseEdge,
};

export default function App() {
  //////////////////////////////////////////////////////////////////////////////////////////////////
  // Example data - replace this with data from your backend
  //////////////////////////////////////////////////////////////////////////////////////////////////
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

  // Convert to React Flow format
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => convertCoursePlanToFlow(coursePlan),
    [coursePlan]
  );

  const [nodes] = useState(initialNodes);
  const [edges] = useState(initialEdges);

  //Return the React Flow component
  //This is the main component that renders the course plan.
  //It should be moved to a separate file in the future.
  //And should be changed to a static image.
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background color="#e5e7eb" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'yearBar') return '#e5e7eb';
            if (node.type === 'courseChoice') return '#f97316';
            return '#3b82f6';
          }}
          maskColor="rgba(255, 255, 255, 0.6)"
        />

        {/* Program Info Panel */}
        <Panel position="top-left" className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">{coursePlan.programName}</h1>
          <p className="text-xs text-gray-600 mb-2">{coursePlan.programCode}</p>
          <div className="flex gap-3 text-[10px] text-gray-600">
            <span>Core: {coursePlan.coreUnits}u</span>
            <span>Options: {coursePlan.optionUnits}u</span>
            <span>Electives: {coursePlan.electiveUnits}u</span>
          </div>
          <div className="mt-1 text-xs font-semibold text-gray-900">
            Total: {coursePlan.totalUnits} units
          </div>
        </Panel>

        {/* Legend Panel */}
        <Panel position="top-right">
          <Legend />
        </Panel>
      </ReactFlow>
    </div>
  );
}