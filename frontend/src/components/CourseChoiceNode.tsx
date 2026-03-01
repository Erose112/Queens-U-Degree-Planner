import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseChoiceNodeData } from '../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../utils/coursePlanLayout';
import { COLOURS } from "../utils/colours";



export const CourseChoiceNode = memo(({ data }: NodeProps<import('@xyflow/react').Node<CourseChoiceNodeData, 'courseChoice'>>) => {
  const { choice, incomingIds, outgoingIds } = data;

  return (
    <div style={{ position: 'relative' }}>
      {/* Target handles — one per incoming edge */}
      {(incomingIds ?? []).map((fromId, i) => (
        <Handle
          key={`target-${fromId}`}
          id={`target-${fromId}`}
          type="target"
          position={Position.Top}
          style={{ left: `${((i + 1) / ((incomingIds?.length ?? 0) + 1)) * 100}%` }}
        />
      ))}

      <div className="flex flex-col items-center">
        <div className='border-2 border-dashed rounded-xl p-1 flex flex-col items-center'
        style = {{
          borderColor: `${COLOURS.yellow}70`,
        }}
        >
          {choice.options.map((option, index) => (
            <div key={option.id} className="flex flex-col items-center">
              {/* Each option gets its own status-based colour */}
              <div
                className={`p-1.5 rounded-md border-2 cursor-default`}
                style={{ 
                  width: NODE_WIDTH, 
                  height: NODE_HEIGHT, 
                  boxSizing: 'border-box',
                  borderColor: COLOURS.yellow
                }}
              >
                <div className="font-bold text-[10px] mb-0.3">{option.code}</div>
                <div className="text-[8px] leading-tight">{option.name}</div>
              </div>

              {/* OR / AND label between options */}
              {index < choice.options.length - 1 && (
                <div className="my-1">
                  <div className="text-[8px] font-bold text-black px-1 py-0.5">
                    {choice.label}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Source handles — one per outgoing edge */}
      {(outgoingIds ?? []).map((toId, i) => (
        <Handle
          key={`source-${toId}`}
          id={`source-${toId}`}
          type="source"
          position={Position.Bottom}
          style={{ left: `${((i + 1) / ((outgoingIds?.length ?? 0) + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
});

CourseChoiceNode.displayName = 'CourseChoiceNode';