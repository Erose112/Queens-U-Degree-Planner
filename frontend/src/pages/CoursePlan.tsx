import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
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

import { CourseNode } from '../components/courseplan/CourseNode';
import { CourseEdge } from '../components/courseplan/CourseEdge';
import { Legend } from '../components/courseplan/Legend';
import { YearSideBar } from '../components/courseplan/YearSideBar';
import { YEAR_BAR_WIDTH, YEAR_BAR_COURSE_OFFSET } from '../utils/coursePlanLayout';
import { convertCoursePlanToFlow } from '../utils/coursePlanConverter';
import type { CoursePlan, YearSection } from '../types';
import { CourseStatus } from '../types';
import { COLOURS } from '../utils/colours';
import Footer from '../components/Footer';

// TypeScript interfaces for API response data
interface CourseData {
  course_code?: string;
  title?: string;
  units?: number | null;
  year?: number | null;
  semester?: string | null;
  is_required?: boolean;
}

interface EdgeData {
  from_course?: string;
  to_course?: string;
}

interface PlanResponseData {
  program_name?: string;
  program_code?: string;
  total_units?: number;
  core_units?: number;
  option_units?: number;
  elective_units?: number;
  courses?: CourseData[];
  edges?: EdgeData[];
}


const nodeTypes: NodeTypes = {
  course: CourseNode,
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
  const navigate = useNavigate();
  const location = useLocation();
  const { programId, programName, completedCourses, favouriteCourses, interestedCourses } = (location.state ?? {}) as {
    programId?: number;
    programName?: string;
    completedCourses?: string[];
    favouriteCourses?: string[];
    interestedCourses?: string[];
  };

  const [coursePlan, setCoursePlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!programName) {
      navigate('/planner');
      return;
    }

    const fetchPlan = async () => {
      try {
        const payload = {
          program_name: programName,
          completedCourses: completedCourses ?? [],
          favouriteCourses: favouriteCourses ?? [],
          interestedCourses: interestedCourses ?? [],
        };
        console.log('Sending payload:', payload);
        
        const response = await fetch('http://localhost:8000/plans/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            program_name: programName,
            completedCourses: completedCourses ?? [],
            favouriteCourses: favouriteCourses ?? [],
            interestedCourses: interestedCourses ?? [],
          }),
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data: PlanResponseData = await response.json();
        console.log('RAW API RESPONSE:', JSON.stringify(data, null, 2));
        
        // Validate response structure
        if (!data.courses || !Array.isArray(data.courses)) {
          throw new Error('Invalid response: courses array missing');
        }
        if (!data.edges || !Array.isArray(data.edges)) {
          throw new Error('Invalid response: edges array missing');
        }

        // Group courses by year to assign positions
        const coursesByYear: Record<number, number> = {};

        const mappedCourses = data.courses.map((c: CourseData) => {
          if (!c.course_code) {
            console.error('Invalid course: missing course_code', c);
            throw new Error('Course missing course_code');
          }
          
          // Clamp year between 1 and 4
          const year = Math.min(Math.max(c.year ?? 1, 1), 4);
          if (coursesByYear[year] === undefined) coursesByYear[year] = 0;
          const position = coursesByYear[year]++;
          
          // Validate units is positive
          const units = c.units || 3;
          if (units <= 0) {
            console.warn(`Course ${c.course_code} has invalid units: ${units}, defaulting to 3`);
          }

          return {
            id: c.course_code,
            code: c.course_code,
            name: c.title ?? c.course_code,
            units: Math.max(units, 0.5),
            year,
            position,
            status:
              c.semester === 'Completed'
                ? CourseStatus.COMPLETED
                : c.is_required
                ? CourseStatus.REQUIRED
                : CourseStatus.AVAILABLE,
          };
        });

        const mappedConnections = data.edges.map((e: EdgeData) => {
          if (!e.from_course || !e.to_course) {
            console.warn('Invalid edge missing from_course or to_course', e);
            return null;
          }
          return {
            id: `${e.from_course}-${e.to_course}`,
            from_course: e.from_course,
            to_course: e.to_course,
          };
        }).filter((e) => e !== null);

        setCoursePlan({
          id: String(programId),
          programName: data.program_name ?? 'Unknown Program',
          programCode: data.program_code ?? 'UNKNOWN',
          totalUnits: data.total_units ?? 0,
          coreUnits: data.core_units ?? 0,
          optionUnits: data.option_units ?? 0,
          electiveUnits: data.elective_units ?? 0,
          courses: mappedCourses,
          connections: mappedConnections as any,
        });
      } catch (err: any) {
        setError(err.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [programName, completedCourses, favouriteCourses, interestedCourses, navigate]);

  const { nodes: initialNodes, edges: initialEdges, yearSections } = useMemo(
    () => coursePlan ? convertCoursePlanToFlow(coursePlan) : { nodes: [], edges: [], yearSections: [] },
    [coursePlan]
  );

  const flowHeight = useMemo(() => {
    if (yearSections.length === 0) return 600;
    const last = yearSections[yearSections.length - 1];
    return last.y + last.height;
  }, [yearSections]);

  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges]);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const visibleEdges = useMemo(() => {
    if (!hoveredNodeId) return edges;
    return edges.map(edge => ({
      ...edge,
      style: {
        ...edge.style,
        opacity: edge.source === hoveredNodeId || edge.target === hoveredNodeId ? 1 : 0.05,
      },
      zIndex: edge.source === hoveredNodeId || edge.target === hoveredNodeId ? 10 : 0,
    }));
  }, [edges, hoveredNodeId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400 text-lg">Generating your plan...</p>
    </div>
  );

  if (error || !coursePlan) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-red-400 text-lg">Error: {error ?? 'No plan data found.'}</p>
    </div>
  );

  return (
    <div className='min-h-screen flex flex-col gap-6' style={{ background: COLOURS.warmWhite }}>
      <div className="px-8">
        <div className="py-6 flex items-center gap-0">

          <div className="flex items-stretch gap-4 pr-10 border-r border-gray-200">
            <div className="w-1 rounded-full" style={{ background: COLOURS.blue }} />
            <div>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 mb-1 text-xs font-medium tracking-wide cursor-pointer bg-transparent border-none p-0 transition-opacity opacity-50 hover:opacity-100"
                style={{ color: COLOURS.blue }}
              >
                ⬅ Back to Planner
              </button>
              <div style={{ color: COLOURS.blue, fontFamily: "'Playfair Display', serif" }}>
                <div className="text-5xl font-black leading-none">Queen's</div>
                <div className="text-5xl font-semibold leading-tight">Degree Planner</div>
              </div>
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
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}  
            defaultViewport={{ x: YEAR_BAR_WIDTH + YEAR_BAR_COURSE_OFFSET, y: 0, zoom: 1 }}
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
      </div>

      <Footer />
    </div>
  );
}