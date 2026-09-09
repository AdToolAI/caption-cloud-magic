/**
 * Content Command Center + Social Connections premium gate.
 *
 * Access rule:
 *   can_use_content_command_center = active_subscription || creator_account
 *   can_use_social_connections     = active_subscription || creator_account
 *
 * There is exactly ONE entitlement truth source in this codebase —
 * `subscription-entitlement.ts`, the same helper Topaz / vCube Premium,
 * Text Studio and Picture Studio use. Never add a second premium system.
 *
 * Existing connections are never deleted when a subscription lapses; only the
 * creation of NEW connections is blocked here.
 */

import { fetchSubscriptionEntitlement } from "./subscription-entitlement.ts";

export const SOCIAL_CONNECTIONS_PREMIUM_REQUIRED = "SOCIAL_CONNECTIONS_PREMIUM_REQUIRED";
export const COMMAND_CENTER_PREMIUM_REQUIRED = "COMMAND_CENTER_PREMIUM_REQUIRED";

export const SOCIAL_CONNECTIONS_PREMIUM_MESSAGE =
  "Connecting social accounts is included with Beta Basic and Creator accounts. Please upgrade to connect a new account.";

/** Explicit validation accounts, same env switch as Video Enhance. */
export function isSocialPremiumTestUser(
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
 * True when the user may use the Content Command Center / create social
 * connections. Must be called BEFORE any OAuth URL is issued or any token is
 * stored — a direct API call cannot bypass the UI gate.
 */
export async function isSocialPremiumEntitled(
  admin: { from: (table: string) => any },
  userId: string,
  env: (key: string) => string | undefined,
): Promise<boolean> {
  if (isSocialPremiumTestUser(env, userId)) return true;
  const entitlement = await fetchSubscriptionEntitlement(
    admin,
    userId,
    env("STRIPE_SECRET_KEY"),
  );
  return entitlement.entitled;
}

/** Standard 403 payload for a blocked social-connection attempt. */
export function socialPremiumDeniedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: SOCIAL_CONNECTIONS_PREMIUM_MESSAGE,
      code: SOCIAL_CONNECTIONS_PREMIUM_REQUIRED,
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
