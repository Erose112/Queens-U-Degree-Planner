import { memo, useMemo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import type { CourseChoiceNodeData } from '../../types';
import { NODE_WIDTH, NODE_HEIGHT } from '../../utils/coursePlanLayout';
import { COLOURS } from "../../utils/colours";


export const CourseChoiceNode = memo(({ data }: NodeProps<import('@xyflow/react').Node<CourseChoiceNodeData, 'courseChoice'>>) => {
  const { choice, incomingIds, outgoingIds } = data;
  const handleStyle = {
    width: 3,
    height: 3,
  };

  // Calculate grid dimensions: fill one row at a time
  // For 2 options: 2x1, 3-4: 2x2, 5-6: 3x2, 7-9: 3x3, etc.
  const numOptions = choice.options.length;
  const gridCols = Math.ceil(Math.sqrt(numOptions));
  const gridRows = Math.ceil(numOptions / gridCols);

  // Create grid of options
  const gridOptions = useMemo(() => {
    const grid: (typeof choice.options | null)[][] = [];
    for (let row = 0; row < gridRows; row++) {
      grid[row] = [];
      for (let col = 0; col < gridCols; col++) {
        const idx = row * gridCols + col;
        grid[row][col] = idx < numOptions ? choice.options[idx] : null;
      }
    }
    return grid;
  }, [choice.options, gridCols, gridRows, numOptions]);

  const gridWidth = gridCols * (NODE_WIDTH + 10);
  const gridHeight = gridRows * (NODE_HEIGHT + 10) + (gridRows - 1) * 20; // 20px for OR labels

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

      <div
        className='rounded-xl p-2'
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg width='100%25' height='100%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' rx='12' ry='12' stroke='${encodeURIComponent(COLOURS.yellow)}' stroke-width='3' stroke-dasharray='8%2c 10' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e")`,
          width: gridWidth,
          display: 'inline-block',
        }}
      >
        {/* Render grid rows */}
        {gridOptions.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} style={{ display: 'flex', gap: '10px', marginBottom: rowIdx < gridRows - 1 ? '20px' : '0' }}>
            {row.map((option, colIdx) =>
              option ? (
                <div key={option.id}>
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
                </div>
              ) : (
                <div key={`empty-${colIdx}`} style={{ width: NODE_WIDTH, height: NODE_HEIGHT }} />
              )
            )}
          </div>
        ))}

        {/* Render OR labels between rows */}
        {gridRows > 1 && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              top: NODE_HEIGHT + 15,
              fontSize: '15px',
              fontWeight: 'bold',
              color: 'black',
              backgroundColor: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              zIndex: 10,
            }}
          >
            {choice.label}
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
          ...(outgoingIds.length === 0 ? { display: 'none' } : {})
        }}
      />
    </div>
  );
});