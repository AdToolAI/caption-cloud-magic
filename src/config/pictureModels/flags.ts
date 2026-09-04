/**
 * Feature flags for Picture Studio models.
 *
 * Rule: no provider or model becomes runnable in the production UI before one
 * real end-to-end test (wallet debit, refund, media library, download) passed.
 * Until then its flag stays out of this list — the model card can still be
 * shown as "coming soon", but it cannot be executed.
 */
export const ENABLED_PICTURE_FLAGS: string[] = [
  // Validated 2026-09-05 against real runs: predicted provider cost matched
  // the units Replicate actually billed (upscale tiers, 1 unit each for
  // dust & scratch and colorization); wallet debit and library row verified.
  'picture.enhance.topaz_upscale',
  'picture.enhance.topaz_restore',
  'picture.enhance.topaz_colorize',
];

export function isFlagEnabled(flag?: string): boolean {
  return !!flag && ENABLED_PICTURE_FLAGS.includes(flag);
}
