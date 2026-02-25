import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseNodeData } from '../types';
import { CourseStatus } from '../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../utils/coursePlanLayout';

export const CourseNode = memo(({ data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { course, incomingIds, outgoingIds } = data;

  const isCompleted = course.status === CourseStatus.COMPLETED;
  const isInProgress = course.status === CourseStatus.IN_PROGRESS;
  const isChoice = course.status === CourseStatus.CHOICE;

  const borderColor = isCompleted
    ? 'bg-green-600 border-green-700'
    : isInProgress
      ? 'bg-amber-500 border-amber-600'
      : isChoice
        ? 'bg-orange-500 border-orange-600'
        : 'bg-blue-600 border-blue-700';

  return (
    <div
      className="course-node"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, position: 'relative', boxSizing: 'border-box' }}
    >
      {/* One target handle per incoming edge, evenly spaced along the top */}
      {incomingIds.map((fromId, i) => (
        <Handle
          key={`target-${fromId}`}
          id={`target-${fromId}`}
          type="target"
          position={Position.Top}
          style={{ left: `${((i + 1) / (incomingIds.length + 1)) * 100}%` }}
        />
      ))}

      <div
        className={`p-1.5 rounded-md bg-white border-2 text-black border-${borderColor} cursor-default`}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT, boxSizing: 'border-box' }}
      >
        <div className="font-bold text-[10px] mb-0.3">{course.code}</div>
        <div className="text-[8px] leading-tight">{course.name}</div>
      </div>

      {/* One source handle per outgoing edge, evenly spaced along the bottom */}
      {outgoingIds.map((toId, i) => (
        <Handle
          key={`source-${toId}`}
          id={`source-${toId}`}
          type="source"
          position={Position.Bottom}
          style={{ left: `${((i + 1) / (outgoingIds.length + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});

CourseNode.displayName = 'CourseNode';