/**
 * Client mirror of the server's premium-capability classifier
 * (`supabase/functions/_shared/video-enhance-premium.ts`).
 *
 * Display/UX only. The server decides authoritatively with the same rules and
 * the one existing subscription entitlement helper; this mirror merely spares
 * non-entitled customers a request that would be refused anyway.
 */

export type PremiumCode =
  | 'TOPAZ_PREMIUM_REQUIRED'
  | 'VCUBE_PRO_PREMIUM_REQUIRED'
  | 'VCUBE_120FPS_PREMIUM_REQUIRED';

export interface PremiumRequirement {
  code: PremiumCode;
  fallbackModelId?: string;
  fallbackTier?: 'standard';
  fallbackFps?: number;
}

export const PREMIUM_FPS_THRESHOLD = 60;

export const PREMIUM_ERROR_CODES: PremiumCode[] = [
  'TOPAZ_PREMIUM_REQUIRED',
  'VCUBE_PRO_PREMIUM_REQUIRED',
  'VCUBE_120FPS_PREMIUM_REQUIRED',
];

export function premiumCapabilityRequired(input: {
  provider: string;
  tier?: string | null;
  fps?: number | null;
}): PremiumRequirement | null {
  if (input.provider === 'topaz') {
    return { code: 'TOPAZ_PREMIUM_REQUIRED', fallbackModelId: 'bytedance-vcube' };
  }
  if (input.tier === 'pro') {
    return { code: 'VCUBE_PRO_PREMIUM_REQUIRED', fallbackTier: 'standard' };
  }
  if (typeof input.fps === 'number' && input.fps > PREMIUM_FPS_THRESHOLD) {
    return { code: 'VCUBE_120FPS_PREMIUM_REQUIRED', fallbackFps: PREMIUM_FPS_THRESHOLD };
  }
  return null;
}

export function isPremiumErrorCode(code?: string | null): code is PremiumCode {
  return !!code && (PREMIUM_ERROR_CODES as string[]).includes(code);
}
