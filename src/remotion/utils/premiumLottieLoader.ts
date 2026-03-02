/**
 * Premium Lottie Loader - Phase 5.2
 * 
 * Optimized loading system for premium character animations with:
 * - Memory caching for instant subsequent loads
 * - Priority-based loading (local → premium CDN → standard CDN → embedded)
 * - Error handling with automatic fallback
 * - Brand color injection support
 */

import { LottieAnimationData } from '@remotion/lottie';
import { staticFile } from 'remotion';

// ============================================
// LOTTIE DATA VALIDATION
// ============================================
export const isValidLottieData = (data: unknown): data is LottieAnimationData => {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  // Minimum valid Lottie: must have version string and layers array
  if (typeof obj.v !== 'string' && typeof obj.v !== 'number') return false;
  if (!Array.isArray(obj.layers)) return false;
  // layers must have at least one entry
  if (obj.layers.length === 0) return false;
  // Normalize optional array fields to prevent downstream .length crashes
  if (obj.assets !== undefined && !Array.isArray(obj.assets)) return false;
  if (obj.markers !== undefined && !Array.isArray(obj.markers)) return false;
  if (obj.fonts !== undefined && typeof obj.fonts !== 'object') return false;
  return true;
};

/**
 * Normalize Lottie data: ensure optional arrays exist to prevent runtime crashes.
 */
export const normalizeLottieData = (data: LottieAnimationData): LottieAnimationData => {
  const normalized = { ...data } as Record<string, unknown>;
  if (!Array.isArray(normalized.assets)) normalized.assets = [];
  if (!Array.isArray(normalized.markers)) normalized.markers = [];
  if (!Array.isArray(normalized.layers)) normalized.layers = [];
  return normalized as LottieAnimationData;
};

/**
 * sanitizeForLottiePlayer — STRICT pre-render gate for <Lottie />.
 * Returns sanitized data if safe to render, or null if the data is too broken.
 * This prevents the `Cannot read properties of undefined (reading 'length')` crash
 * inside lottie-web when `layers`, `assets`, or `markers` are missing/malformed.
 */
export const sanitizeForLottiePlayer = (data: unknown): LottieAnimationData | null => {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Must have a version
  if (typeof obj.v !== 'string' && typeof obj.v !== 'number') return null;

  // layers MUST be an array — this is the #1 crash path
  if (!Array.isArray(obj.layers)) {
    // Try to recover: if layers is undefined/null, set empty array
    // but this means the animation is effectively blank
    console.warn('[sanitizeForLottiePlayer] layers missing or not an array — rejecting');
    return null;
  }

  // Must have at least one layer to be renderable
  if (obj.layers.length === 0) {
    console.warn('[sanitizeForLottiePlayer] layers is empty — rejecting');
    return null;
  }

  // Ensure every layer has required fields that lottie-web accesses
  for (let i = 0; i < obj.layers.length; i++) {
    const layer = obj.layers[i];
    if (!layer || typeof layer !== 'object') {
      console.warn(`[sanitizeForLottiePlayer] layer[${i}] is not an object — rejecting`);
      return null;
    }
    // lottie-web accesses layer.shapes?.length, layer.ks, etc.
    // Ensure shapes is an array if present
    if ('shapes' in layer && !Array.isArray((layer as any).shapes)) {
      (layer as any).shapes = [];
    }
  }

  // Normalize optional arrays
  const sanitized = { ...obj } as Record<string, unknown>;
  if (!Array.isArray(sanitized.assets)) sanitized.assets = [];
  if (!Array.isArray(sanitized.markers)) sanitized.markers = [];
  // Ensure fonts.list is an array if fonts object exists
  if (sanitized.fonts && typeof sanitized.fonts === 'object') {
    const fonts = sanitized.fonts as Record<string, unknown>;
    if (!Array.isArray(fonts.list)) fonts.list = [];
  }

  return sanitized as LottieAnimationData;
};

// ============================================
// IN-MEMORY CACHE FOR LOTTIE ANIMATIONS
// ============================================
const animationCache = new Map<string, LottieAnimationData>();
const loadingPromises = new Map<string, Promise<LottieAnimationData | null>>();

// ============================================
// PREMIUM CDN SOURCES (Higher quality than standard)
// ============================================
export const PREMIUM_LOTTIE_SOURCES = {
  // Premium character animations - curated for business explainer videos
  presenter: {
    idle: [
      'https://lottie.host/embed/5a8d5b5e-5b5e-4b5e-8b5e-5b5e5b5e5b5e/idle.json',
      'https://assets1.lottiefiles.com/packages/lf20_v92spkya.json',
    ],
    waving: [
      'https://lottie.host/embed/waving-premium/waving.json',
      'https://assets2.lottiefiles.com/packages/lf20_gq4ni7gw.json',
      'https://assets4.lottiefiles.com/packages/lf20_svy4ivvy.json',
    ],
    thinking: [
      'https://lottie.host/embed/thinking-premium/thinking.json',
      'https://assets5.lottiefiles.com/packages/lf20_xyadoh9h.json',
      'https://assets3.lottiefiles.com/packages/lf20_k86wxpga.json',
    ],
    celebrating: [
      'https://lottie.host/embed/celebrating-premium/celebrating.json',
      'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
      'https://assets1.lottiefiles.com/packages/lf20_rovf9gzu.json',
    ],
    explaining: [
      'https://lottie.host/embed/explaining-premium/explaining.json',
      'https://assets7.lottiefiles.com/packages/lf20_v1yudlrx.json',
      'https://assets5.lottiefiles.com/packages/lf20_tutvdkg0.json',
    ],
    pointing: [
      'https://lottie.host/embed/pointing-premium/pointing.json',
      'https://assets9.lottiefiles.com/packages/lf20_yvbfj8j4.json',
      'https://assets6.lottiefiles.com/packages/lf20_zlrpnoxj.json',
    ],
    talking: [
      'https://lottie.host/embed/talking-premium/talking.json',
      'https://assets6.lottiefiles.com/packages/lf20_uk3jnmkq.json',
      'https://assets2.lottiefiles.com/packages/lf20_j1adxtyb.json',
    ],
  },
};

// ============================================
// LOADING RESULT TYPE
// ============================================
export interface LottieLoadResult {
  data: LottieAnimationData;
  source: 'local' | 'premium-cdn' | 'cdn' | 'embedded';
  cached: boolean;
}

// ============================================
// FETCH WITH TIMEOUT
// ============================================
const fetchWithTimeout = async (url: string, timeoutMs: number = 5000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// ============================================
// LOAD FROM LOCAL FILE
// ============================================
const loadFromLocal = async (action: string): Promise<LottieAnimationData | null> => {
  try {
    const localPath = staticFile(`/lottie/characters/presenter-${action}.json`);
    const response = await fetchWithTimeout(localPath, 3000);
    
    if (response.ok) {
      const data = await response.json();
      if (!isValidLottieData(data)) {
        console.warn(`⚠️ Invalid local Lottie data for: ${action}`);
        return null;
      }
      console.log(`✅ Loaded premium local Lottie: ${action}`);
      return data;
    }
  } catch (e) {
    // Local file not found - this is expected
  }
  return null;
};

// ============================================
// LOAD FROM CDN SOURCES
// ============================================
const loadFromCDN = async (action: string): Promise<{ data: LottieAnimationData; isPremium: boolean } | null> => {
  const sources = PREMIUM_LOTTIE_SOURCES.presenter[action as keyof typeof PREMIUM_LOTTIE_SOURCES.presenter] || [];
  
  for (let i = 0; i < sources.length; i++) {
    const url = sources[i];
    try {
      const response = await fetchWithTimeout(url, 4000);
      if (response.ok) {
        const data = await response.json();
        if (!isValidLottieData(data)) {
          console.warn(`⚠️ Invalid CDN Lottie data: ${url}`);
          continue;
        }
        console.log(`✅ Loaded Lottie from CDN (${i === 0 ? 'premium' : 'standard'}): ${action}`);
        return { data, isPremium: i === 0 };
      }
    } catch (e) {
      console.log(`⚠️ CDN source failed: ${url}`);
    }
  }
  
  return null;
};

// ============================================
// LAMBDA DETECTION
// ============================================
/**
 * Detect if running in AWS Lambda / serverless context.
 * In Lambda, CDN fetches are unreliable and slow — always use embedded.
 */
const isLambdaEnvironment = (): boolean => {
  try {
    // Lambda sets AWS_LAMBDA_FUNCTION_NAME, LAMBDA_TASK_ROOT, etc.
    return typeof process !== 'undefined' && (
      !!(process.env?.AWS_LAMBDA_FUNCTION_NAME) ||
      !!(process.env?.LAMBDA_TASK_ROOT) ||
      !!(process.env?.AWS_EXECUTION_ENV)
    );
  } catch {
    return false;
  }
};

// ============================================
// MAIN LOADER FUNCTION
// ============================================
export const loadPremiumLottie = async (
  action: string,
  getEmbeddedFallback: () => LottieAnimationData
): Promise<LottieLoadResult> => {
  const cacheKey = `presenter-${action}`;
  
  // 1. Check cache first
  const cached = animationCache.get(cacheKey);
  if (cached) {
    return { data: cached, source: 'embedded', cached: true };
  }
  
  // ✅ LAMBDA SHORTCUT: In Lambda, ALWAYS use embedded (no CDN, no local file fetch)
  // This prevents timeout/network errors that can cascade into render crashes.
  if (isLambdaEnvironment()) {
    console.log(`⚡ Lambda detected — using embedded Lottie directly: ${action}`);
    const embeddedData = normalizeLottieData(getEmbeddedFallback());
    animationCache.set(cacheKey, embeddedData);
    return { data: embeddedData, source: 'embedded', cached: false };
  }
  
  // 2. Check if already loading
  const existingPromise = loadingPromises.get(cacheKey);
  if (existingPromise) {
    const result = await existingPromise;
    if (result) {
      return { data: result, source: 'cdn', cached: true };
    }
  }
  
  // 3. Start loading process (browser/preview only)
  const loadPromise = (async (): Promise<LottieAnimationData | null> => {
    // Try local file first
    const localData = await loadFromLocal(action);
    if (localData) {
      const normalized = normalizeLottieData(localData);
      animationCache.set(cacheKey, normalized);
      return normalized;
    }
    
    // Try CDN sources
    const cdnResult = await loadFromCDN(action);
    if (cdnResult) {
      const normalized = normalizeLottieData(cdnResult.data);
      animationCache.set(cacheKey, normalized);
      return normalized;
    }
    
    return null;
  })();
  
  loadingPromises.set(cacheKey, loadPromise);
  
  try {
    const result = await loadPromise;
    if (result) {
      return { data: result, source: 'cdn', cached: false };
    }
  } finally {
    loadingPromises.delete(cacheKey);
  }
  
  // 4. Use embedded fallback (100% reliable) - also normalize!
  console.log(`📦 Using embedded Lottie fallback: ${action}`);
  const embeddedData = normalizeLottieData(getEmbeddedFallback());
  animationCache.set(cacheKey, embeddedData);
  return { data: embeddedData, source: 'embedded', cached: false };
};

// ============================================
// PRELOAD ANIMATIONS
// ============================================
export const preloadPremiumAnimations = async (
  actions: string[],
  getEmbeddedFallback: (action: string) => LottieAnimationData
): Promise<void> => {
  await Promise.all(
    actions.map(action => 
      loadPremiumLottie(action, () => getEmbeddedFallback(action))
    )
  );
};

// ============================================
// CLEAR CACHE
// ============================================
export const clearLottieCache = (): void => {
  animationCache.clear();
  loadingPromises.clear();
};

// ============================================
// GET CACHE STATUS
// ============================================
export const getLottieCacheStatus = (): { size: number; keys: string[] } => {
  return {
    size: animationCache.size,
    keys: Array.from(animationCache.keys()),
  };
};
