/**
 * Picture Studio premium gate.
 *
 * Subscription = ACCESS to specialist models and professional enhance.
 * Credits = actual usage (unchanged: pricing, wallet, refunds, history).
 *
 * There is exactly ONE entitlement truth source in this codebase —
 * `subscription-entitlement.ts`, the same helper Topaz Video Enhance and the
 * Text Studio use. Never add a second premium system.
 */

import { fetchSubscriptionEntitlement } from "./subscription-entitlement.ts";

export const PICTURE_SPECIALIST_PREMIUM_REQUIRED = "PICTURE_SPECIALIST_PREMIUM_REQUIRED";
export const PICTURE_ENHANCE_PREMIUM_REQUIRED = "PICTURE_ENHANCE_PREMIUM_REQUIRED";

/** Image tiers that require an active subscription. */
export const PICTURE_SPECIALIST_TIERS = ["fast", "pro", "ultra", "flux"] as const;

/** Enhance models that require an active subscription (Clarity stays free). */
export const PICTURE_PREMIUM_ENHANCE_MODELS = [
  "topaz-image-upscale",
  "topaz-dust-scratch",
  "topaz-colorization",
] as const;

/** Free fallbacks offered in the upgrade dialog. */
export const PICTURE_FALLBACK_TIER = "gptimage";
export const PICTURE_FALLBACK_ENHANCE_MODEL = "clarity-pro";

export function isSpecialistTier(tier?: string | null): boolean {
  return !!tier && (PICTURE_SPECIALIST_TIERS as readonly string[]).includes(tier);
}

export function isPremiumEnhanceModel(modelId?: string | null): boolean {
  return !!modelId && (PICTURE_PREMIUM_ENHANCE_MODELS as readonly string[]).includes(modelId);
}

/** Explicit validation accounts, same env switch as Video Enhance. */
export function isPictureStudioTestUser(
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
 * Returns true when the user may run premium Picture Studio capabilities.
 * Must be called BEFORE pricing, wallet mutation, provider submission and any
 * billable job creation — a direct API call cannot bypass the UI gate.
 */
export async function isPictureStudioPremiumEntitled(
  admin: { from: (table: string) => any },
  userId: string,
  env: (key: string) => string | undefined,
): Promise<boolean> {
  if (isPictureStudioTestUser(env, userId)) return true;
  const entitlement = await fetchSubscriptionEntitlement(
    admin,
    userId,
    env("STRIPE_SECRET_KEY"),
  );
  return entitlement.entitled;
}
