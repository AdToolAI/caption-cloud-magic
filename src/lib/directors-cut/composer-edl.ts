/**
 * Composer EDL → Director's Cut scene/transition import.
 *
 * The Composer renderer writes an `editDecisionList` into
 * `video_renders.content_config`. This is the single source of truth for
 * which scenes exist in the rendered MP4 and where the visible cut points
 * are. Director's Cut must NOT re-detect scenes from the stitched MP4 —
 * that always degrades into "find shot changes inside an AI clip".
 *
 * Visible cut convention (Artlist/CapCut/Premiere style):
 *   The cut happens at the MIDPOINT of the crossfade overlap. A 0.5s
 *   crossfade from clip A→B is visually "B" by the second half. Picking
 *   either edge of the overlap as the boundary always feels off by ~0.25s.
 */

export interface ComposerEDLEntry {
  sceneIndex: number;
  composerSceneId: string | null;
  orderIndex: number;
  sceneType: string | null;
  clipUrl: string;
  isImage?: boolean;
  fps: number;
  outputStartFrame: number;
  outputEndFrame: number;
  outputStartSec: number;
  outputEndSec: number;
  bodyStartFrame: number;
  bodyEndFrame: number;
  transitionInFrameRange: { startFrame: number; endFrame: number } | null;
  transitionOutFrameRange: { startFrame: number; endFrame: number } | null;
  crossfadeFrames: number;
  durationFrames: number;
  durationSec: number;
  aiPrompt?: string | null;
  textOverlay?: { text?: string; position?: string } | null;
}

export interface ComposerScenesRow {
  order_index: number;
  scene_type?: string | null;
  ai_prompt?: string | null;
  text_overlay?: any;
  stock_keywords?: string | null;
  duration_seconds?: number | null;
}

export interface NormalizedComposerScene {
  id: string;
  start_time: number;
  end_time: number;
  original_start_time: number;
  original_end_time: number;
  description: string;
  mood: string;
  playbackRate: number;
  suggested_effects: any[];
  ai_suggestions: any[];
  sourceMode: 'original';
  isFromOriginalVideo: true;
}

export interface NormalizedComposerImport {
  scenes: NormalizedComposerScene[];
  /** Visible cut points (midpoint of each crossfade) for snapping/markers. */
  cutPoints: number[];
  totalDuration: number;
  source: 'edl' | 'sceneGeometry-fallback' | 'composer-scenes-fallback';
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

function describeFromComposer(
  index: number,
  start: number,
  end: number,
  cs: ComposerScenesRow | undefined,
  edlEntry?: ComposerEDLEntry,
): string {
  const neutral = `Composer Szene ${index + 1} · ${fmt(start)}–${fmt(end)}`;
  const overlay =
    (cs?.text_overlay && typeof cs.text_overlay === 'object' && (cs.text_overlay as any).text)
      ? String((cs.text_overlay as any).text)
      : (edlEntry?.textOverlay && (edlEntry.textOverlay as any).text)
        ? String((edlEntry.textOverlay as any).text)
        : '';
  const promptLike = (
    overlay ||
    cs?.ai_prompt ||
    edlEntry?.aiPrompt ||
    cs?.stock_keywords ||
    ''
  ).toString().trim();
  const sceneTypeLabel = cs?.scene_type
    ? String(cs.scene_type)
    : edlEntry?.sceneType
      ? String(edlEntry.sceneType)
      : `Szene ${index + 1}`;
  if (promptLike) return `${sceneTypeLabel} · ${promptLike.slice(0, 80)}`;
  if (cs?.scene_type || edlEntry?.sceneType) return sceneTypeLabel;
  return neutral;
}

/**
 * Build editor scenes from the authoritative EDL.
 * Cut points sit at the MIDPOINT of each crossfade overlap.
 */
export function importComposerRenderEDL(
  edl: ComposerEDLEntry[],
  composerScenes: ComposerScenesRow[] | null | undefined,
): NormalizedComposerImport {
  const sorted = [...edl].sort((a, b) => a.outputStartFrame - b.outputStartFrame);
  if (sorted.length === 0) {
    return { scenes: [], cutPoints: [], totalDuration: 0, source: 'edl' };
  }
  const fps = sorted[0].fps || 30;

  // Compute visible boundaries: between scene i and i+1 the cut sits at the
  // midpoint of the overlap region [scene_i.outEnd - xfade, scene_i.outEnd].
  // Keep frame-accurate float seconds (no 10ms rounding) — at 30fps a frame
  // is 33.3ms, so rounding to 2 decimals would systematically drift cuts by
  // up to ±17ms vs the actually rendered MP4 frame.
  const frameToSec = (frame: number) => Math.round((frame / fps) * 1000) / 1000;
  const cutPoints: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i];
    const xfade = cur.crossfadeFrames || 0;
    const midFrame = cur.outputEndFrame - xfade / 2;
    cutPoints.push(frameToSec(midFrame));
  }

  const lastEndSec = frameToSec(sorted[sorted.length - 1].outputEndFrame);

  const scenes: NormalizedComposerScene[] = sorted.map((entry, i) => {
    const start = i === 0 ? 0 : cutPoints[i - 1];
    const end = i === sorted.length - 1 ? lastEndSec : cutPoints[i];
    const cs = composerScenes?.find(c => c.order_index === entry.orderIndex);
    return {
      id: `scene-${i + 1}`,
      start_time: start,
      end_time: end,
      original_start_time: start,
      original_end_time: end,
      description: describeFromComposer(i, start, end, cs, entry),
      mood: 'neutral',
      playbackRate: 1.0,
      suggested_effects: [],
      ai_suggestions: [],
      sourceMode: 'original',
      isFromOriginalVideo: true,
    };
  });

  return { scenes, cutPoints, totalDuration: lastEndSec, source: 'edl' };
}

/**
 * Legacy fallback: build scenes from sceneGeometry by reconstructing
 * contiguous, non-overlapping segments based on the REAL composer scene
 * durations (geometry encodes overlap-aware start/end frames per clip).
 *
 * Strategy: take the per-clip durationSec (already nominal/probed) and lay
 * them out contiguously starting at 0. This matches what a NLE would show:
 * one segment per composer scene, in source order, with cut points exactly
 * at the boundary between consecutive composer clips. We intentionally do
 * NOT use the crossfade midpoint here — for legacy renders without an EDL
 * it produces visually inconsistent segments and confuses users into
 * thinking the editor "guessed" boundaries.
 */
export function importComposerRenderGeometry(
  geometry: Array<{ idx?: number; startSec: number; endSec: number; durationSec?: number }>,
  composerScenes: ComposerScenesRow[] | null | undefined,
  _crossfadeFrames: number,
  _fps: number,
): NormalizedComposerImport {
  const sorted = [...geometry].sort((a, b) => (a.idx ?? a.startSec) - (b.idx ?? b.startSec));
  if (sorted.length === 0) {
    return { scenes: [], cutPoints: [], totalDuration: 0, source: 'sceneGeometry-fallback' };
  }
  // Per-clip duration: prefer geometry.durationSec, else fall back to
  // composer_scenes.duration_seconds, else (endSec-startSec).
  const cutPoints: number[] = [];
  const scenes: NormalizedComposerScene[] = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length; i++) {
    const g = sorted[i];
    const orderIdx = g.idx ?? i;
    const cs = composerScenes?.find(c => c.order_index === orderIdx);
    const dur = Math.max(
      0.5,
      Number(g.durationSec) ||
      Number(cs?.duration_seconds) ||
      Math.max(0, Number(g.endSec) - Number(g.startSec)) ||
      5,
    );
    const start = cursor;
    const end = start + dur;
    if (i < sorted.length - 1) cutPoints.push(Math.round(end * 100) / 100);
    scenes.push({
      id: `scene-${i + 1}`,
      start_time: Math.round(start * 100) / 100,
      end_time: Math.round(end * 100) / 100,
      original_start_time: Math.round(start * 100) / 100,
      original_end_time: Math.round(end * 100) / 100,
      description: describeFromComposer(i, start, end, cs),
      mood: 'neutral',
      playbackRate: 1.0,
      suggested_effects: [],
      ai_suggestions: [],
      sourceMode: 'original',
      isFromOriginalVideo: true,
    });
    cursor = end;
  }
  return { scenes, cutPoints, totalDuration: cursor, source: 'sceneGeometry-fallback' };
}

/**
 * Last-resort fallback: only composer_scenes.duration_seconds available.
 * Uses contiguous, non-overlapping segments. Crossfade midpoints unknown.
 */
export function importComposerScenesDurationsOnly(
  composerScenes: ComposerScenesRow[],
): NormalizedComposerImport {
  if (!composerScenes?.length) {
    return { scenes: [], cutPoints: [], totalDuration: 0, source: 'composer-scenes-fallback' };
  }
  let cursor = 0;
  const scenes: NormalizedComposerScene[] = [];
  const cutPoints: number[] = [];
  composerScenes.forEach((cs, i) => {
    const dur = Math.max(0.5, Number(cs.duration_seconds) || 5);
    const start = cursor;
    const end = start + dur;
    if (i < composerScenes.length - 1) cutPoints.push(Math.round(end * 100) / 100);
    scenes.push({
      id: `scene-${i + 1}`,
      start_time: Math.round(start * 100) / 100,
      end_time: Math.round(end * 100) / 100,
      original_start_time: Math.round(start * 100) / 100,
      original_end_time: Math.round(end * 100) / 100,
      description: describeFromComposer(i, start, end, cs),
      mood: 'neutral',
      playbackRate: 1.0,
      suggested_effects: [],
      ai_suggestions: [],
      sourceMode: 'original',
      isFromOriginalVideo: true,
    });
    cursor = end;
  });
  return { scenes, cutPoints, totalDuration: cursor, source: 'composer-scenes-fallback' };
}
