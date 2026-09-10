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
 * Canonical LIST per-second price for a model — or `null` when the canonical
 * catalog does not know the id.
 *
 * There is deliberately NO local fallback table any more: a stale per-function
 * price table charged a different amount than the UI preview showed. When the
 * catalog cannot price a model, the request must fail closed
 * (`pricingUnavailableResponse`) instead of billing an invented rate.
 *
 * IMPORTANT: the account discount is applied by the `deduct_ai_video_credits`
 * and `refund_ai_video_credits` RPCs (they multiply by
 * `get_ai_discount_factor(user)`), so callers must pass the LIST price — a
 * discount applied here as well would be charged twice over.
 */
export async function resolveAccountCostPerSecond(
  _supabaseAdmin: { from: (t: string) => any },
  _userId: string,
  modelId: string,
  currency: "EUR" | "USD",
): Promise<number | null> {
  const base = resolveCostPerSecond(modelId, currency);
  if (base == null || !Number.isFinite(base) || base <= 0) return null;
  // Same rounding as `pricing-catalog`, so the deduction equals the preview.
  return Math.round(base * 100) / 100;
}

/** Fail-closed answer when no canonical price exists — never a guessed rate. */
export function pricingUnavailableResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error:
        "Pricing is temporarily unavailable for this model. No generation was started and nothing was charged.",
      code: "PRICING_UNAVAILABLE",
    }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}


/**
 * Wallet currency for the account — the currency the deduction actually runs
 * in. MUST be read with the service-role client: the wallet table only lets a
 * user read their own row, and an anon client without the caller's login gets
 * an empty result. The old `|| "EUR"` fallback turned that failed read into a
 * silent EUR charge on USD wallets (~13% under-billing), so there is no
 * fallback here — `null` means fail closed.
 */
export async function resolveWalletCurrency(
  supabaseAdmin: { from: (t: string) => any },
  userId: string,
): Promise<"EUR" | "USD" | null> {
  const { data, error } = await supabaseAdmin
    .from("ai_video_wallets")
    .select("currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.currency) return null;
  return data.currency === "USD" ? "USD" : "EUR";
}
