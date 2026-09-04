/**
 * Feature flags for Picture Studio models.
 *
 * Rule: no provider or model becomes runnable in the production UI before one
 * real end-to-end test (wallet debit, refund, media library, download) passed.
 * Until then its flag stays out of this list — the model card can still be
 * shown as "coming soon", but it cannot be executed.
 */
export const ENABLED_PICTURE_FLAGS: string[] = [
  // Topaz stays on the test allowlist until predicted provider cost has been
  // confirmed against a real run (rate cards are official, not yet validated).
];

export function isFlagEnabled(flag?: string): boolean {
  return !!flag && ENABLED_PICTURE_FLAGS.includes(flag);
}
