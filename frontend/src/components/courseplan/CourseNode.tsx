import { memo, useRef, useEffect, useState } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position, useEdges } from '@xyflow/react';
import type { CourseNodeData } from '../../types/plan';
import { NODE_WIDTH, NODE_HEIGHT } from '../../utils/coursePlanLayout';
import { COLOURS } from '../../utils/colours';
import { formatCourseName } from '../../utils/formatNames';

function useFitText(text: string, maxSize: number, minSize: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = maxSize;
    el.style.fontSize = `${size}px`;
    while (el.scrollHeight > el.clientHeight && size > minSize) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [text, maxSize, minSize]);

  return { ref, fontSize };
}

export const CourseNode = memo(({ id, data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { graphNode } = data;
  const allEdges = useEdges();

  const isRequired = graphNode.node_type === 'required';
  const isChoice   = graphNode.node_type === 'choice';

  const borderColour = isRequired ? COLOURS.red : isChoice ? COLOURS.yellow : COLOURS.green;
  const handleStyle = { width: 6, height: 6 };

  const hasIncoming = allEdges.some(e => e.target === id);
  const hasOutgoing = allEdges.some(e => e.source === id);

  // Cluster handles in the centre third of the node
  const incomingIds = data.incomingIds;
  const count = incomingIds.length;
  const CLUSTER_WIDTH = NODE_WIDTH * 0.2; // handles span 20% of node width
  const clusterStart = 50 - (CLUSTER_WIDTH / NODE_WIDTH) * 50;

  const { ref: titleRef, fontSize: titleSize } = useFitText(graphNode.course_code, 18, 10);
  const { ref: subtitleRef, fontSize: subtitleSize } = useFitText(graphNode.title ?? '', 16, 9);

  return (
    <div
      className="course-node"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, position: 'relative', boxSizing: 'border-box' }}
    >
      {hasIncoming && incomingIds.map((fromId, i) => (
        <Handle
          key={`target-${String(fromId)}`}
          id={`target-${String(fromId)}`}
          type="target"
          position={Position.Top}
          style={{
            left: count === 1
              ? '50%'
              : `${clusterStart + (i / (count - 1)) * (CLUSTER_WIDTH / NODE_WIDTH) * 100}%`,
            ...handleStyle,
          }}
        />
      ))}

      <div
        className="p-1.5 rounded-md bg-white border-2 text-black cursor-default flex flex-col"
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
        <div
          ref={titleRef}
          className="font-bold mb-0.5 overflow-hidden"
          style={{ fontSize: titleSize, flexShrink: 0 }}
        >
          {formatCourseName(graphNode.course_code)}
        </div>
        <div
          ref={subtitleRef}
          className="leading-tight overflow-hidden flex-1"
          style={{ fontSize: subtitleSize }}
        >
          {graphNode.title ?? ''}
        </div>
      </div>

      {/* Only render when there are actual outgoing edges */}
      {hasOutgoing && (
        <Handle
          id="source"
          type="source"
          position={Position.Bottom}
          style={{ left: '50%', ...handleStyle }}
        />
      )}
    </div>
  );
});