import { useMemo } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, useNodes } from '@xyflow/react';
import { COLOURS } from '../../utils/colours';

export interface CourseEdgeData extends Record<string, unknown> {
  gapY?: number;
  edgeIndex?: number;
  totalEdges?: number;
}

// ── Tunable knobs ─────────────────────────────────────────────────────────────
const CONFIG = {
  EXIT_SPACE: 20,
  ROW_GAP_THRESHOLD: 16,
  MIN_CORRIDOR_WIDTH: 8,
  NODE_CLEARANCE: 8,
  CORNER_RADIUS: 20,
  SIBLING_SPREAD_PX: 12,
};

interface Box      { id: string; x: number; y: number; w: number; h: number; }
interface Corridor { x: number; left: number; right: number; }
interface Point    { x: number; y: number; }

// ── Row gap detection ─────────────────────────────────────────────────────────

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

// ── Corridor detection ────────────────────────────────────────────────────────

function findCorridorsInYRange(boxes: Box[], minY: number, maxY: number): Corridor[] {
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
  for (let i = 0; i < merged.length - 1; i++) {
    const left  = merged[i].right;
    const right = merged[i + 1].left;
    if (right - left >= CONFIG.MIN_CORRIDOR_WIDTH) {
      corridors.push({ x: (left + right) / 2, left, right });
    }
  }
  return corridors;
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
  const usable  = (best.right - best.left) * 0.8;
  const step    = siblingCount <= 1 ? 0 : Math.min(CONFIG.SIBLING_SPREAD_PX, usable / siblingCount);
  const offset  = siblingCount <= 1 ? 0 : (siblingIndex - (siblingCount - 1) / 2) * step;
  return best.x + offset;
}

// ── Check if a vertical line at x is obstacle-free in [minY, maxY] ───────────
function isXClearInYRange(x: number, boxes: Box[], minY: number, maxY: number): boolean {
  return !boxes.some(
    b =>
      b.x - CONFIG.NODE_CLEARANCE < x &&
      b.x + b.w + CONFIG.NODE_CLEARANCE > x &&
      b.y - CONFIG.NODE_CLEARANCE < maxY &&
      b.y + b.h + CONFIG.NODE_CLEARANCE > minY,
  );
}

// ── Waypoint assembler ────────────────────────────────────────────────────────

function buildWaypoints(
  sourceX:      number,
  sourceY:      number,
  targetX:      number,
  targetY:      number,
  boxes:        Box[],
  siblingIndex: number,
  siblingCount: number,
  fallbackGapY: number,
): Point[] {
  const exitY  = sourceY + CONFIG.EXIT_SPACE;
  const entryY = targetY - CONFIG.EXIT_SPACE;

  let gapYs = findRowGapYs(boxes, exitY, entryY);
  if (gapYs.length === 0) gapYs = [fallbackGapY];

  // The direct source→target X band. We strongly prefer to stay within this
  // range when choosing corridors — this prevents edges from looping far off
  // to the side just because an obstacle spans the full width at some Y level.
  const xLo = Math.min(sourceX, targetX);
  const xHi = Math.max(sourceX, targetX);

  const pts: Point[] = [];
  pts.push({ x: sourceX, y: sourceY });
  pts.push({ x: sourceX, y: exitY });

  let currentX = sourceX;

  for (let i = 0; i < gapYs.length; i++) {
    const gapY    = gapYs[i];
    const segTopY = i === 0 ? exitY : gapYs[i - 1];

    // Fast path: if the current X is already clear, go straight down.
    // This avoids unnecessary lateral hops into a far-off corridor.
    if (isXClearInYRange(currentX, boxes, segTopY, gapY)) {
      pts.push({ x: currentX, y: gapY });
      continue;
    }

    const corridors = findCorridorsInYRange(boxes, segTopY, gapY);

    const progress   = (i + 1) / (gapYs.length + 1);
    const preferredX = currentX + (targetX - currentX) * progress;

    // Prefer corridors within the source↔target X range.
    // Only fall back to all corridors if nothing usable is in-range.
    const inRange = corridors.filter(
      c => c.x >= xLo - CONFIG.NODE_CLEARANCE && c.x <= xHi + CONFIG.NODE_CLEARANCE,
    );
    const candidates = inRange.length > 0 ? inRange : corridors;

    const corrX = pickCorridorX(candidates, preferredX, siblingIndex, siblingCount, currentX);

    if (Math.abs(corrX - currentX) > 0.5) {
      pts.push({ x: corrX, y: segTopY });
    }
    pts.push({ x: corrX, y: gapY });
    currentX = corrX;
  }

  // ── Final segment: step sideways to targetX and approach the node ─────────
  const lastGapY = gapYs[gapYs.length - 1];

  let finalCorrX = targetX;

  if (!isXClearInYRange(targetX, boxes, lastGapY, entryY)) {
    const finalCorridors = findCorridorsInYRange(boxes, lastGapY, entryY);
    const inRangeFinal = finalCorridors.filter(
      c => c.x >= xLo - CONFIG.NODE_CLEARANCE && c.x <= xHi + CONFIG.NODE_CLEARANCE,
    );
    const candidatesFinal = inRangeFinal.length > 0 ? inRangeFinal : finalCorridors;
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

  // Deduplicate consecutive identical points
  return pts.filter((p, i) =>
    i === 0 ||
    Math.abs(p.x - pts[i - 1].x) > 0.5 ||
    Math.abs(p.y - pts[i - 1].y) > 0.5
  );
}

// ── SVG path builder ──────────────────────────────────────────────────────────

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

// ── Edge component ────────────────────────────────────────────────────────────

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

  const path = useMemo(() => {
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
      edgeIndex,
      totalEdges,
      fallbackGap,
    );

    return buildSVGPath(waypoints);
  }, [source, target, sourceX, sourceY, targetX, targetY, data, allNodes]);

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