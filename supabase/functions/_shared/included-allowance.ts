/**
 * Monthly included usage (subscription / Creator accounts).
 *
 * Included usage is NOT credit balance: it lives in `included_allowances`
 * with its own counters and resets with the Stripe billing period (calendar
 * month for accounts without a Stripe subscription, e.g. Creator accounts).
 *
 * Rules enforced here and in the two SQL routines:
 *   - only successful generations consume an allowance (release on failure)
 *   - retries / duplicate jobs never consume the allowance twice (job_key)
 *   - no rollover, no transfer, no conversion into credits
 *   - once the allowance is used up the normal paid-credit flow resumes
 *
 * The entitlement itself always comes from the single truth source
 * `_shared/subscription-entitlement.ts`.
 */

import { fetchSubscriptionEntitlement } from "./subscription-entitlement.ts";

export type AllowanceKind = "fast_video" | "music";

/** Internal limits — never exposed as provider/cost information publicly. */
export const INCLUDED_FAST_VIDEO_LIMIT = 10;
export const INCLUDED_MUSIC_LIMIT = 50;

export function limitFor(kind: AllowanceKind): number {
  return kind === "fast_video" ? INCLUDED_FAST_VIDEO_LIMIT : INCLUDED_MUSIC_LIMIT;
}

export interface AllowancePeriod {
  start: string;
  end: string;
}

function calendarMonthPeriod(now = new Date()): AllowancePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Billing period of the active Stripe subscription; calendar month when the
 * user has no Stripe subscription (Creator / out-of-band plans).
 */
export async function resolveAllowancePeriod(
  admin: { from: (table: string) => any },
  userId: string,
  stripeSecretKey?: string,
): Promise<AllowancePeriod> {
  if (!stripeSecretKey) return calendarMonthPeriod();
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();
    const customerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;
    if (!customerId) return calendarMonthPeriod();

    const { default: Stripe } = await import("npm:stripe@18.5.0");
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    const sub = subs.data[0] as any;
    if (!sub?.current_period_start || !sub?.current_period_end) return calendarMonthPeriod();
    return {
      start: new Date(sub.current_period_start * 1000).toISOString(),
      end: new Date(sub.current_period_end * 1000).toISOString(),
    };
  } catch (error) {
    console.warn("[included-allowance] period lookup failed, using calendar month", error);
    return calendarMonthPeriod();
  }
}

export interface AllowanceClaim {
  claimed: boolean;
  duplicate: boolean;
  used: number;
  limit: number;
  reason?: "not_entitled" | "exhausted" | "error";
}

interface AdminClient {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}

/**
 * Tries to cover this generation with the monthly included allowance.
 * Returns `claimed: false` whenever the caller must fall back to credits.
 */
export async function claimIncludedAllowance(
  admin: AdminClient,
  userId: string,
  kind: AllowanceKind,
  jobKey: string,
  stripeSecretKey?: string,
): Promise<AllowanceClaim> {
  const limit = limitFor(kind);
  try {
    const entitlement = await fetchSubscriptionEntitlement(admin, userId, stripeSecretKey);
    if (!entitlement.entitled) {
      return { claimed: false, duplicate: false, used: 0, limit, reason: "not_entitled" };
    }

    const period = await resolveAllowancePeriod(admin, userId, stripeSecretKey);
    const { data, error } = await admin.rpc("claim_included_allowance", {
      _user_id: userId,
      _kind: kind,
      _job_key: jobKey,
      _period_start: period.start,
      _period_end: period.end,
      _limit: limit,
    });
    if (error) throw error;

    return {
      claimed: !!data?.claimed,
      duplicate: !!data?.duplicate,
      used: Number(data?.used ?? 0),
      limit,
      reason: data?.claimed ? undefined : "exhausted",
    };
  } catch (error) {
    // Never block a generation because the allowance layer failed — the user
    // simply pays with credits as before.
    console.error("[included-allowance] claim failed", error);
    return { claimed: false, duplicate: false, used: 0, limit, reason: "error" };
  }
}

/** Gives the allowance back after a failed / aborted generation. */
export async function releaseIncludedAllowance(
  admin: AdminClient,
  userId: string,
  kind: AllowanceKind,
  jobKey: string,
): Promise<void> {
  try {
    const { error } = await admin.rpc("release_included_allowance", {
      _user_id: userId,
      _kind: kind,
      _job_key: jobKey,
    });
    if (error) throw error;
  } catch (error) {
    console.error("[included-allowance] release failed", error);
  }
}

/** Deterministic idempotency key for a generation request. */
export async function allowanceJobKey(parts: (string | number | undefined | null)[]): Promise<string> {
  const raw = parts.filter((p) => p !== undefined && p !== null).join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
