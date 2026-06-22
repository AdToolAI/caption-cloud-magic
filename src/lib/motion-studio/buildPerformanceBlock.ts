// =============================================================================
// buildPerformanceBlock — Phase 2 Performance Layer
// =============================================================================
//
// Translates the structured per-character `ScenePerformance` selections into
// a compact `[4 PERFORMANCE]` prompt block emitted between SHOT and DIALOG
// by `composeFinalPrompt`. Kept deliberately short so the overall prompt
// stays inside the Hailuo/Kling sweet-spot even for 4-character scenes:
//
//   [4 PERFORMANCE]
//   - Sarah: warm smile, open palms, looks at Matthew, energy 2/5
//   - Matthew: confident, hand-on-chin, looks at Sarah, energy 3/5
//
// Rules:
//   • Only emitted when at least one character has at least one field set.
//   • Each character line is hard-capped at 12 words so 4 lines stay under
//     ~250 chars total.
//   • Pure function — no state, no async, safe to call inside `useMemo`.
//   • Never reads or writes `audioPlan` → lip-sync pipeline is unaffected.

import type {
  PerformanceExpression,
  PerformanceGaze,
  PerformanceGesture,
  ScenePerformance,
} from '@/types/video-composer';

const EXPRESSION_EN: Record<PerformanceExpression, string> = {
  neutral: 'neutral expression',
  'warm-smile': 'warm smile',
  curious: 'curious look',
  concerned: 'concerned look',
  confident: 'confident expression',
  surprised: 'surprised expression',
};

const GESTURE_EN: Record<PerformanceGesture, string> = {
  still: 'still posture',
  'hand-on-chin': 'hand on chin',
  'open-palms': 'open palms',
  point: 'pointing gesture',
  'cross-arms': 'arms crossed',
  'lean-in': 'leans in',
};

const GAZE_EN: Record<PerformanceGaze, string> = {
  'to-camera': 'looks to camera',
  'to-speaker': 'looks to the other speaker',
  away: 'looks away',
  'down-thinking': 'looks down, thinking',
};

export interface PerformanceEntry {
  /** Character display name as printed in the bullet list. */
  name: string;
  performance?: ScenePerformance;
}

function isEmpty(p?: ScenePerformance): boolean {
  if (!p) return true;
  return !p.expression && !p.gesture && !p.gaze && !p.energy;
}

function trimWords(s: string, max: number): string {
  const w = s.trim().split(/\s+/);
  return w.length <= max ? s.trim() : w.slice(0, max).join(' ');
}

/**
 * Render one character's performance as a single line — already English,
 * already trimmed, ready for the prompt body.
 */
export function buildPerformanceLine(name: string, p?: ScenePerformance): string {
  if (isEmpty(p) || !name?.trim()) return '';
  const parts: string[] = [];
  if (p!.expression) parts.push(EXPRESSION_EN[p!.expression]);
  if (p!.gesture) parts.push(GESTURE_EN[p!.gesture]);
  if (p!.gaze) parts.push(GAZE_EN[p!.gaze]);
  if (p!.energy) parts.push(`energy ${p!.energy}/5`);
  if (parts.length === 0) return '';
  const body = trimWords(parts.join(', '), 12);
  return `- ${name.trim()}: ${body}`;
}

/**
 * Build the full `[4 PERFORMANCE]` block. Returns `''` when no entry has
 * any field set — so callers can `if (block) lines.push(block)` cleanly.
 */
export function buildPerformanceBlock(entries: PerformanceEntry[]): string {
  const lines = (entries ?? [])
    .map((e) => buildPerformanceLine(e.name, e.performance))
    .filter(Boolean);
  if (lines.length === 0) return '';
  return `[4 PERFORMANCE]\n${lines.join('\n')}`;
}

/**
 * Compact summary for UI ("3 cast directed" / "Sarah, Matthew") used by
 * tab badges. Returns count of characters with at least one performance
 * field set.
 */
export function countDirectedPerformances(entries: PerformanceEntry[]): number {
  return (entries ?? []).filter((e) => !isEmpty(e.performance)).length;
}
