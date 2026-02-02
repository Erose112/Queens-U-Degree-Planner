import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { YearBarNodeData } from '../types';
import { YEAR_BAR_WIDTH } from '../utils/coursePlanLayout';

export const YearBarNode = memo(({ data }: NodeProps<Node<YearBarNodeData, 'yearBar'>>) => {
  const { year, height } = data as YearBarNodeData;
  return (
    <div
      className="year-bar-node flex items-center justify-center border-r-2 border-gray-400 bg-gray-200 select-none shrink-0"
      style={{
        width: YEAR_BAR_WIDTH,
        height: height,
        minHeight: height,
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
      }}
    >
      <span className="font-bold text-sm text-gray-800 tracking-wide whitespace-nowrap">
        YEAR {year}
      </span>
    </div>
  );
});

YearBarNode.displayName = 'YearBarNode';

export { YEAR_BAR_WIDTH };
