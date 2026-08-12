import { tx } from "@/lib/i18nText";
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
import { isSupportedComposerClipSource } from './supportedComposerSources';
import {
  DIALOG_MASTER_PROVIDERS,
  LIPSYNC_PRIMARY_PROVIDER,
  LIPSYNC_SECONDARY_PROVIDER,
  isLipsyncCertifiedProvider,
} from './lipsyncMasterProvider';

/** Toolkit families that compose-video-clips can actually render. */
const COMPOSER_FAMILIES = new Set(['hailuo', 'kling', 'wan', 'seedance', 'luma', 'veo', 'runway', 'happyhorse']);

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
  badge: tx({ de: 'Bild', en: 'Image', es: 'Imagen' }),
  tagline: tx({ de: 'Statisches KI-Bild mit Ken-Burns-Effekt', en: 'Static AI image with Ken Burns effect', es: 'Imagen estática de IA con efecto Ken Burns' }),
  legacyRoute: '/picture-studio',
};

/** All models exposed in the per-scene composer dropdown. */
export const COMPOSER_AVAILABLE_MODELS: ToolkitModel[] = [
  ...AI_VIDEO_TOOLKIT_MODELS.filter(
    (m) =>
      COMPOSER_FAMILIES.has(m.family) &&
      // v425: only expose models whose clip source the backend truly renders.
      // Previously unsupported sources (ai-vidu, ai-kling-omni, ai-pika) were
      // silently rewritten to Hailuo inside compose-video-clips.
      isSupportedComposerClipSource(modelIdToSource(m.id).clipSource),
  ),
  IMAGE_TOOLKIT_MODEL,
];

/**
 * Clip sources whose underlying provider family is certified for the
 * Cinematic-Sync / Lip-Sync pipeline (Sync.so lipsync-2-pro overlay on top
 * of an i2v master plate). Per July 2026 expansion the allowlist covers
 * six providers — HappyHorse (primary, 3–15s), Hailuo (fallback, 6/10s),
 * Kling (3–15s), Wan (3–10s), Seedance (3–12s) and Luma Ray 2 (5/9s).
 * All other providers (Veo, Sora, Pika, Runway, Vidu, Grok) remain fully
 * usable for B-roll / non-lipsync scenes but are hidden from the picker
 * the moment the user enables Dialog & Lip-Sync.
 */
export const LIPSYNC_PRIMARY_CLIP_SOURCE: ClipSource = LIPSYNC_PRIMARY_PROVIDER;
export const LIPSYNC_FALLBACK_CLIP_SOURCE: ClipSource = LIPSYNC_SECONDARY_PROVIDER;
/**
 * v425 — derived from the certified list in `lipsyncMasterProvider.ts`.
 * Certifying a new provider = edit that file (plus the backend mirror).
 */
export const LIPSYNC_CLIP_SOURCES: ReadonlyArray<ClipSource> = DIALOG_MASTER_PROVIDERS;

/** @deprecated v425 — the certified list is no longer flag-gated. */
export function lipsyncClipSources(_seedance25Enabled?: boolean): ReadonlyArray<ClipSource> {
  return LIPSYNC_CLIP_SOURCES;
}

/**
 * Legacy alias — kept so existing imports (RenderPreFlightDialog, etc.)
 * keep working. Now mirrors LIPSYNC_CLIP_SOURCES.
 */
export const NATIVE_DIALOGUE_CLIP_SOURCES: ReadonlyArray<ClipSource> = LIPSYNC_CLIP_SOURCES;

const LIPSYNC_CERTIFIED_SOURCES = new Set<string>(LIPSYNC_CLIP_SOURCES);


/**
 * Composer dropdown models filtered to the Lip-Sync-certified subset
 * (HappyHorse standard/pro + Hailuo standard/pro). Order matters — primary
 * provider first so the ModelSelector pre-selects HappyHorse.
 */
export const COMPOSER_DIALOG_MODELS: ToolkitModel[] = COMPOSER_AVAILABLE_MODELS
  .filter((m) => LIPSYNC_CERTIFIED_SOURCES.has(modelIdToSource(m.id).clipSource))
  .sort((a, b) => {
    // HappyHorse (primary) before Hailuo (fallback); standard before pro.
    const fam = (x: ToolkitModel) =>
      modelIdToSource(x.id).clipSource === LIPSYNC_PRIMARY_CLIP_SOURCE ? 0 : 1;
    if (fam(a) !== fam(b)) return fam(a) - fam(b);
    return /pro/i.test(a.id) ? 1 : -1;
  });

/** @deprecated v425 — the dialog picker is no longer flag-gated. */
export function composerDialogModels(_seedance25Enabled?: boolean): ToolkitModel[] {
  return COMPOSER_DIALOG_MODELS;
}

/** Default (cheapest, most flexible) lip-sync provider preselected when the toggle flips ON. */
export const DIALOG_FALLBACK_CLIP_SOURCE: ClipSource = LIPSYNC_PRIMARY_CLIP_SOURCE;
export const DIALOG_FALLBACK_CLIP_QUALITY: ClipQuality = 'standard';

/** True iff the engine override puts the scene through the Sync.so pipeline. */
export function isLipsyncEngine(engine: string | null | undefined): boolean {
  return engine === 'cinematic-sync' || engine === 'sync-segments';
}

/** True iff the given clip source is allowed when Lip-Sync is active. */
export function isLipsyncClipSource(src: string | null | undefined): boolean {
  return isLipsyncCertifiedProvider(src);
}


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
      case 'kling':    return modelId === 'kling-omni' ? 'ai-kling-omni' : 'ai-kling';
      case 'veo':      return 'ai-veo';
      case 'wan':      return 'ai-wan';
      case 'luma':     return 'ai-luma';
      case 'seedance': return modelId === 'seedance-2-5' ? 'ai-seedance25' : 'ai-seedance';
      case 'sora':     return 'ai-veo'; // Sora 2 Sunset → Veo 3.1 fallback
      case 'runway':   return 'ai-runway';
      case 'pika':     return 'ai-pika';
      case 'vidu':     return 'ai-vidu';
      case 'happyhorse': return 'ai-happyhorse';
      default:         return 'ai-hailuo';
    }
  })();

  return { clipSource, clipQuality: quality };
}

/** Map a composer (clipSource, clipQuality) → toolkit modelId for the dropdown. */
export function sourceToModelId(clipSource: ClipSource, clipQuality: ClipQuality = 'standard'): string {
  if (clipSource === 'ai-image') return IMAGE_TOOLKIT_MODEL.id;
  // Seedance 2.5 runs on its own ModelArk path — no quality tiers.
  if (clipSource === 'ai-seedance25') return 'seedance-2-5';

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
    'ai-vidu':     'vidu',
    'ai-happyhorse': 'happyhorse',
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
    case 'storytelling':  return 'kling-3';
    case 'corporate-ad':  return 'veo-3.1-fast';
    case 'product-ad':    return 'hailuo-standard';
    default:              return 'hailuo-standard';
  }
}
