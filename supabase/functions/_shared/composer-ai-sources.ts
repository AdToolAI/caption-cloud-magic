/**
 * AI video sources implemented by compose-video-clips.
 *
 * This registry is intentionally independent from the lip-sync rollout gate:
 * a source can be implemented by the composer while still requiring an
 * additional feature check before it may be used as a lip-sync master plate.
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
  "ai-pika",
  "ai-happyhorse",
  "ai-image",
]);

export function isSupportedComposerAiSource(source: string): boolean {
  return SUPPORTED_COMPOSER_AI_SOURCES.has(source);
}