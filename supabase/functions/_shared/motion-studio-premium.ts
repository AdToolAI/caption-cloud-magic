/**
 * Motion Studio premium gate.
 *
 * Access rule:
 *   can_use_motion_studio = active_subscription || creator_account
 *
 * There is exactly ONE entitlement truth source in this codebase —
 * `subscription-entitlement.ts`, the same helper Topaz / vCube Premium,
 * Text Studio, Picture Studio and the Content Command Center use.
 * Never add a second premium system.
 *
 * What this gate blocks for a non-entitled user:
 *   - creating new Motion Studio projects / scenes
 *   - editing scenes, uploading scene assets
 *   - starting any generation, render or render-queue job
 *
 * What it never touches:
 *   - existing projects, assets, job history (kept, read-only)
 *   - billing, credits, refunds, storage, orchestration
 */

import { fetchSubscriptionEntitlement } from "./subscription-entitlement.ts";

export const MOTION_STUDIO_PREMIUM_REQUIRED = "MOTION_STUDIO_PREMIUM_REQUIRED";

export const MOTION_STUDIO_PREMIUM_MESSAGE =
  "Motion Studio is included with Beta Basic and Creator accounts. Your existing projects stay saved — upgrade to keep creating and rendering.";

/** Explicit validation accounts, same env switch as Video Enhance. */
export function isMotionStudioTestUser(
  env: (key: string) => string | undefined,
  userId?: string,
): boolean {
  const allowlist = (env("VIDEO_ENHANCE_TEST_USER_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return !!userId && allowlist.includes(userId);
}

/**
 * True when the user may create / edit / render in Motion Studio.
 * Must be called BEFORE any credit reservation, wallet mutation, provider
 * submission or billable job creation — a direct API call must not bypass
 * the UI gate.
 */
export async function isMotionStudioEntitled(
  admin: { from: (table: string) => any },
  userId: string,
  env: (key: string) => string | undefined,
): Promise<boolean> {
  if (isMotionStudioTestUser(env, userId)) return true;
  const entitlement = await fetchSubscriptionEntitlement(
    admin,
    userId,
    env("STRIPE_SECRET_KEY"),
  );
  return entitlement.entitled;
}

/** Standard 403 payload for a blocked Motion Studio action. */
export function motionStudioPremiumDeniedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: MOTION_STUDIO_PREMIUM_MESSAGE,
      code: MOTION_STUDIO_PREMIUM_REQUIRED,
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Convenience wrapper for the edge functions: resolves the gate and returns a
 * ready 403 Response when the user is not entitled, otherwise `null`.
 * Internal service-role dispatches (no end-user id) are never gated here —
 * they are always preceded by a gated user-facing entry point.
 */
export async function motionStudioGate(
  admin: { from: (table: string) => any },
  userId: string | null | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!userId) return null;
  const entitled = await isMotionStudioEntitled(
    admin,
    userId,
    (key) => Deno.env.get(key) ?? undefined,
  );
  return entitled ? null : motionStudioPremiumDeniedResponse(corsHeaders);
}
