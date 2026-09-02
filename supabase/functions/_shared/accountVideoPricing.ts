/**
 * accountVideoPricing — single source of truth for what a user is actually charged.
 *
 * The UI preview reads `pricing-catalog`, which returns the canonical catalog
 * price with the account's `profiles.ai_discount_percent` already applied.
 * Several generate-*-video functions historically carried their own, stale
 * MODEL_PRICING tables, so the deducted amount could differ from the preview.
 * Every video function must resolve its price through this helper so the
 * preview and the deduction are identical by construction.
 */

import { resolveCostPerSecond } from "./videoPricingCatalog.ts";

export async function resolveAccountDiscountFactor(
  supabaseAdmin: { from: (t: string) => any },
  userId: string,
): Promise<number> {
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("ai_discount_percent")
      .eq("id", userId)
      .maybeSingle();
    const pct = Number(data?.ai_discount_percent ?? 0);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return 1;
    return (100 - pct) / 100;
  } catch {
    return 1;
  }
}

/**
 * Effective per-second price for this account.
 * `fallbackPerSecond` is only used when the model is missing from the catalog.
 */
export async function resolveAccountCostPerSecond(
  supabaseAdmin: { from: (t: string) => any },
  userId: string,
  modelId: string,
  currency: "EUR" | "USD",
  fallbackPerSecond: number,
): Promise<number> {
  const base = resolveCostPerSecond(modelId, currency) ?? fallbackPerSecond;
  const factor = await resolveAccountDiscountFactor(supabaseAdmin, userId);
  return +(base * factor).toFixed(4);
}
