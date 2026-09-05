/**
 * Three-stage unlocking for Video Enhance.
 *
 *   1. frontend flag / kill-switch — visibility only (this file)
 *   2. backend switch — authoritative, lives in the edge function environment
 *   3. test allowlist — validation-only switches (e.g. fail-once persistence)
 *
 * Topaz Video Upscale and ByteDance vCube are GLOBAL LIVE: they no longer
 * depend on a feature flag or the allowlist. Both switch layers are kept on
 * purpose as the emergency stop — a model can be pulled instantly by adding it
 * to `DISABLED_VIDEO_ENHANCE_MODELS` (frontend) and/or by setting its backend
 * switch to `false` (authoritative). Calibration status is NEVER a reason.
 */
export const ENABLED_VIDEO_ENHANCE_FLAGS: string[] = [];

export function isVideoEnhanceFlagEnabled(flag?: string): boolean {
  return !!flag && ENABLED_VIDEO_ENHANCE_FLAGS.includes(flag);
}

/**
 * Emergency stop. Only a real P0 issue, a financial-integrity defect or a
 * critical provider failure may put a model id in here.
 */
export const DISABLED_VIDEO_ENHANCE_MODELS: string[] = [];

export function isVideoEnhanceModelKilled(modelId: string): boolean {
  return DISABLED_VIDEO_ENHANCE_MODELS.includes(modelId);
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
