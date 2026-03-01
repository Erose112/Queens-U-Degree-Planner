import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getBezierPath, Position } from '@xyflow/react';
import type { ConnectionType } from '../types';
import { COLOURS } from "../utils/colours";

export interface CourseEdgeData extends Record<string, unknown> {
  connectionType?: ConnectionType;
}

export function CourseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
}: EdgeProps<import('@xyflow/react').Edge<CourseEdgeData, 'courseEdge'>>) {

  const markerId = `arrow-${id}`;

  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    curvature: 0.1,
  });

  return (
    <>
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible',
          pointerEvents: 'none'
        }}
      >
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
              fill={COLOURS.black}
            />
          </marker>
        </defs>
      </svg>

      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke: COLOURS.black,
          strokeWidth: 1.5,
        }}
        markerEnd={`url(#${markerId})`}
      />
    </>
  );
}