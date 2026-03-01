import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseNodeData } from '../types';
import { CourseStatus } from '../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../utils/coursePlanLayout';
import { COLOURS } from "../utils/colours";

export const CourseNode = memo(({ data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { course } = data;

  const isCompleted = course.status === CourseStatus.COMPLETED;
  const isChoice = course.status === CourseStatus.CHOICE;

  const handleStyle = { width: 6, height: 6 };

  const borderColour = isCompleted
    ? COLOURS.brightBlue
    : isChoice
      ? COLOURS.yellow
      : COLOURS.red;

  console.log(course.code, 'incoming:', data.incomingIds, 'outgoing:', data.outgoingIds);

  return (
    <div
      className="course-node"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, position: 'relative', boxSizing: 'border-box' }}
    >
    {data.incomingIds.map((fromId, i) => (
      <Handle
        key={`target-${fromId}`}
        id={`target-${fromId}`}
        type="target"
        position={Position.Top}
        style={{ 
          left: `${((i + 1) / (data.incomingIds.length + 1)) * 100}%`,
          ...handleStyle,
        }}
      />
    ))}

      <div
        className="p-1.5 rounded-md bg-white border-2 text-black cursor-default"
        style={{ 
          width: NODE_WIDTH, 
          height: NODE_HEIGHT, 
          boxSizing: 'border-box',
          borderColor: borderColour,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div className="font-bold text-[18px] mb-0.3">{course.code}</div>
        <div className="text-[16px] leading-tight">{course.name}</div>
      </div>

      <Handle
        id="source"
        type="source"
        position={Position.Bottom}
        style={{ 
          left: '50%', ...handleStyle,
          visibility: data.outgoingIds.length === 0 ? 'hidden' : 'visible'
        }}
      />
    </div>
  );
});