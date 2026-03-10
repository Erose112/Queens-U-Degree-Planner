import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseNodeData } from '../../types';
import { CourseStatus } from '../../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../../utils/coursePlanLayout';
import { COLOURS } from "../../utils/colours";

export const CourseNode = memo(({ data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { course } = data;

  const isCompleted = course.status === CourseStatus.COMPLETED;
  const isRequired  = course.status === CourseStatus.REQUIRED;
  const isChoice    = course.status === CourseStatus.CHOICE;

  const borderColour = isCompleted
    ? COLOURS.brightBlue
    : isRequired
      ? COLOURS.red
      : isChoice
        ? COLOURS.yellow
        : COLOURS.green;

  const handleStyle = { width: 6, height: 6 };
  const hasIncoming = data.incomingIds.length > 0;
  const hasOutgoing = data.outgoingIds.length > 0;

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
            visibility: hasIncoming ? 'visible' : 'hidden',
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
          boxShadow: isChoice
            ? `0 2px 8px rgba(0,0,0,0.08), inset 0 0 0 1px ${COLOURS.yellow}22`
            : '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div className="font-bold text-[18px] mb-0.3">{course.code}</div>
        <div className="text-[16px] leading-tight">{course.name}</div>
        {isChoice && (
          <div
            className="absolute top-1.5 right-1.5 text-[10px] font-semibold px-1 py-0.5 rounded"
            style={{ background: COLOURS.yellow, color: '#000', opacity: 0.85 }}
          >
            ELECTIVE
          </div>
        )}
      </div>

      <Handle
        id="source"
        type="source"
        position={Position.Bottom}
        style={{
          left: '50%',
          ...handleStyle,
          visibility: hasOutgoing ? 'visible' : 'hidden',
        }}
      />
    </div>
  );
});