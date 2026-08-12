/**
 * v425 — Frontend mirror of the clip sources that `compose-video-clips`
 * actually implements (see `supabase/functions/_shared/composer-ai-sources.ts`).
 *
 * The composer model picker is built from this list, so a user can never
 * select a provider the backend would silently rewrite to another one.
 * Keep both files in sync when a new engine is implemented.
 */
export const SUPPORTED_COMPOSER_CLIP_SOURCES: ReadonlySet<string> = new Set([
  'ai-hailuo',
  'ai-kling',
  'ai-wan',
  'ai-seedance',
  'ai-seedance25',
  'ai-luma',
  'ai-veo',
  'ai-runway',
  'ai-happyhorse',
  'ai-image',
]);

export function isSupportedComposerClipSource(source: string | null | undefined): boolean {
  return !!source && SUPPORTED_COMPOSER_CLIP_SOURCES.has(source);
}
