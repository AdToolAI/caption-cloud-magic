/**
 * Client mirror of the server's Picture Studio premium gate
 * (`supabase/functions/_shared/picture-studio-premium.ts`).
 *
 * Display/UX only. The server decides authoritatively with the same lists and
 * the one existing subscription entitlement helper; this mirror merely spares
 * non-entitled customers a request that would be refused anyway.
 */

export const PICTURE_SPECIALIST_PREMIUM_REQUIRED = 'PICTURE_SPECIALIST_PREMIUM_REQUIRED';
export const PICTURE_ENHANCE_PREMIUM_REQUIRED = 'PICTURE_ENHANCE_PREMIUM_REQUIRED';

export const PICTURE_SPECIALIST_TIERS = ['fast', 'pro', 'ultra', 'flux'] as const;

export const PICTURE_PREMIUM_ENHANCE_MODELS = [
  'topaz-image-upscale',
  'topaz-dust-scratch',
  'topaz-colorization',
] as const;

export const PICTURE_FALLBACK_TIER = 'gptimage';
export const PICTURE_FALLBACK_ENHANCE_MODEL = 'clarity-pro';

export function isSpecialistTier(tier?: string | null): boolean {
  return !!tier && (PICTURE_SPECIALIST_TIERS as readonly string[]).includes(tier);
}

export function isPremiumEnhanceModel(modelId?: string | null): boolean {
  return !!modelId && (PICTURE_PREMIUM_ENHANCE_MODELS as readonly string[]).includes(modelId);
}
