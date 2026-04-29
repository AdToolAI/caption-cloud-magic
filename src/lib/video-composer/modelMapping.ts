/**
 * Composer ↔ AI Video Toolkit Model Mapping
 * --------------------------------------------------------------
 * The Video Composer scene record stores `clipSource` (e.g. `ai-hailuo`)
 * + `clipQuality` (`standard` | `pro`). The Toolkit ModelSelector deals in
 * granular `modelId` strings (e.g. `hailuo-pro`, `veo-3.1-fast`).
 *
 * This module bridges both worlds and exposes:
 *   - `COMPOSER_AVAILABLE_MODELS` — every toolkit model the composer's
 *     backend (`compose-video-clips`) actually supports, plus a synthetic
 *     entry for the static `ai-image` source.
 *   - `modelIdToSource()` and `sourceToModelId()` for round-tripping.
 *   - `getDefaultModelIdForCategory()` — sensible defaults per composer mode.
 */

import { Image as ImageIcon } from 'lucide-react';
import { AI_VIDEO_TOOLKIT_MODELS, type ToolkitModel } from '@/config/aiVideoModelRegistry';
import type { ClipSource, ClipQuality, ComposerCategory } from '@/types/video-composer';

/** Toolkit families that compose-video-clips can actually render. */
const COMPOSER_FAMILIES = new Set(['hailuo', 'kling', 'wan', 'seedance', 'luma', 'veo', 'runway', 'pika', 'vidu']);

/** Synthetic toolkit entry for the static "Gemini Image + Ken-Burns" source. */
const IMAGE_TOOLKIT_MODEL: ToolkitModel = {
  id: 'composer-image-gemini',
  name: 'Gemini Image + Ken-Burns',
  provider: 'Google',
  family: 'wan', // unused for image; family must satisfy the union
  edgeFunction: 'generate-image-gemini',
  group: 'fast',
  icon: ImageIcon,
  capabilities: { t2v: false, i2v: false, audio: false },
  durations: [3, 5, 8],
  resolution: '1024×1024',
  aspectRatios: ['16:9', '9:16', '1:1'],
  costPerSecond: { EUR: 0.02, USD: 0.02 },
  badge: 'Bild',
  tagline: 'Statisches KI-Bild mit Ken-Burns-Effekt',
  legacyRoute: '/picture-studio',
};

/** All models exposed in the per-scene composer dropdown. */
export const COMPOSER_AVAILABLE_MODELS: ToolkitModel[] = [
  ...AI_VIDEO_TOOLKIT_MODELS.filter((m) => COMPOSER_FAMILIES.has(m.family)),
  IMAGE_TOOLKIT_MODEL,
];

/** Map a toolkit modelId → composer (clipSource, clipQuality). */
export function modelIdToSource(modelId: string): { clipSource: ClipSource; clipQuality: ClipQuality } {
  if (modelId === IMAGE_TOOLKIT_MODEL.id) {
    return { clipSource: 'ai-image', clipQuality: 'standard' };
  }
  const m = AI_VIDEO_TOOLKIT_MODELS.find((x) => x.id === modelId);
  if (!m) return { clipSource: 'ai-hailuo', clipQuality: 'standard' };

  const family = m.family;
  // Quality is encoded in the suffix. Anything containing "pro" → pro tier.
  const quality: ClipQuality = /pro/i.test(modelId) ? 'pro' : 'standard';

  const clipSource: ClipSource = (() => {
    switch (family) {
      case 'hailuo':   return 'ai-hailuo';
      case 'kling':    return 'ai-kling';
      case 'veo':      return 'ai-veo';
      case 'wan':      return 'ai-wan';
      case 'luma':     return 'ai-luma';
      case 'seedance': return 'ai-seedance';
      case 'sora':     return 'ai-veo'; // Sora 2 Sunset → Veo 3.1 fallback
      case 'runway':   return 'ai-runway';
      case 'pika':     return 'ai-pika';
      default:         return 'ai-hailuo';
    }
  })();

  return { clipSource, clipQuality: quality };
}

/** Map a composer (clipSource, clipQuality) → toolkit modelId for the dropdown. */
export function sourceToModelId(clipSource: ClipSource, clipQuality: ClipQuality = 'standard'): string {
  if (clipSource === 'ai-image') return IMAGE_TOOLKIT_MODEL.id;

  const familyMap: Partial<Record<ClipSource, ToolkitModel['family']>> = {
    'ai-hailuo':   'hailuo',
    'ai-kling':    'kling',
    'ai-veo':      'veo',
    'ai-wan':      'wan',
    'ai-luma':     'luma',
    'ai-seedance': 'seedance',
    // 'ai-sora' entfernt — Sora 2 Sunset 2026
    'ai-runway':   'runway',
    'ai-pika':     'pika',
  };
  const family = familyMap[clipSource];
  if (!family) return COMPOSER_AVAILABLE_MODELS[0].id;

  // Pick the first matching family entry whose id matches the quality tier.
  const candidates = COMPOSER_AVAILABLE_MODELS.filter((m) => m.family === family);
  const wantPro = clipQuality === 'pro';
  const pick = candidates.find((m) => /pro/i.test(m.id) === wantPro) ?? candidates[0];
  return pick?.id ?? COMPOSER_AVAILABLE_MODELS[0].id;
}

/** Sensible default modelId per composer category. */
export function getDefaultModelIdForCategory(category: ComposerCategory | string | undefined): string {
  switch (category) {
    case 'storytelling':  return 'kling-3-standard';
    case 'corporate-ad':  return 'veo-3.1-fast';
    case 'product-ad':    return 'hailuo-standard';
    default:              return 'hailuo-standard';
  }
}
