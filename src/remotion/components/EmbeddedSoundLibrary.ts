/**
 * 🔊 SOUND EFFECT LIBRARY
 * Uses real HTTP URLs from Supabase Storage for Lambda compatibility.
 * Base64 data URIs crash Lambda's ffprobe — never use them in render paths.
 */

// ============================================
// SOUND EFFECT TYPE DEFINITIONS
// ============================================

export type SoundEffectType = 
  | 'whoosh' 
  | 'pop' 
  | 'success' 
  | 'alert' 
  | 'click' 
  | 'swoosh' 
  | 'chime';

export interface SoundEffect {
  type: SoundEffectType;
  volume: number;
  startTime: number;
  duration: number;
}

// ============================================
// SUPABASE STORAGE URLs (Lambda-safe, ffprobe-compatible)
// ============================================

const STORAGE_BASE = 'https://lbunafpxuskwmsrraqxl.supabase.co/storage/v1/object/public/audio-assets/sound-effects';

const STORAGE_SOUND_URLS: Record<SoundEffectType, string> = {
  whoosh: `${STORAGE_BASE}/whoosh.mp3`,
  pop: `${STORAGE_BASE}/pop.mp3`,
  success: `${STORAGE_BASE}/success.mp3`,
  alert: `${STORAGE_BASE}/alert.mp3`,
  click: `${STORAGE_BASE}/click.mp3`,
  swoosh: `${STORAGE_BASE}/swoosh.mp3`,
  chime: `${STORAGE_BASE}/chime.mp3`,
};

// ============================================
// GET SOUND URL WITH FALLBACK CHAIN
// ============================================

export async function getSoundUrl(type: SoundEffectType): Promise<string> {
  // Try CDN URLs first
  const urls = CDN_SOUND_URLS[type];
  
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return url;
      }
    } catch (e) {
      console.log(`CDN URL failed for ${type}: ${url}`);
    }
  }
  
  // Fallback to embedded Base64
  console.log(`Using embedded fallback for ${type}`);
  return EMBEDDED_FALLBACKS[type];
}

// ============================================
// SCENE TYPE TO SOUND EFFECT MAPPING
// ============================================

export function getSoundEffectsForScene(
  sceneType: string, 
  sceneStartTime: number,
  sceneDuration: number
): SoundEffect[] {
  const effects: SoundEffect[] = [];
  
  switch (sceneType) {
    case 'hook':
      effects.push({
        type: 'whoosh',
        volume: 0.4,
        startTime: sceneStartTime,
        duration: 0.3,
      });
      break;
      
    case 'problem':
      effects.push({
        type: 'alert',
        volume: 0.3,
        startTime: sceneStartTime + 0.5,
        duration: 0.4,
      });
      break;
      
    case 'solution':
      effects.push({
        type: 'success',
        volume: 0.5,
        startTime: sceneStartTime + 0.3,
        duration: 0.5,
      });
      effects.push({
        type: 'chime',
        volume: 0.3,
        startTime: sceneStartTime + sceneDuration - 1,
        duration: 0.6,
      });
      break;
      
    case 'feature':
      effects.push({
        type: 'pop',
        volume: 0.35,
        startTime: sceneStartTime + 0.2,
        duration: 0.2,
      });
      break;
      
    case 'proof':
      effects.push({
        type: 'swoosh',
        volume: 0.3,
        startTime: sceneStartTime,
        duration: 0.25,
      });
      break;
      
    case 'cta':
      effects.push({
        type: 'chime',
        volume: 0.5,
        startTime: sceneStartTime + 0.5,
        duration: 0.6,
      });
      effects.push({
        type: 'click',
        volume: 0.4,
        startTime: sceneStartTime + sceneDuration - 0.5,
        duration: 0.1,
      });
      break;
  }
  
  return effects;
}

// ============================================
// SYNC SOUND URL GETTER (for immediate use)
// ============================================

export function getSoundUrlSync(type: SoundEffectType): string {
  // Always return embedded first for sync usage (guaranteed to work)
  return EMBEDDED_FALLBACKS[type];
}

// ============================================
// PRELOAD ALL SOUNDS
// ============================================

export async function preloadAllSounds(): Promise<Map<SoundEffectType, string>> {
  const soundMap = new Map<SoundEffectType, string>();
  const types: SoundEffectType[] = ['whoosh', 'pop', 'success', 'alert', 'click', 'swoosh', 'chime'];
  
  await Promise.all(
    types.map(async (type) => {
      const url = await getSoundUrl(type);
      soundMap.set(type, url);
    })
  );
  
  return soundMap;
}

export default {
  getSoundUrl,
  getSoundUrlSync,
  getSoundEffectsForScene,
  preloadAllSounds,
  EMBEDDED_FALLBACKS,
  CDN_SOUND_URLS,
};
