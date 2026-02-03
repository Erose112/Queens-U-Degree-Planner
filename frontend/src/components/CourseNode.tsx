import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseNodeData } from '../types';
import { CourseStatus } from '../types';

export const CourseNode = memo(({ data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { course } = data;
  const isCompleted = course.status === CourseStatus.COMPLETED;
  const isInProgress = course.status === CourseStatus.IN_PROGRESS;
  const isChoice = course.status === CourseStatus.CHOICE;

  const bgColor = isCompleted
    ? 'bg-green-600 border-green-700'
    : isInProgress
      ? 'bg-amber-500 border-amber-600'
      : isChoice
        ? 'bg-orange-500 border-orange-600'
        : 'bg-blue-600 border-blue-700';

  return (
    <div className="course-node">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-gray-600 !border-2 !border-white"
      />
      <div
        className={`w-36 min-h-[72px] p-2.5 rounded-md border-2 text-white ${bgColor} cursor-default`}
      >
        <div className="font-bold text-xs mb-0.5">{course.code}</div>
        <div className="text-[10px] leading-tight">{course.name}</div>
        <div className="text-[10px] mt-1 opacity-90">{course.units}u</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-gray-600 !border-2 !border-white"
      />
    </div>
  );
});

CourseNode.displayName = 'CourseNode';
