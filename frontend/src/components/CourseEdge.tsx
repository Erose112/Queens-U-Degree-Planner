import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getBezierPath, Position } from '@xyflow/react';
import type { ConnectionType } from '../types';

export interface CourseEdgeData extends Record<string, unknown> {
  connectionType?: ConnectionType;
}

const strokeByType: Record<string, { stroke: string; strokeDasharray?: string }> = {
  prerequisite: { stroke: '#3b82f6' },
  corequisite: { stroke: '#8b5cf6', strokeDasharray: '5,5' },
  recommended: { stroke: '#6b7280', strokeDasharray: '3,3' },
};

// Unique marker ID per connection type so each gets the right color
const markerByType: Record<string, string> = {
  prerequisite: 'arrow-prerequisite',
  corequisite: 'arrow-corequisite',
  recommended: 'arrow-recommended',
};

const markerColors: Record<string, string> = {
  prerequisite: '#3b82f6',
  corequisite: '#8b5cf6',
  recommended: '#6b7280',
};

export function CourseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps<import('@xyflow/react').Edge<CourseEdgeData, 'courseEdge'>>) {
  const connectionType = data?.connectionType ?? 'prerequisite';
  const pathOptions = strokeByType[connectionType] ?? strokeByType.prerequisite;
  const markerId = markerByType[connectionType] ?? markerByType.prerequisite;
  const markerColor = markerColors[connectionType] ?? markerColors.prerequisite;

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    curvature: 0.1, // lower = more curved away from nodes
  });

  return (
    <>
      {/* Define the arrow marker in SVG defs — one per connection type */}
      <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
        <marker
          id={markerId}
          markerWidth="4"
          markerHeight="4"
          viewBox="0 0 10 10"
          markerUnits="strokeWidth"
          orient="auto"
          refX="8"
          refY="5"
        >
          <polygon
            points="0,0 10,5 0,10"
            fill={markerColor}
            stroke="none"
          />
        </marker>
        </defs>
      </svg>

      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          ...pathOptions,
          strokeWidth: 1.5,
        }}
        markerEnd={`url(#${markerId})`}
      />
    </>
  );
}