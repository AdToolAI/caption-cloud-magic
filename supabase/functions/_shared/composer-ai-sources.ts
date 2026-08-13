import { LIPSYNC_CERTIFIED_SOURCES } from "./provider-matrix.ts";

/**
 * AI video sources implemented by compose-video-clips.
 *
 * Mirror of `src/lib/video-composer/supportedComposerSources.ts` — keep both
 * in sync. An unsupported source must never be silently rewritten to another
 * provider; the composer fails loudly instead (v425).
 */
export const SUPPORTED_COMPOSER_AI_SOURCES = new Set([
  "ai-hailuo",
  "ai-kling",
  "ai-wan",
  "ai-seedance",
  "ai-seedance25",
  "ai-luma",
  "ai-veo",
  "ai-runway",
  "ai-happyhorse",
  "ai-image",
]);

export function isSupportedComposerAiSource(source: string): boolean {
  return SUPPORTED_COMPOSER_AI_SOURCES.has(source);
}

/**
 * v425 — Lip-Sync contract. Only these providers may serve as a master plate
 * for the Cinematic-Sync / Sync.so pipeline. Mirror of
 * `src/lib/video-composer/lipsyncMasterProvider.ts`.
 */
export const LIPSYNC_CERTIFIED_AI_SOURCES = new Set<string>(LIPSYNC_CERTIFIED_SOURCES);

export const LIPSYNC_PRIMARY_AI_SOURCE = "ai-happyhorse";

export function isLipsyncCertifiedAiSource(source: string | null | undefined): boolean {
  return !!source && LIPSYNC_CERTIFIED_AI_SOURCES.has(source);
}
