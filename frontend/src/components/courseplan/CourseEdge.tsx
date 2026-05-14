import { useMemo } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, useNodes } from '@xyflow/react';
import { COLOURS } from '../../utils/colours';

export interface CourseEdgeData extends Record<string, unknown> {
  gapY?: number;
  edgeIndex?: number;
  totalEdges?: number;
}

// Tunable knobs
const CONFIG = {
  EXIT_SPACE: 20,
  ROW_GAP_THRESHOLD: 16,
  MIN_CORRIDOR_WIDTH: 8,
  NODE_CLEARANCE: 5,
  CORNER_RADIUS: 20,
  SIBLING_SPREAD_PX: 12,
};

interface Box      { id: string; x: number; y: number; w: number; h: number; }
interface Corridor { x: number; left: number; right: number; isFlanking: boolean; }
interface Point    { x: number; y: number; }
interface ChartBounds { minX: number; maxX: number; }

// Row gap detection
function findRowGapYs(boxes: Box[], minY: number, maxY: number): number[] {
  if (boxes.length === 0) return [];

  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const bands: { top: number; bot: number }[] = [];

  for (const b of sorted) {
    const top = b.y - CONFIG.NODE_CLEARANCE;
    const bot = b.y + b.h + CONFIG.NODE_CLEARANCE;
    if (bands.length === 0 || top > bands[bands.length - 1].bot + CONFIG.ROW_GAP_THRESHOLD) {
      bands.push({ top, bot });
    } else {
      bands[bands.length - 1].bot = Math.max(bands[bands.length - 1].bot, bot);
    }
  }

  const gaps: number[] = [];
  for (let i = 0; i < bands.length - 1; i++) {
    const mid = (bands[i].bot + bands[i + 1].top) / 2;
    if (mid > minY && mid < maxY) gaps.push(mid);
  }
  return gaps;
}

function findCorridorsInYRange(
  boxes: Box[],
  minY: number,
  maxY: number,
  chartBounds?: ChartBounds,
): Corridor[] {
  const relevant = boxes.filter(
    b => b.y < maxY + CONFIG.NODE_CLEARANCE && b.y + b.h > minY - CONFIG.NODE_CLEARANCE
  );
  if (relevant.length === 0) return [];

  const extents = relevant.map(b => ({
    left:  b.x - CONFIG.NODE_CLEARANCE,
    right: b.x + b.w + CONFIG.NODE_CLEARANCE,
  }));
  extents.sort((a, b) => a.left - b.left);

  const merged: { left: number; right: number }[] = [];
  for (const ext of extents) {
    if (merged.length === 0 || ext.left > merged[merged.length - 1].right) {
      merged.push({ ...ext });
    } else {
      merged[merged.length - 1].right = Math.max(merged[merged.length - 1].right, ext.right);
    }
  }

  const corridors: Corridor[] = [];
  const FLANK_DIST = CONFIG.NODE_CLEARANCE * 3;

  // Left flanking corridor — suppress if it would place the path outside the chart.
  const leftFlankX = merged[0].left - FLANK_DIST;
  if (!chartBounds || leftFlankX >= chartBounds.minX) {
    corridors.push({
      x:    leftFlankX,
      left: leftFlankX - FLANK_DIST * 2,
      right: merged[0].left,
      isFlanking: true,
    });
  }

  // Internal corridors between obstacle groups — these are always preferred.
  for (let i = 0; i < merged.length - 1; i++) {
    const left  = merged[i].right;
    const right = merged[i + 1].left;
    if (right - left >= CONFIG.MIN_CORRIDOR_WIDTH) {
      corridors.push({ x: (left + right) / 2, left, right, isFlanking: false });
    }
  }
  // Right flanking corridor — suppress if it would place the path outside the chart.
  const rightFlankX = merged[merged.length - 1].right + FLANK_DIST;
  if (!chartBounds || rightFlankX <= chartBounds.maxX) {
    corridors.push({
      x:    rightFlankX,
      left: merged[merged.length - 1].right,
      right: rightFlankX + FLANK_DIST * 2,
      isFlanking: true,
    });
  }

  return corridors;
}

function preferInternal(corridors: Corridor[]): Corridor[] {
  const internal = corridors.filter(c => !c.isFlanking);
  return internal.length > 0 ? internal : corridors;
}

function pickCorridorX(
  corridors:    Corridor[],
  preferredX:   number,
  siblingIndex: number,
  siblingCount: number,
  fallback:     number,
): number {
  if (corridors.length === 0) return fallback;

  corridors.sort((a, b) => Math.abs(a.x - preferredX) - Math.abs(b.x - preferredX));
  const best    = corridors[0];

  const usable  = (best.right - best.left) * 0.5;
  const step    = siblingCount <= 1 ? 0 : Math.min(CONFIG.SIBLING_SPREAD_PX, usable / siblingCount);
  const offset  = siblingCount <= 1 ? 0 : (siblingIndex - (siblingCount - 1) / 2) * step;

  return best.x + offset;
}

function isXClearInYRange(x: number, boxes: Box[], minY: number, maxY: number): boolean {
  return !boxes.some(
    b =>
      b.x - CONFIG.NODE_CLEARANCE < x &&
      b.x + b.w + CONFIG.NODE_CLEARANCE > x &&
      b.y - CONFIG.NODE_CLEARANCE < maxY &&
      b.y + b.h + CONFIG.NODE_CLEARANCE > minY,
  );
}

// Check whether the full vertical span source→target is clear at a
// given x position, so we can short-circuit routing for straight-down edges.
function isDirectPathClear(
  x: number,
  fromY: number,
  toY: number,
  boxes: Box[],
): boolean {
  return !boxes.some(
    b =>
      b.x - CONFIG.NODE_CLEARANCE < x &&
      b.x + b.w + CONFIG.NODE_CLEARANCE > x &&
      b.y - CONFIG.NODE_CLEARANCE < toY &&
      b.y + b.h + CONFIG.NODE_CLEARANCE > fromY,
  );
}

function buildWaypoints(
  sourceX:      number,
  sourceY:      number,
  targetX:      number,
  targetY:      number,
  boxes:        Box[],
  targetBox:    Box | null,
  siblingIndex: number,
  siblingCount: number,
  fallbackGapY: number,
  chartBounds:  ChartBounds,
): Point[] {
  const exitY  = sourceY + CONFIG.EXIT_SPACE;
  const entryY = targetY - CONFIG.EXIT_SPACE;

  // If source and target share (nearly) the same x and nothing blocks
  // the straight vertical path, emit a direct two-point path and skip all
  // corridor / gap logic.
  const isSameColumn = Math.abs(sourceX - targetX) < 1;
  if (isSameColumn) {
    const boxesWithTarget = targetBox ? [...boxes, targetBox] : boxes;
    // Check the span between exitY and entryY (the stub segments are always clear).
    if (isDirectPathClear(sourceX, exitY, entryY, boxesWithTarget)) {
      return [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: targetY },
      ];
    }
  }

  const boxesWithTarget = targetBox ? [...boxes, targetBox] : boxes;

  let gapYs = findRowGapYs(boxesWithTarget, exitY, entryY);
  if (gapYs.length === 0) gapYs = [fallbackGapY];

  const xLo = Math.min(sourceX, targetX);
  const xHi = Math.max(sourceX, targetX);

  const pts: Point[] = [];
  pts.push({ x: sourceX, y: sourceY });
  pts.push({ x: sourceX, y: exitY });

  let currentX = sourceX;

  for (let i = 0; i < gapYs.length; i++) {
    const gapY    = gapYs[i];
    const segTopY = i === 0 ? exitY : gapYs[i - 1];

    if (isXClearInYRange(currentX, boxesWithTarget, segTopY, gapY)) {
      pts.push({ x: currentX, y: gapY });
      continue;
    }

    const corridors = findCorridorsInYRange(boxesWithTarget, segTopY, gapY, chartBounds);

    const progress   = (i + 1) / (gapYs.length + 1);
    const preferredX = currentX + (targetX - currentX) * progress;

    const globallyPreferred = preferInternal(corridors);

    const inRange = globallyPreferred.filter(
      c => c.x >= xLo - CONFIG.NODE_CLEARANCE && c.x <= xHi + CONFIG.NODE_CLEARANCE,
    );
    const candidates = inRange.length > 0 ? inRange : globallyPreferred;

    const corrX = pickCorridorX(candidates, preferredX, siblingIndex, siblingCount, currentX);

    if (Math.abs(corrX - currentX) > 0.5) {
      pts.push({ x: corrX, y: segTopY });
    }
    pts.push({ x: corrX, y: gapY });
    currentX = corrX;
  }

  const lastGapY = gapYs[gapYs.length - 1];

  let finalCorrX = targetX;

  if (!isXClearInYRange(targetX, boxes, lastGapY, entryY)) {
    const finalCorridors = findCorridorsInYRange(boxes, lastGapY, entryY, chartBounds);
    const finalGloballyPreferred = preferInternal(finalCorridors);
    const inRangeFinal = finalGloballyPreferred.filter(
      c => c.x >= xLo - CONFIG.NODE_CLEARANCE && c.x <= xHi + CONFIG.NODE_CLEARANCE,
    );
    const candidatesFinal = inRangeFinal.length > 0 ? inRangeFinal : finalGloballyPreferred;
    finalCorrX = pickCorridorX(candidatesFinal, targetX, siblingIndex, siblingCount, targetX);
  }

  if (Math.abs(finalCorrX - currentX) > 0.5 && Math.abs(finalCorrX - targetX) > 0.5) {
    pts.push({ x: finalCorrX, y: lastGapY });
  }

  if (Math.abs(targetX - currentX) > 0.5 || Math.abs(finalCorrX - targetX) > 0.5) {
    pts.push({ x: targetX, y: lastGapY });
  }

  if (entryY < targetY - 0.5) {
    pts.push({ x: targetX, y: entryY });
  }
  pts.push({ x: targetX, y: targetY });

  return pts.filter((p, i) =>
    i === 0 ||
    Math.abs(p.x - pts[i - 1].x) > 0.5 ||
    Math.abs(p.y - pts[i - 1].y) > 0.5
  );
}

function buildSVGPath(pts: Point[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  const r = CONFIG.CORNER_RADIUS;
  let d   = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;

    const len1 = Math.hypot(d1x, d1y);
    const len2 = Math.hypot(d2x, d2y);
    if (len1 < 0.1 || len2 < 0.1) continue;

    const cr = Math.min(r, len1 / 2, len2 / 2);

    const bx = curr.x - (d1x / len1) * cr;
    const by = curr.y - (d1y / len1) * cr;
    const ax = curr.x + (d2x / len2) * cr;
    const ay = curr.y + (d2y / len2) * cr;

    d += ` L ${bx.toFixed(1)} ${by.toFixed(1)}`;
    d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function CourseEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps<import('@xyflow/react').Edge<CourseEdgeData, 'courseEdge'>>) {
  const markerId = `arrow-${id}`;
  const allNodes = useNodes();

  const chartBounds = useMemo<ChartBounds>(() => {
    if (allNodes.length === 0) return { minX: 0, maxX: 1000 };
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of allNodes) {
      const w = (n.measured?.width ?? n.width ?? 150) as number;
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + w);
    }
    return { minX, maxX };
  }, [allNodes]);

  const path = useMemo(() => {
    const targetNode = allNodes.find(n => n.id === target);
    const targetBox: Box | null = targetNode
      ? {
          id: targetNode.id,
          x:  targetNode.position.x,
          y:  targetNode.position.y,
          w:  (targetNode.measured?.width  ?? targetNode.width  ?? 150) as number,
          h:  (targetNode.measured?.height ?? targetNode.height ?? 60)  as number,
        }
      : null;

    const boxes: Box[] = allNodes
      .filter(n => n.id !== source && n.id !== target)
      .map(n => ({
        id: n.id,
        x:  n.position.x,
        y:  n.position.y,
        w:  (n.measured?.width  ?? n.width  ?? 150) as number,
        h:  (n.measured?.height ?? n.height ?? 60)  as number,
      }));

    const edgeIndex   = data?.edgeIndex  ?? 0;
    const totalEdges  = data?.totalEdges ?? 1;
    const fallbackGap = data?.gapY ?? (sourceY + targetY) / 2;

    const waypoints = buildWaypoints(
      sourceX, sourceY,
      targetX, targetY,
      boxes,
      targetBox,
      edgeIndex,
      totalEdges,
      fallbackGap,
      chartBounds,
    );

    return buildSVGPath(waypoints);
  }, [source, target, sourceX, sourceY, targetX, targetY, data, allNodes, chartBounds]);

  return (
    <>
      <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <marker
            id={markerId}
            markerWidth="6"
            markerHeight="6"
            viewBox="0 0 10 10"
            markerUnits="strokeWidth"
            orient="auto"
            refX="7"
            refY="5"
          >
            <polygon points="0,0 10,5 0,10" fill={COLOURS.black} />
          </marker>
        </defs>
      </svg>
      <BaseEdge
        id={id}
        path={path}
        style={{ ...style, stroke: COLOURS.black, strokeWidth: 1.5 }}
        markerEnd={`url(#${markerId})`}
      />
    </>
  );
}