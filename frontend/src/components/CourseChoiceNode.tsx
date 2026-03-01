import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseChoiceNodeData } from '../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../utils/coursePlanLayout';
import { COLOURS } from "../utils/colours";


export const CourseChoiceNode = memo(({ data }: NodeProps<import('@xyflow/react').Node<CourseChoiceNodeData, 'courseChoice'>>) => {
  const { choice, incomingIds, outgoingIds } = data;
  const handleStyle = {
    width: 3,
    height: 3,
  };

  return (
    <div style={{ position: 'relative' }}>
      <Handle
        id="target"
        type="target"
        position={Position.Top}
        style={{ 
          left: '50%',
          ...handleStyle,
          ...(incomingIds.length === 0 ? { display: 'none' } : {})
        }}
      />

      <div className="flex flex-col items-center">
        <div
          className='rounded-xl p-2 flex flex-col items-center'
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='${encodeURIComponent(COLOURS.yellow)}' stroke-width='3' stroke-dasharray='8%2c 10' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
          }}
        >
          {choice.options.map((option, index) => (
            <div key={option.id} className="flex flex-col items-center">
              <div
                className="p-1.5 rounded-md border-2 cursor-default"
                style={{ 
                  width: NODE_WIDTH, 
                  height: NODE_HEIGHT, 
                  boxSizing: 'border-box',
                  borderColor: COLOURS.yellow,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                }}
              >
                <div className="font-bold text-[18px] mb-0.3">{option.code}</div>
                <div className="text-[15px] leading-tight">{option.name}</div>
              </div>

              {index < choice.options.length - 1 && (
                <div className="my-1">
                  <div className="text-[15px] font-bold text-black px-1 py-0.5">
                    {choice.label}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Handle
        id="source"
        type="source"
        position={Position.Bottom}
        style={{ 
          left: '50%',
          ...handleStyle,
          ...(outgoingIds.length === 0 ? { display: 'none' } : {})
        }}
      />
    </div>
  );
});