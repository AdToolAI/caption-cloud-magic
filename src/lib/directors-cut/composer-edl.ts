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

export type ComposerImportSource =
  | 'edl'
  | 'edl-rebuilt'
  | 'sceneGeometry-fallback'
  | 'composer-scenes-fallback';

export interface NormalizedComposerImport {
  scenes: NormalizedComposerScene[];
  /** Visible cut points (midpoint of each crossfade) for snapping/markers. */
  cutPoints: number[];
  totalDuration: number;
  source: ComposerImportSource;
  /** True if total was scaled to match the real MP4 duration. */
  calibratedToMp4?: boolean;
  /** Real MP4 duration used for calibration, if any. */
  realMp4Duration?: number;
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
  // Prefer geometry's own startSec/endSec when present (these come from the
  // assembler and already account for crossfade overlap). Only fall back to
  // contiguous cursor layout if absolute timestamps are missing.
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const hasAbsolute = sorted.every(g => Number.isFinite(g.startSec) && Number.isFinite(g.endSec));
  const cutPoints: number[] = [];
  const scenes: NormalizedComposerScene[] = [];
  if (hasAbsolute) {
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      const orderIdx = g.idx ?? i;
      const cs = composerScenes?.find(c => c.order_index === orderIdx);
      const start = r3(Number(g.startSec));
      const end = r3(Number(g.endSec));
      if (i < sorted.length - 1) cutPoints.push(end);
      scenes.push({
        id: `scene-${i + 1}`,
        start_time: start,
        end_time: end,
        original_start_time: start,
        original_end_time: end,
        description: describeFromComposer(i, start, end, cs),
        mood: 'neutral',
        playbackRate: 1.0,
        suggested_effects: [],
        ai_suggestions: [],
        sourceMode: 'original',
        isFromOriginalVideo: true,
      });
    }
    const total = scenes.length ? scenes[scenes.length - 1].end_time : 0;
    return { scenes, cutPoints, totalDuration: total, source: 'sceneGeometry-fallback' };
  }
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
    const start = r3(cursor);
    const end = r3(start + dur);
    if (i < sorted.length - 1) cutPoints.push(end);
    scenes.push({
      id: `scene-${i + 1}`,
      start_time: start,
      end_time: end,
      original_start_time: start,
      original_end_time: end,
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
  return { scenes, cutPoints, totalDuration: r3(cursor), source: 'sceneGeometry-fallback' };
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
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  let cursor = 0;
  const scenes: NormalizedComposerScene[] = [];
  const cutPoints: number[] = [];
  composerScenes.forEach((cs, i) => {
    const dur = Math.max(0.5, Number(cs.duration_seconds) || 5);
    const start = r3(cursor);
    const end = r3(start + dur);
    if (i < composerScenes.length - 1) cutPoints.push(end);
    scenes.push({
      id: `scene-${i + 1}`,
      start_time: start,
      end_time: end,
      original_start_time: start,
      original_end_time: end,
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
  return { scenes, cutPoints, totalDuration: r3(cursor), source: 'composer-scenes-fallback' };
}

/**
 * Deterministic EDL rebuild from composer_scenes when neither editDecisionList
 * nor sceneGeometry is present in content_config (older renders). Mirrors the
 * exact overlap math used by compose-video-assemble:
 *   start_i = max(0, cursor - i * crossfadeFrames)
 *   end_i   = start_i + duration_i_frames
 *   cursor += duration_i_frames
 *
 * If realMp4Duration is provided and differs from the nominal computed total
 * by >0.2s, all frame counts are linearly scaled so that the last endFrame
 * aligns exactly with the rendered MP4. This eliminates the ~0.5–1.0s drift
 * users see when AI clips render slightly shorter/longer than requested.
 *
 * Returns a structure compatible with `importComposerRenderEDL` so the cut
 * points come out at the visible crossfade midpoint with ms-level precision.
 */
export function rebuildEDLFromComposerScenes(
  composerScenes: ComposerScenesRow[],
  opts: {
    fps?: number;
    crossfadeFrames?: number;
    realMp4Duration?: number | null;
  } = {},
): NormalizedComposerImport {
  if (!composerScenes?.length) {
    return { scenes: [], cutPoints: [], totalDuration: 0, source: 'edl-rebuilt' };
  }
  const fps = opts.fps && opts.fps > 0 ? opts.fps : 30;
  const xfade = Number.isFinite(opts.crossfadeFrames) ? Number(opts.crossfadeFrames) : 15;
  const sorted = [...composerScenes].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  // 1) Per-scene nominal frame counts.
  let frames = sorted.map(cs => Math.max(1, Math.round((Number(cs.duration_seconds) || 5) * fps)));

  // 2) Compute nominal output total (with overlap).
  const computeTotalFrames = (arr: number[]) => {
    let cursor = 0;
    let lastEnd = 0;
    for (let i = 0; i < arr.length; i++) {
      const start = Math.max(0, cursor - i * xfade);
      const end = start + arr[i];
      lastEnd = end;
      cursor += arr[i];
    }
    return lastEnd;
  };
  const nominalTotalFrames = computeTotalFrames(frames);
  const nominalTotalSec = nominalTotalFrames / fps;

  // 3) Calibrate to real MP4 duration if known and meaningfully different.
  let calibrated = false;
  if (opts.realMp4Duration && Math.abs(opts.realMp4Duration - nominalTotalSec) > 0.2) {
    const targetFrames = Math.max(1, Math.round(opts.realMp4Duration * fps));
    const scale = targetFrames / nominalTotalFrames;
    frames = frames.map(f => Math.max(1, Math.round(f * scale)));
    calibrated = true;
  }

  // 4) Build EDL entries with the same math as compose-video-assemble.
  let cursor = 0;
  const edlEntries: ComposerEDLEntry[] = sorted.map((cs, i) => {
    const f = frames[i];
    const start = Math.max(0, cursor - i * xfade);
    const end = start + f;
    cursor += f;
    const bodyStart = i === 0 ? start : start + xfade;
    const bodyEnd = i === sorted.length - 1 ? end : end - xfade;
    const xfadeIn = i === 0 ? null : { startFrame: start, endFrame: start + xfade };
    const xfadeOut = i === sorted.length - 1 ? null : { startFrame: end - xfade, endFrame: end };
    return {
      sceneIndex: i,
      composerSceneId: null,
      orderIndex: cs.order_index ?? i,
      sceneType: cs.scene_type ?? null,
      clipUrl: '',
      isImage: false,
      fps,
      outputStartFrame: start,
      outputEndFrame: end,
      outputStartSec: Math.round((start / fps) * 1000) / 1000,
      outputEndSec: Math.round((end / fps) * 1000) / 1000,
      bodyStartFrame: Math.max(start, bodyStart),
      bodyEndFrame: Math.min(end, bodyEnd),
      transitionInFrameRange: xfadeIn,
      transitionOutFrameRange: xfadeOut,
      crossfadeFrames: xfade,
      durationFrames: f,
      durationSec: Math.round((f / fps) * 1000) / 1000,
      aiPrompt: cs.ai_prompt ?? null,
      textOverlay: cs.text_overlay ?? null,
    };
  });

  // 5) Reuse the frame-accurate EDL importer for cut-point math.
  const result = importComposerRenderEDL(edlEntries, sorted);
  return {
    ...result,
    source: 'edl-rebuilt',
    calibratedToMp4: calibrated,
    realMp4Duration: opts.realMp4Duration ?? undefined,
  };
}
