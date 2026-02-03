import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { YearHeaderNodeData } from '../types';

export const YearHeaderNode = memo(({ data }: NodeProps<Node<YearHeaderNodeData, 'yearHeader'>>) => {
  const year = (data as YearHeaderNodeData).year;
  return (
    <div className="year-header-node">
      <div className="w-36 text-center py-2 px-4 bg-gray-100 border-2 border-gray-300 rounded-md font-bold text-sm text-gray-800">
        YEAR {year}
      </div>
    </div>
  );
});

YearHeaderNode.displayName = 'YearHeaderNode';