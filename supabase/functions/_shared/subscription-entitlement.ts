/**
 * THE server-side subscription truth source.
 *
 * These are exactly the rules `check-subscription` reports to the client,
 * extracted so that premium features (e.g. Topaz Video Enhance) can enforce
 * the SAME decision authoritatively before any money or provider job moves.
 * There must never be a second, independent premium-access system.
 *
 * Order of the rules (unchanged from check-subscription):
 *   1. account_type === 'creator'            -> entitled (out-of-band access)
 *   2. test_mode_plan set                    -> entitled iff !== 'free'
 *   3. plan !== 'free' AND no stripe customer -> entitled (out-of-band plan)
 *   4. no stripe customer                    -> not entitled
 *   5. otherwise                             -> active Stripe subscription required
 */

export interface EntitlementProfile {
  account_type?: string | null;
  test_mode_plan?: string | null;
  plan?: string | null;
  stripe_customer_id?: string | null;
}

export type EntitlementReason =
  | "creator"
  | "test_mode_plan"
  | "test_mode_free"
  | "out_of_band_plan"
  | "no_customer"
  | "stripe_active"
  | "stripe_inactive"
  | "stale_customer"
  | "no_profile";

export interface EntitlementResult {
  entitled: boolean;
  reason: EntitlementReason;
}

/**
 * Pure decision. `hasActiveStripeSubscription` is only consulted when the
 * profile rules do not already decide, so tests need no Stripe at all.
 */
export async function resolveSubscriptionEntitlement(
  profile: EntitlementProfile | null | undefined,
  hasActiveStripeSubscription?: (customerId: string) => Promise<boolean>,
): Promise<EntitlementResult> {
  if (!profile) return { entitled: false, reason: "no_profile" };

  if (profile.account_type === "creator") {
    return { entitled: true, reason: "creator" };
  }

  if (profile.test_mode_plan) {
    return profile.test_mode_plan !== "free"
      ? { entitled: true, reason: "test_mode_plan" }
      : { entitled: false, reason: "test_mode_free" };
  }

  if (profile.plan && profile.plan !== "free" && !profile.stripe_customer_id) {
    return { entitled: true, reason: "out_of_band_plan" };
  }

  if (!profile.stripe_customer_id) {
    return { entitled: false, reason: "no_customer" };
  }

  if (!hasActiveStripeSubscription) {
    return { entitled: false, reason: "stripe_inactive" };
  }

  try {
    const active = await hasActiveStripeSubscription(profile.stripe_customer_id);
    return active
      ? { entitled: true, reason: "stripe_active" }
      : { entitled: false, reason: "stripe_inactive" };
  } catch (error: any) {
    // Stale customer id (deleted / wrong mode) — same handling as
    // check-subscription: treat as unsubscribed, never as entitled.
    if (error?.code === "resource_missing") {
      return { entitled: false, reason: "stale_customer" };
    }
    throw error;
  }
}

/** Loads the profile and asks Stripe only when the profile rules require it. */
export async function fetchSubscriptionEntitlement(
  admin: { from: (table: string) => any },
  userId: string,
  stripeSecretKey?: string,
): Promise<EntitlementResult> {
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, test_mode_plan, plan, account_type")
    .eq("id", userId)
    .maybeSingle();

  return await resolveSubscriptionEntitlement(
    profile as EntitlementProfile | null,
    stripeSecretKey
      ? async (customerId: string) => {
        const { default: Stripe } = await import("npm:stripe@18.5.0");
        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        return subs.data.length > 0;
      }
      : undefined,
  );
}
