/**
 * 🚫 LOTTIE DEPRECATED — STUB FILE
 * 
 * Lottie wurde aus dem Universal Video Renderer entfernt.
 * Diese Datei existiert nur noch als No-Op-Stub für Backward-Compat.
 * Neue Visual-Effekte: src/remotion/components/effects/
 */

// Stub type — replaces @remotion/lottie's LottieAnimationData
export type LottieAnimationData = Record<string, any>;

export interface LottieLoadResult {
  data: LottieAnimationData | null;
  source: 'embedded' | 'cdn' | 'fallback';
  error?: string;
}

export const isValidLottieData = (_data: unknown): _data is LottieAnimationData => false;

export const sanitizeForLottiePlayer = (data: unknown): LottieAnimationData | null =>
  (data as any) ?? null;

export const normalizeLottieData = (data: unknown): LottieAnimationData | null =>
  (data as any) ?? null;

export const loadPremiumLottie = async (
  _key: string,
  _brandColor?: string
): Promise<LottieLoadResult> => ({ data: null, source: 'fallback', error: 'Lottie deprecated' });
