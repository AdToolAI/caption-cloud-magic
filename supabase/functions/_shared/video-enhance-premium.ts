/**
 * Which Video Enhance capabilities are subscription-gated.
 *
 * This is a pure classifier — it never decides entitlement. The single
 * authoritative subscription truth source stays `subscription-entitlement.ts`;
 * there is deliberately no second premium system and no `isPremium` flag on
 * models or runs.
 *
 * Premium capabilities:
 *   - the whole Topaz engine
 *   - ByteDance vCube `processing_type = pro`
 *   - ByteDance vCube `target_fps = 120`
 *
 * vCube Standard at 24 / 30 / 60 fps stays free for everyone.
 */

export type PremiumCode =
  | "TOPAZ_PREMIUM_REQUIRED"
  | "VCUBE_PRO_PREMIUM_REQUIRED"
  | "VCUBE_120FPS_PREMIUM_REQUIRED";

export interface PremiumRequirement {
  code: PremiumCode;
  error: string;
  /** What a non-entitled customer can run instead, without losing the clip. */
  fallbackModelId?: string;
  fallbackTier?: "standard";
  fallbackFps?: number;
}

export interface PremiumCapabilityInput {
  provider: string;
  tier?: string | null;
  fps?: number | null;
}

export const PREMIUM_FPS_THRESHOLD = 60;

export function premiumCapabilityRequired(
  input: PremiumCapabilityInput,
): PremiumRequirement | null {
  if (input.provider === "topaz") {
    return {
      code: "TOPAZ_PREMIUM_REQUIRED",
      error: "Topaz Video AI is a Premium feature.",
      fallbackModelId: "bytedance-vcube",
    };
  }

  if (input.tier === "pro") {
    return {
      code: "VCUBE_PRO_PREMIUM_REQUIRED",
      error: "Pro processing quality is a Premium feature.",
      fallbackTier: "standard",
    };
  }

  if (typeof input.fps === "number" && input.fps > PREMIUM_FPS_THRESHOLD) {
    return {
      code: "VCUBE_120FPS_PREMIUM_REQUIRED",
      error: "High frame rate above 60 fps is a Premium feature.",
      fallbackFps: PREMIUM_FPS_THRESHOLD,
    };
  }

  return null;
}
