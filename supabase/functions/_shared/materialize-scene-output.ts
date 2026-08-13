/**
 * v430 Step 1 — the ONLY new writer of `composer_scenes.clip_url`.
 *
 * `clip_url` stays as the compatibility column: the bridge trigger, media
 * library sync and every exporter (FCPXML / EDL / bundle) keep reading it.
 * Instead of letting each finalization point set it directly, they all build
 * their update through this helper so the triple
 * (`base_video_url`, `processed_video_url`, `clip_url`) can never diverge.
 *
 * Allowed call-sites (v430 contract):
 *   • Plate webhook          — `compose-clip-webhook`      (base)
 *   • Sync.so mux completion — `sync-so-webhook`           (processed)
 *   • `beginSceneRun()`      — `_shared/scene-run-begin`   (clear)
 *   • Reset paths            — `_shared/scene-hard-reset`, `reset-lipsync-scene`
 *
 * This helper only BUILDS the patch object — it performs no DB call itself,
 * so it stays trivially testable and cannot hide a write.
 */

export type MaterializeMode = 'base' | 'processed' | 'clear';

export interface MaterializeArgs {
  /** Provider plate (pre lip-sync). */
  baseUrl?: string | null;
  /** Finished, lip-synced output. */
  processedUrl?: string | null;
}

export interface MaterializedOutput {
  base_video_url: string | null;
  processed_video_url: string | null;
  clip_url: string | null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Builds the canonical output columns for a scene update.
 *
 * - `base`      → sets the plate, clears any stale processed result.
 * - `processed` → keeps the plate, sets the muxed result.
 * - `clear`     → nulls all three (run start / hard reset).
 *
 * `clip_url` always mirrors `processed_video_url ?? base_video_url`, which is
 * exactly what every legacy consumer expects to find there today.
 */
export function materializeCompatibilityOutput(
  mode: MaterializeMode,
  args: MaterializeArgs = {},
): MaterializedOutput {
  if (mode === 'clear') {
    return { base_video_url: null, processed_video_url: null, clip_url: null };
  }

  const base = str(args.baseUrl);
  if (mode === 'base') {
    return { base_video_url: base, processed_video_url: null, clip_url: base };
  }

  // processed
  const processed = str(args.processedUrl);
  return {
    base_video_url: base,
    processed_video_url: processed,
    clip_url: processed ?? base,
  };
}
