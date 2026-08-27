/**
 * V517-B — DISPLAY-ONLY OUTPUT RESOLUTION
 *
 * `resolveSceneOutput` answers "which video does this scene currently have?"
 * and it feeds readiness: `legacyClipReadyEquivalentRow` builds on it, and
 * from there `isReadyOrLipsynced` and the whole progress model. It must stay
 * exactly as it is.
 *
 * This module answers a different question — "what should the card show right
 * now?" — and the two only diverge in one case: a rerender has cleared the
 * current-run output and the new run has not replaced it yet, because it
 * paused at the manual-review gate or failed. The scene then has a perfectly
 * good previous result sitting at an immutable `gen-N` key (V518), and before
 * V517-B the card went black.
 *
 * The separation is the entire point. A retained preview must never mean:
 * scene ready, generation complete, provider source, lip-sync input, or a
 * reason to skip work. It is a picture, nothing else — which is why it lives
 * here and not in `resolveSceneOutput`.
 *
 * `upload_url` keeps its existing position INSIDE `resolveSceneOutput`'s
 * chain. It is not reordered and not special-cased here.
 */
import { resolveSceneOutput, type SceneOutputInput } from '@/lib/composer/output/resolveSceneOutput';

export interface SceneDisplayOutputInput extends SceneOutputInput {
  last_good_output_url?: string | null;
  last_good_output_generation?: number | null;
  /** camelCase tolerance — the client scene model uses these. */
  lastGoodOutputUrl?: string | null;
  lastGoodOutputGeneration?: number | null;
}

export interface SceneDisplayOutput {
  /** What to render, or null for no media. */
  url: string | null;
  /** True only when the current run has nothing and this is a previous result. */
  isLastKnownGood: boolean;
  /** Generation that produced a last-known-good URL. Null otherwise. */
  generation: number | null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * PURE — current output first, previous result second, nothing third.
 */
export function resolveSceneDisplayOutput(
  scene: SceneDisplayOutputInput | null | undefined,
): SceneDisplayOutput {
  const current = resolveSceneOutput(scene ?? null).effectiveUrl;
  if (current) {
    return { url: current, isLastKnownGood: false, generation: null };
  }

  const lkg = str(scene?.last_good_output_url ?? scene?.lastGoodOutputUrl);
  if (lkg) {
    const rawGen = scene?.last_good_output_generation ?? scene?.lastGoodOutputGeneration;
    const gen = Number(rawGen);
    return {
      url: lkg,
      isLastKnownGood: true,
      generation: Number.isFinite(gen) && Number.isInteger(gen) ? gen : null,
    };
  }

  return { url: null, isLastKnownGood: false, generation: null };
}

/**
 * Localized marker shown next to a retained preview, so the picture is never
 * mistaken for the current run's result.
 */
export const PREVIOUS_RESULT_LABEL = {
  de: 'Vorheriges Ergebnis',
  en: 'Previous result',
  es: 'Resultado anterior',
} as const;
