/**
 * Platform-wide AI discount helpers (Creator accounts).
 *
 * The authoritative discount is applied server-side inside the database
 * deduction functions. These helpers exist so the UI computes exactly the
 * same number and price previews never diverge from the actual charge.
 */

/** Clamp any stored/received percentage into a valid 0..100 integer. */
export function normalizeDiscountPercent(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

/** Multiplier applied to a list price (e.g. 40% off -> 0.6). */
export function discountFactor(percent: unknown): number {
  return (100 - normalizeDiscountPercent(percent)) / 100;
}

/** Effective price for an account, rounded to cents like the DB does. */
export function applyAiDiscount(listAmount: number, percent: unknown): number {
  const amount = Number.isFinite(listAmount) ? Math.max(listAmount, 0) : 0;
  return Math.round(amount * discountFactor(percent) * 100) / 100;
}
