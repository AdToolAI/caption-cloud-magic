/**
 * Timeline Anchor & Cut-Cell Engine for Director's Cut.
 *
 * Inspired by Premiere/CapCut/Artlist: every editable position lives on a
 * frame-quantized anchor grid. Inserted scenes/clips do not pick arbitrary
 * times; they snap to a real "cell" (the gap between two adjacent anchors).
 */

export const DEFAULT_FPS = 30;

export interface CutAnchor {
  time: number;
  source: 'ai' | 'manual' | 'scene' | 'timeline';
  confidence?: number;
}

export interface AnchorCell {
  start: number;
  end: number;
  startSource: CutAnchor['source'];
  endSource: CutAnchor['source'];
}

const EPS = 0.001;

export function quantizeToFrame(time: number, fps = DEFAULT_FPS): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  return Math.round(time * fps) / fps;
}

interface NormalizeInput {
  scenes?: Array<{ id: string; start_time: number; end_time: number }>;
  cutMarkers?: Array<{ time: number; confidence?: number; source?: 'auto' | 'manual' }>;
  duration?: number;
  fps?: number;
  /** Min distance between two anchors after dedupe, in seconds. */
  minSpacing?: number;
}

/**
 * Merge AI cuts, manual markers, scene boundaries, timeline-start/end
 * into a frame-quantized, deduplicated, sorted anchor list.
 */
export function normalizeCutAnchors(input: NormalizeInput): CutAnchor[] {
  const fps = input.fps ?? DEFAULT_FPS;
  const minSpacing = input.minSpacing ?? 1 / fps;
  const raw: CutAnchor[] = [];

  raw.push({ time: 0, source: 'timeline' });
  if (input.duration && input.duration > 0) {
    raw.push({ time: input.duration, source: 'timeline' });
  }

  for (const s of input.scenes ?? []) {
    raw.push({ time: s.start_time, source: 'scene' });
    raw.push({ time: s.end_time, source: 'scene' });
  }

  for (const m of input.cutMarkers ?? []) {
    raw.push({
      time: m.time,
      source: m.source === 'manual' ? 'manual' : 'ai',
      confidence: m.confidence ?? 1,
    });
  }

  // Frame-quantize, then sort
  const quantized = raw
    .filter(a => Number.isFinite(a.time) && a.time >= 0)
    .map(a => ({ ...a, time: quantizeToFrame(a.time, fps) }))
    .sort((a, b) => a.time - b.time || sourcePriority(b.source) - sourcePriority(a.source));

  // Dedupe: collapse anchors within `minSpacing`, keep highest priority.
  const result: CutAnchor[] = [];
  for (const a of quantized) {
    const last = result[result.length - 1];
    if (last && Math.abs(a.time - last.time) < minSpacing - EPS) {
      // Replace if new one has higher priority
      if (sourcePriority(a.source) > sourcePriority(last.source)) {
        result[result.length - 1] = a;
      }
      continue;
    }
    result.push(a);
  }

  return result;
}

function sourcePriority(s: CutAnchor['source']): number {
  switch (s) {
    case 'manual': return 4;
    case 'ai': return 3;
    case 'scene': return 2;
    case 'timeline': return 1;
  }
}

/**
 * Build edit cells from anchor list. Cell N spans anchors[N] → anchors[N+1].
 */
export function buildAnchorCells(anchors: CutAnchor[]): AnchorCell[] {
  const cells: AnchorCell[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (anchors[i + 1].time - anchors[i].time < EPS) continue;
    cells.push({
      start: anchors[i].time,
      end: anchors[i + 1].time,
      startSource: anchors[i].source,
      endSource: anchors[i + 1].source,
    });
  }
  return cells;
}

/**
 * Find the best cell to insert a new scene/clip at.
 *
 * Preference order:
 *  1. Cell containing the playhead (if provided).
 *  2. First cell after the last existing scene that is mostly empty.
 *  3. Largest available cell.
 */
export function findBestInsertionCell(opts: {
  cells: AnchorCell[];
  playhead?: number;
  occupiedRanges?: Array<{ start: number; end: number }>;
  preferredMinDuration?: number;
}): AnchorCell | null {
  const { cells, playhead, occupiedRanges = [], preferredMinDuration = 1 } = opts;
  if (cells.length === 0) return null;

  const isFree = (c: AnchorCell) => {
    return !occupiedRanges.some(r => overlaps(c.start, c.end, r.start, r.end));
  };

  if (typeof playhead === 'number') {
    const atPlayhead = cells.find(c => playhead >= c.start - EPS && playhead < c.end - EPS);
    if (atPlayhead && atPlayhead.end - atPlayhead.start >= preferredMinDuration) {
      return atPlayhead;
    }
  }

  const free = cells.filter(isFree);
  if (free.length > 0) {
    const sized = free.filter(c => c.end - c.start >= preferredMinDuration);
    if (sized.length > 0) return sized[0];
    return free[0];
  }

  // Fallback: largest cell
  return [...cells].sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd - EPS && bStart < aEnd - EPS;
}

/**
 * Fit a scene/clip into a target cell. If the clip's natural duration is
 * shorter than the cell, hold the start; if it's longer, trim to cell length.
 * Either way, snap exactly to the cell's anchors.
 */
export function fitSceneToCell(opts: {
  cell: AnchorCell;
  naturalDuration?: number;
  fps?: number;
}): { start_time: number; end_time: number } {
  const fps = opts.fps ?? DEFAULT_FPS;
  const start = quantizeToFrame(opts.cell.start, fps);
  let end = quantizeToFrame(opts.cell.end, fps);
  if (opts.naturalDuration && opts.naturalDuration > 0) {
    const cellDur = end - start;
    if (opts.naturalDuration < cellDur - EPS) {
      end = quantizeToFrame(start + opts.naturalDuration, fps);
    }
  }
  if (end <= start) end = quantizeToFrame(start + 1 / fps, fps);
  return { start_time: start, end_time: end };
}

/**
 * Sanitize a list of scenes:
 *  - frame-quantize start/end
 *  - close micro-gaps (< 2 frames) by extending previous scene
 *  - resolve micro-overlaps (< 2 frames)
 *  - drop scenes shorter than one frame
 */
export function sanitizeSceneBoundaries<T extends { start_time: number; end_time: number; original_start_time?: number; original_end_time?: number }>(
  scenes: T[],
  fps = DEFAULT_FPS,
): T[] {
  const frame = 1 / fps;
  const microThreshold = 2 * frame;

  const sorted = [...scenes].sort((a, b) => a.start_time - b.start_time);
  const out: T[] = [];

  for (const s of sorted) {
    const start = quantizeToFrame(s.start_time, fps);
    const end = quantizeToFrame(s.end_time, fps);
    if (end - start < frame - EPS) continue;

    const prev = out[out.length - 1];
    let nextStart = start;
    if (prev) {
      const gap = nextStart - prev.end_time;
      if (gap > 0 && gap < microThreshold) {
        // Close micro-gap
        prev.end_time = nextStart;
      } else if (gap < 0 && Math.abs(gap) < microThreshold) {
        // Resolve micro-overlap
        nextStart = prev.end_time;
      }
    }

    out.push({ ...s, start_time: nextStart, end_time: Math.max(nextStart + frame, end) });
  }

  return out;
}

/**
 * Find the cell at a given time, or null if outside.
 */
export function findCellAt(cells: AnchorCell[], time: number): AnchorCell | null {
  return cells.find(c => time >= c.start - EPS && time < c.end - EPS) ?? null;
}
