import { TOPAZ_VIDEO_MODEL_VIEWS } from './topazCatalog';
import type { ProcessingModeDefinition, VideoEnhanceModelDefinition } from './types';

/**
 * Topaz "processing modes" are real MODELS, not presets. The catalogue mirror
 * is the single source of truth for which ones the express endpoint accepts.
 */
const TOPAZ_MODES: ProcessingModeDefinition[] = TOPAZ_VIDEO_MODEL_VIEWS.map((model) => ({
  id: model.id,
  label: model.label,
  hint: model.hint,
  suitedFor:
    model.specialty === 'cgi'
      ? ['ai_generated']
      : model.specialty === 'legacy'
        ? ['archive']
        : model.specialty === 'denoise' || model.specialty === 'deblur'
          ? ['ugc']
          : ['camera', 'ugc'],
}));

/**
 * Video Enhance registry — V1 ships exactly two engines.
 *
 * Crystal / SeedVR2 and friends are deliberately absent: they are only
 * evaluated once Topaz and ByteDance are measured on real AdTool clips, and
 * only if they cover a clearly distinguishable quality band.
 *
 * Every combination table below is taken from ONE provider schema version
 * (`providerSchemaRef`). Values from older model versions are never merged in.
 */
export const VIDEO_ENHANCE_MODELS: VideoEnhanceModelDefinition[] = [
  {
    id: 'bytedance-vcube',
    name: 'ByteDance vCube',
    vendor: 'ByteDance',
    provider: 'replicate',
    providerModelId: 'bytedance/video-upscaler',
    providerSchemaRef: 'replicate/bytedance-video-upscaler@2026-09-05',
    positioning: {
      en: 'Best for AI-generated and social footage',
      de: 'Am besten für KI-generiertes und Social-Material',
      es: 'Ideal para material generado por IA y para redes',
    },
    description: {
      en: 'Restores detail in generated and compressed video without inventing a new look.',
      de: 'Holt Details aus generiertem und stark komprimiertem Video zurück, ohne den Look zu verändern.',
      es: 'Recupera detalle en vídeo generado y comprimido sin cambiar el estilo.',
    },
    bestFor: [
      { en: 'Seedance / AI clips', de: 'Seedance- und KI-Clips', es: 'Clips de Seedance e IA' },
      { en: 'Reels and TikTok', de: 'Reels und TikTok', es: 'Reels y TikTok' },
    ],
    capabilities: ['upscale', 'fps_interpolation', 'aigc_enhance', 'ugc_enhance', 'restoration'],
    processingModes: [
      {
        id: 'aigc',
        label: { en: 'AI footage', de: 'KI-Material', es: 'Material de IA' },
        hint: {
          en: 'Tuned for generated video',
          de: 'Abgestimmt auf generiertes Video',
          es: 'Ajustado para vídeo generado',
        },
        suitedFor: ['ai_generated'],
      },
      {
        id: 'short_series',
        label: { en: 'Short drama', de: 'Kurzserie', es: 'Serie corta' },
        hint: {
          en: 'Tuned for short-form drama',
          de: 'Abgestimmt auf kurze Serienformate',
          es: 'Ajustado para series cortas',
        },
        suitedFor: ['ai_generated', 'camera'],
      },
      {
        id: 'ugc',
        label: { en: 'Phone / social footage', de: 'Handy- und Social-Material', es: 'Material de móvil y redes' },
        hint: {
          en: 'Removes compression artefacts',
          de: 'Entfernt Kompressionsartefakte',
          es: 'Elimina artefactos de compresión',
        },
        suitedFor: ['ugc', 'camera'],
      },
      {
        id: 'old_film',
        label: { en: 'Film restoration', de: 'Filmrestaurierung', es: 'Restauración de película' },
        hint: {
          en: 'Old, damaged or very low-quality sources',
          de: 'Alte, beschädigte oder sehr schwache Quellen',
          es: 'Fuentes antiguas, dañadas o de baja calidad',
        },
        suitedFor: ['archive'],
      },
      {
        id: 'common',
        label: { en: 'General', de: 'Allgemein', es: 'General' },
        hint: {
          en: 'Everything else',
          de: 'Alles Übrige',
          es: 'Todo lo demás',
        },
        suitedFor: ['camera', 'ugc'],
      },
    ],
    outputs: [
      { resolution: '720p', fps: [24, 30, 60] },
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    qualityTiers: ['standard', 'pro'],
    entitlementTiers: ['pro'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    typicalProcessingSeconds: [60, 420],
    // GLOBAL LIVE. `featureFlag` and the backend switch stay in place as the
    // kill-switch; calibration status never gates a run.
    enabled: true,
    featureFlag: 'video.enhance.bytedance_vcube',
    backendFlag: 'VIDEO_ENHANCE_BYTEDANCE_ENABLED',
  },
  {
    id: 'topaz-video-upscale',
    name: 'Topaz Video AI',
    vendor: 'Topaz Labs',
    // Direct Topaz Labs API — no reseller in between. That is what unlocks the
    // explicit output geometry (true portrait 4K) and the full parameter set.
    provider: 'replicate',
    providerModelId: 'prob-4',
    providerSchemaRef: 'topaz/video-express@2026-09-07',
    positioning: {
      en: 'Best for camera footage and 4K mastering',
      de: 'Am besten für Kameramaterial und 4K-Mastering',
      es: 'Ideal para material de cámara y masterización en 4K',
    },
    description: {
      en: 'Highest fidelity upscaling for real camera footage, up to a 4K master in any orientation.',
      de: 'Höchste Detailtreue für echtes Kameramaterial, bis zum 4K-Master – quer wie hochkant.',
      es: 'Escalado de máxima fidelidad para material real de cámara, hasta un máster 4K en cualquier orientación.',
    },
    bestFor: [
      { en: 'Camera uploads', de: 'Kamera-Uploads', es: 'Grabaciones de cámara' },
      { en: 'YouTube 4K masters', de: 'YouTube-4K-Master', es: 'Másteres 4K para YouTube' },
    ],
    capabilities: ['upscale', 'fps_interpolation', 'restoration'],
    processingModes: TOPAZ_MODES,
    // The direct API takes an explicit output width/height, so every label and
    // every documented frame rate is reachable in both orientations.
    outputs: [
      { resolution: '720p', fps: [24, 30, 60] },
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    qualityTiers: ['standard'],
    minDurationSeconds: 1,
    maxDurationSeconds: 120,
    typicalProcessingSeconds: [120, 900],
    // GLOBAL LIVE. Kill-switch retained (see the ByteDance entry above).
    enabled: true,
    featureFlag: 'video.enhance.topaz_video_upscale',
    backendFlag: 'VIDEO_ENHANCE_TOPAZ_ENABLED',
  },
];

