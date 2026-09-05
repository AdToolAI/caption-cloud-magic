/**
 * Three-stage unlocking for Video Enhance.
 *
 *   1. frontend flag  — visibility only (this file)
 *   2. backend switch — authoritative, lives in the edge function environment
 *   3. test allowlist — real runs before the global rollout
 *
 * Both models start locked. A flag is only added here after the release gates
 * in the plan (real provider run, predicted vs. actual cost, exactly one
 * release on failure, persistence retry) passed.
 */
export const ENABLED_VIDEO_ENHANCE_FLAGS: string[] = [];

export function isVideoEnhanceFlagEnabled(flag?: string): boolean {
  return !!flag && ENABLED_VIDEO_ENHANCE_FLAGS.includes(flag);
}

/**
 * Provider entitlements verified through a real run on the AdTool provider
 * account. ByteDance `pro` is an ENTITLEMENT, not a user-facing choice: until
 * it appears here it is offered nowhere.
 */
export const VERIFIED_PROVIDER_ENTITLEMENTS: string[] = [];

export function isEntitlementVerified(modelId: string, tier: string): boolean {
  return VERIFIED_PROVIDER_ENTITLEMENTS.includes(`${modelId}:${tier}`);
}
