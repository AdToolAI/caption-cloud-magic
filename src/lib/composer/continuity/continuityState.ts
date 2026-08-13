/**
 * v430 Step 4 — Continuity state, pure.
 *
 * THREE questions, one place:
 *   1. Was this scene EVER rendered?            → `sceneWasEverRendered()`
 *   2. Is scene A's output semantically FINAL?  → `isSceneOutputFinal()`
 *   3. Is B's continuity input stale / dirty?   → `isContinuityStale()`,
 *                                                 `needsContinuityRerender()`
 *
 * HARD RULES:
 *   • STRICTLY PURE. No Supabase, no DB, no network, no writes. Callers load
 *     the data and hand it in. A contract test enforces that.
 *   • Mirrored byte-identically (module body) to
 *     `supabase/functions/_shared/continuity-state.ts` — a parity test compares
 *     both files and the SQL mirror in the migration.
 *
 * Finality matters because a lip-sync scene materialises its provider PLATE
 * into `clip_url` long before the mux produces the finished output. The plate
 * is an intermediate result: it must never propagate staleness to dependents
 * and must never be bound as a continuity input.
 */

/** Engines that opt a scene into lip-sync even without the boolean flag. */
const OPT_IN_ENGINES = new Set(['cinematic-sync', 'sync-segments', 'native-dialogue']);

export interface SceneFinalityInput {
  lip_sync_with_voiceover?: boolean | null;
  dialog_mode?: unknown;
  engine_override?: string | null;
  clip_url?: string | null;
  processed_video_url?: string | null;
  lip_sync_status?: string | null;
  // camelCase tolerance — the client scene model uses these.
  lipSyncWithVoiceover?: boolean | null;
  dialogMode?: unknown;
  engineOverride?: string | null;
  clipUrl?: string | null;
  processedVideoUrl?: string | null;
  lipSyncStatus?: string | null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Mirror of `isLipSyncIntentionalRow()` — duplicated here (not imported) so
 * this module stays free of edge-function/client import asymmetry. The parity
 * test pins both definitions against each other.
 */
export function isLipSyncIntentional(scene: SceneFinalityInput | null | undefined): boolean {
  if (!scene) return false;
  const s = scene;
  if ((s.lip_sync_with_voiceover ?? s.lipSyncWithVoiceover) === true) return true;
  if ((s.dialog_mode ?? s.dialogMode) === true) return true;
  return OPT_IN_ENGINES.has(String(s.engine_override ?? s.engineOverride ?? ''));
}

/**
 * Is the currently materialised output the SEMANTICALLY FINAL one?
 *
 * - lip-sync intent → only once `processed_video_url` exists (mux done).
 * - everything else → the base plate in `clip_url` is the final output.
 */
export function isSceneOutputFinal(scene: SceneFinalityInput | null | undefined): boolean {
  if (!scene) return false;
  const processed = str(scene.processed_video_url ?? scene.processedVideoUrl);
  const clip = str(scene.clip_url ?? scene.clipUrl);
  return isLipSyncIntentional(scene) ? processed !== null : clip !== null;
}

/**
 * NULL-safe, non-sticky staleness: B is stale when the continuity source it
 * was bound to differs from A's current effective output. Returning to the old
 * URL clears it again — this is a state, not a latch.
 */
export function isContinuityStale(
  storedSource: string | null | undefined,
  currentEffectiveUrl: string | null | undefined,
): boolean {
  const stored = str(storedSource);
  if (stored === null) return false;
  return stored !== str(currentEffectiveUrl);
}

export interface EverRenderedInput {
  /** Primary, reset-proof truth (`composer_scenes.first_rendered_at`). */
  firstRenderedAt?: string | null;
  /** Integrity fallback — caller loads it, this module never queries. */
  completedPlateAttemptExists?: boolean;
  /** Compatibility branch for unmigrated legacy rows. */
  legacyEffectiveUrl?: string | null;
}

export function sceneWasEverRendered(input: EverRenderedInput | null | undefined): boolean {
  if (!input) return false;
  if (str(input.firstRenderedAt) !== null) return true;
  if (input.completedPlateAttemptExists === true) return true;
  return str(input.legacyEffectiveUrl) !== null;
}

export interface RerenderInput {
  everRendered: boolean;
  /** The continuity source B is CONFIGURED with right now. */
  configuredSource?: string | null;
  /** The continuity source B's EXISTING output was actually rendered with. */
  renderedSource?: string | null;
}

/**
 * Reload-proof dirty state: B carries a video, but that video was produced
 * from a different continuity input than the one it is configured with now.
 */
export function needsContinuityRerender(input: RerenderInput | null | undefined): boolean {
  if (!input) return false;
  if (!input.everRendered) return false;
  const configured = str(input.configuredSource);
  if (configured === null) return false;
  return str(input.renderedSource) !== configured;
}
