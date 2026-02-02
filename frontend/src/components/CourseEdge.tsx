import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getSmoothStepPath, MarkerType } from '@xyflow/react';
import type { ConnectionType } from '../types';

export interface CourseEdgeData extends Record<string, unknown> {
  connectionType?: ConnectionType;
}

const strokeByType: Record<string, { stroke: string; strokeDasharray?: string }> = {
  prerequisite: { stroke: '#3b82f6' },
  corequisite: { stroke: '#8b5cf6', strokeDasharray: '5,5' },
  recommended: { stroke: '#6b7280', strokeDasharray: '3,3' },
};

export function CourseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps<import('@xyflow/react').Edge<CourseEdgeData, 'courseEdge'>>) {
  const connectionType = data?.connectionType ?? 'prerequisite';
  const pathOptions = strokeByType[connectionType] ?? strokeByType.prerequisite;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={MarkerType.ArrowClosed}
      style={{ ...style, ...pathOptions }}
    />
  );
}
