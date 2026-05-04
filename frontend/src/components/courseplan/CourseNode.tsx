import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Node, NodeProps } from '@xyflow/react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import type { CourseNodeData } from '../../types/plan';
import { NODE_WIDTH, NODE_HEIGHT, POPOVER_OFFSET, POPOVER_WIDTH } from '../../utils/coursePlanLayout';
import { COLOURS } from '../../utils/colours';
import { formatCourseName } from '../../utils/program';

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

const HANDLE_BASE: React.CSSProperties = {
  width: 6,
  height: 6,
  opacity: 0,
  pointerEvents: 'none',
};
const SOURCE_HANDLE: React.CSSProperties = {
  ...HANDLE_BASE,
  transform: 'translateX(-50%)',
};

interface DescriptionPopoverProps {
  description: string;
  borderColour: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

function DescriptionPopover({ description, borderColour, anchorRef, onClose }: DescriptionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const btn = anchorRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setCoords({
      top:  rect.top + window.scrollY,
      left: rect.right + window.scrollX + POPOVER_OFFSET,
    });
  }, [anchorRef]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current?.contains(e.target as Element) ||
        anchorRef.current?.contains(e.target as Element)
      ) return;
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [anchorRef, onClose]);

  if (!coords) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        top: coords.top,
        left: coords.left,
        width: POPOVER_WIDTH,
        background: '#fff',
        border: `1.5px solid ${borderColour}`,
        borderRadius: 8,
        padding: '8px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 9999,
        pointerEvents: 'all',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 10,
        left: -6,
        width: 0,
        height: 0,
        borderTop: '5px solid transparent',
        borderBottom: '5px solid transparent',
        borderRight: `6px solid ${borderColour}`,
      }} />
      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: '#333' }}>
        {description}
      </p>
    </div>,
    document.body,
  );
}

export const CourseNode = memo(({ id, data }: NodeProps<Node<CourseNodeData, 'course'>>) => {
  const { course } = data;

  const isRequired = course.node_type === 'required';
  const isChoice   = course.node_type === 'choice';
  const borderColour = isRequired ? COLOURS.red : isChoice ? COLOURS.yellow : COLOURS.green;

  const incomingIds = [...new Set(data.incomingIds)];
  const hasIncoming = incomingIds.length > 0;
  const hasOutgoing = data.outgoingIds.length > 0;

  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, incomingIds.join(','), hasOutgoing]);

  const [isHovered, setIsHovered] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDescription(prev => !prev);
  }, []);

  const handleInfoMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const closePopover = useCallback(() => setShowDescription(false), []);

  // When the node is no longer hovered and the popover is not open,
  // there's nothing to clean up. But if the user moves off the node
  // while the popover is open we keep the popover alive — they can
  // still interact with it. It closes via the outside-click handler.
  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  const count         = incomingIds.length;
  const CLUSTER_WIDTH = NODE_WIDTH * 0.2;
  const clusterStart  = 50 - (CLUSTER_WIDTH / NODE_WIDTH) * 50;

  const { ref: titleRef,    fontSize: titleSize    } = useFitText(course.course_code, 18, 10);
  const { ref: subtitleRef, fontSize: subtitleSize } = useFitText(course.title ?? '', 16, 9);

  // The info button is visible when: the node is hovered OR the popover is
  // currently open (so the active button stays visible while reading the desc).
  const showInfoButton = course.description && (isHovered || showDescription);

  return (
    <div
      className="course-node"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT, position: 'relative', boxSizing: 'border-box' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
            ...HANDLE_BASE,
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
          position: 'relative',
        }}
      >
        {/* Button is always mounted when description exists so the ref is
            always valid for popover positioning, but visually hidden via
            opacity + pointer-events when not hovered/active. This avoids a
            flash of the popover recalculating its anchor position on mount. */}
        {course.description && (
          <button
            ref={infoButtonRef}
            onClick={handleInfoClick}
            onMouseDown={handleInfoMouseDown}
            style={{
              position: 'absolute',
              top: 5,
              right: 5,
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `1px solid ${borderColour}`,
              background: showDescription ? borderColour : 'transparent',
              color: showDescription ? '#fff' : borderColour,
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              zIndex: 1,
              // Fade in/out rather than mount/unmount so the ref's DOM node
              // is always available for popover anchor calculation.
              opacity: showInfoButton ? 1 : 0,
              pointerEvents: showInfoButton ? 'all' : 'none',
              transition: 'opacity 0.15s, background 0.15s, color 0.15s',
            }}
            title="Course description"
          >
            i
          </button>
        )}

        <div
          ref={titleRef}
          className="font-bold mb-0.5 overflow-hidden"
          style={{ fontSize: titleSize, flexShrink: 0, paddingRight: course.description ? 18 : 0 }}
        >
          {formatCourseName(course.course_code)}
        </div>
        <div
          ref={subtitleRef}
          className="leading-tight overflow-hidden flex-1"
          style={{ fontSize: subtitleSize }}
        >
          {course.title ?? ''}
        </div>
      </div>

      {showDescription && course.description && (
        <DescriptionPopover
          description={course.description}
          borderColour={borderColour}
          anchorRef={infoButtonRef}
          onClose={closePopover}
        />
      )}

      {hasOutgoing && (
        <Handle
          id="source"
          type="source"
          position={Position.Bottom}
          style={{ left: '50%', ...SOURCE_HANDLE }}
        />
      )}
    </div>
  );
});