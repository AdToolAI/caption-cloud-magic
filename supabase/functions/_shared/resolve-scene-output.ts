/**
 * v430 Step 1 — Output-Semantik.
 *
 * ONE contract for "which video does this scene currently have?".
 *
 * Historically every consumer re-implemented its own chain
 * (`lip_sync_source_clip_url ?? clip_url`, `clip_url ?? upload_url`, …) which
 * drifted per call-site. This module is the single READ contract.
 *
 * HARD RULES (v430):
 *   • This module is STRICTLY PURE. No Supabase, no DB, no network, no writes.
 *     A contract test enforces that (see __tests__/sceneOutputParity.test.ts).
 *   • It NEVER writes `clip_url`. The only writer is
 *     `materializeCompatibilityOutput()` in the edge-function shared folder.
 *
 * This file is mirrored byte-identically to
 * `supabase/functions/_shared/resolve-scene-output.ts`.
 */

export type SceneOutputSource =
  | 'processed'
  | 'base'
  | 'legacy_clip'
  | 'upload'
  | 'none';

export interface SceneOutputInput {
  base_video_url?: string | null;
  processed_video_url?: string | null;
  clip_url?: string | null;
  lip_sync_source_clip_url?: string | null;
  upload_url?: string | null;
  lip_sync_status?: string | null;
  // camelCase tolerance — the client scene model uses these.
  baseVideoUrl?: string | null;
  processedVideoUrl?: string | null;
  clipUrl?: string | null;
  lipSyncSourceClipUrl?: string | null;
  uploadUrl?: string | null;
  lipSyncStatus?: string | null;
}

export interface SceneOutput {
  /** Provider plate, before any lip-sync. */
  baseUrl: string | null;
  /** Finished output after the lip-sync mux. */
  processedUrl: string | null;
  /** What a player/exporter should actually show. */
  effectiveUrl: string | null;
  source: SceneOutputSource;
  isLipsynced: boolean;
}

/**
 * v430.0 — historical compatibility values that both mean "lip-sync finished".
 * The frozen lip-sync chain writes `done`; `applied` only exists on older rows.
 * READ-ONLY compatibility: no writer may start emitting `applied` again.
 */
export const LIPSYNC_DONE_STATES: ReadonlySet<string> = new Set(['done', 'applied']);

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Pure resolver. Tolerant against the legacy row shape: scenes written before
 * the v430 migration only carry `clip_url` / `lip_sync_source_clip_url`.
 *
 * Read order:
 *   processed_video_url
 *   -> clip_url when lip_sync_status is a completed value ('done' | 'applied')
 *   -> base_video_url
 *   -> lip_sync_source_clip_url
 *   -> clip_url
 *   -> upload_url
 */
export function resolveSceneOutput(scene: SceneOutputInput | null | undefined): SceneOutput {
  const s = (scene ?? {}) as SceneOutputInput;

  const processedCol = str(s.processed_video_url ?? s.processedVideoUrl);
  const baseCol = str(s.base_video_url ?? s.baseVideoUrl);
  const legacyClip = str(s.clip_url ?? s.clipUrl);
  const legacyPlate = str(s.lip_sync_source_clip_url ?? s.lipSyncSourceClipUrl);
  const upload = str(s.upload_url ?? s.uploadUrl);
  const applied = LIPSYNC_DONE_STATES.has(
    String(s.lip_sync_status ?? s.lipSyncStatus ?? ''),
  );

  // Processed: the new column wins; otherwise a legacy completed lip-sync scene
  // keeps its muxed result in clip_url.
  const processedUrl = processedCol ?? (applied ? legacyClip : null);

  // Base plate: the new column wins; otherwise the legacy mirror column, and
  // finally clip_url when the scene was never lip-synced.
  const baseUrl = baseCol ?? legacyPlate ?? (applied ? null : legacyClip);

  let effectiveUrl: string | null;
  let source: SceneOutputSource;
  if (processedUrl) {
    effectiveUrl = processedUrl;
    source = 'processed';
  } else if (baseUrl) {
    effectiveUrl = baseUrl;
    source = baseCol || legacyPlate ? 'base' : 'legacy_clip';
  } else if (legacyClip) {
    effectiveUrl = legacyClip;
    source = 'legacy_clip';
  } else if (upload) {
    effectiveUrl = upload;
    source = 'upload';
  } else {
    effectiveUrl = null;
    source = 'none';
  }

  return {
    baseUrl,
    processedUrl,
    effectiveUrl,
    source,
    isLipsynced: !!processedUrl,
  };
}

/**
 * Convenience for the many call-sites that only need the lip-sync SOURCE clip
 * (the plate), previously spelled `lip_sync_source_clip_url ?? clip_url`.
 */
export function resolveSceneSourcePlate(scene: SceneOutputInput | null | undefined): string | null {
  return resolveSceneOutput(scene).baseUrl;
}
