import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  useNodes,
  useUpdateNodeInternals,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

import { CourseNode } from './CourseNode';
import { CourseEdge } from './CourseEdge';
import { YearSideBar } from './YearSideBar';
import { YEAR_BAR_WIDTH, YEAR_BAR_COURSE_OFFSET } from '../../utils/coursePlanLayout';
import { COLOURS } from '../../utils/colours';
import type { YearSection } from '../../types/plan';

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

interface CoursePlanChartProps {
  nodes: Node[];
  edges: Edge[];
  yearSections: YearSection[];
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  flowHeight: number;
  programNames: string;
}

export function CoursePlanChart({
  nodes,
  edges,
  yearSections,
  onNodesChange,
  onEdgesChange,
  onDrop,
  flowHeight,
  programNames,
}: CoursePlanChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [lockedNodeId, setLockedNodeId]   = useState<string | null>(null);
  const [exporting, setExporting]         = useState(false);

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

  const handleNodeMouseEnter: NodeMouseHandler = (_, node) => {
    if (!lockedNodeId) setHoveredNodeId(node.id);
  };

  const handleNodeMouseLeave = () => {
    if (!lockedNodeId) setHoveredNodeId(null);
  };

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    setLockedNodeId(prev => (prev === node.id ? null : node.id));
  };

  const handlePaneClick = () => {
    setLockedNodeId(null);
    setHoveredNodeId(null);
  };

  const handleSavePdf = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(chartRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });

      const img = new Image();
      img.src = dataUrl;
      await new Promise(resolve => { img.onload = resolve; });

      const pdf = new jsPDF({
        orientation: img.width > img.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [img.width / 2, img.height / 2],
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, img.width / 2, img.height / 2);
      pdf.save(`${programNames}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      ref={chartRef}
      className="w-[73%] border border-gray-300 bg-white rounded-lg overflow-hidden relative"
      style={{ height: flowHeight }}
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
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
        proOptions={{ hideAttribution: true }}
      >
        <NodeInternalsUpdater />
        <Background color="#f3f4f6" gap={16} />
        <ChartInner yearSections={yearSections} />
      </ReactFlow>

      <div className="absolute bottom-0 right-0">
        <button
          onClick={handleSavePdf}
          disabled={exporting}
          className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          style={{ color: COLOURS.blue }}
        >
          {exporting ? 'Exporting...' : 'Save as PDF'}
        </button>
      </div>
    </div>
  );
}