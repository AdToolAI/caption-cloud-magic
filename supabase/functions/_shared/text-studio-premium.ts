/**
 * Text Studio premium gate.
 *
 * The whole Text Studio (chat + compare) is subscription-only. There is exactly
 * ONE entitlement truth source in this codebase — `subscription-entitlement.ts`,
 * the same helper Topaz / vCube Premium use. Never add a second premium system.
 */

import { fetchSubscriptionEntitlement } from "./subscription-entitlement.ts";

export const TEXT_STUDIO_PREMIUM_REQUIRED = "TEXT_STUDIO_PREMIUM_REQUIRED";

export const TEXT_STUDIO_PREMIUM_MESSAGE =
  "AI Text Studio is included in every paid plan. Please upgrade to use the models.";

/** Explicit validation accounts, same env switch as Video Enhance. */
export function isTextStudioTestUser(
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
 * Returns true when the user may use Text Studio. Must be called BEFORE any
 * provider request or conversation write — a direct API call cannot bypass
 * the UI gate.
 */
export async function isTextStudioEntitled(
  admin: { from: (table: string) => any },
  userId: string,
  env: (key: string) => string | undefined,
): Promise<boolean> {
  if (isTextStudioTestUser(env, userId)) return true;
  const entitlement = await fetchSubscriptionEntitlement(
    admin,
    userId,
    env("STRIPE_SECRET_KEY"),
  );
  return entitlement.entitled;
}
