import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseChoiceNodeData } from '../types';

export const CourseChoiceNode = memo(({ data }: NodeProps<import('@xyflow/react').Node<CourseChoiceNodeData, 'courseChoice'>>) => {
  const { choice } = data;

  return (
    <div className="course-choice-node">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-purple-500 !border-2 !border-white"
      />

      <div className="flex flex-col items-center gap-2">
        {choice.options.map((course, index) => (
          <div key={course.id} className="flex flex-col items-center">
            <div className="w-36 min-h-[72px] p-2.5 rounded-md border-2 bg-orange-500 text-white border-orange-600 cursor-pointer hover:shadow-lg transition-all">
              <div className="font-bold text-xs mb-0.5">{course.code}</div>
              <div className="text-[10px] leading-tight">{course.name}</div>
            </div>

            {index < choice.options.length - 1 && (
              <div className="my-1">
                <div className="text-xs font-bold text-gray-700 bg-gray-200 px-2 py-0.5 rounded-full border border-gray-400">
                  {choice.label}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-purple-500 !border-2 !border-white"
      />
    </div>
  );
});

CourseChoiceNode.displayName = 'CourseChoiceNode';