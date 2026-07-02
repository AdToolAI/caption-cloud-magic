import type { SceneAnalysis } from '@/types/directors-cut';

/**
 * W4.3 Anchor-Refresh
 *
 * Detects scenes whose head-trim has cut off the AI-generated "identity anchor"
 * (the establishing first-frame that locks a character's look). Provides a
 * pure client-side snap-to-anchor operation that restores each scene's
 * source-in point to the anchor while preserving its timeline duration.
 */

export type AnchorDriftSeverity = 'ok' | 'warn' | 'drift';

export interface AnchorDrift {
  sceneId: string;
  index: number;
  thumbnail?: string;
  /** Seconds of source that were trimmed off the head. */
  headTrim: number;
  /** Where the anchor lives in the source (usually media_source_start ?? 0). */
  anchorSourceTime: number;
  /** Where the scene currently starts consuming the source. */
  currentSourceIn: number;
  severity: AnchorDriftSeverity;
  reason: string;
  canSnap: boolean;
}

export const DEFAULT_WARN_THRESHOLD = 0.15;
export const DEFAULT_DRIFT_THRESHOLD = 0.35;

export interface AnchorAnalysisOptions {
  warnThreshold?: number;
  driftThreshold?: number;
}

export function analyzeAnchorDrift(
  scenes: SceneAnalysis[],
  options: AnchorAnalysisOptions = {},
): AnchorDrift[] {
  const driftThreshold = options.driftThreshold ?? DEFAULT_DRIFT_THRESHOLD;
  const warnThreshold = Math.min(
    options.warnThreshold ?? DEFAULT_WARN_THRESHOLD,
    driftThreshold * 0.6,
  );

  return scenes.map((s, idx) => {
    const anchor = s.media_source_start ?? 0;
    const currentIn = s.original_start_time ?? s.start_time;
    const headTrim = Math.max(0, currentIn - anchor);

    let severity: AnchorDriftSeverity = 'ok';
    let reason = 'Anchor intakt — Szene startet am Identity-Frame.';
    if (headTrim >= driftThreshold) {
      severity = 'drift';
      reason = `Head-Trim ${headTrim.toFixed(2)}s — Identity-Anchor abgeschnitten.`;
    } else if (headTrim >= warnThreshold) {
      severity = 'warn';
      reason = `Head-Trim ${headTrim.toFixed(2)}s — Anchor knapp.`;
    }

    return {
      sceneId: s.id,
      index: idx,
      thumbnail: s.thumbnail_url,
      headTrim,
      anchorSourceTime: anchor,
      currentSourceIn: currentIn,
      severity,
      reason,
      canSnap: headTrim > 0.02,
    };
  });
}

/**
 * Snap a scene's source-in point back to the anchor.
 * Preserves the scene's timeline duration.
 */
export function snapSceneToAnchor(scene: SceneAnalysis): SceneAnalysis {
  const anchor = scene.media_source_start ?? 0;
  const duration = Math.max(0.1, scene.end_time - scene.start_time);
  const currentIn = scene.original_start_time ?? scene.start_time;
  if (Math.abs(currentIn - anchor) < 0.02) return scene;

  return {
    ...scene,
    original_start_time: anchor,
    original_end_time: anchor + duration,
  };
}

export function snapAllToAnchor(
  scenes: SceneAnalysis[],
  onlyDrifting = true,
  options: AnchorAnalysisOptions = {},
): SceneAnalysis[] {
  const drifts = new Map(analyzeAnchorDrift(scenes, options).map((d) => [d.sceneId, d]));
  return scenes.map((s) => {
    const d = drifts.get(s.id);
    if (!d || !d.canSnap) return s;
    if (onlyDrifting && d.severity === 'ok') return s;
    return snapSceneToAnchor(s);
  });
}
