import type { VideoEnhanceModelDefinition } from './types';

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
    providerModelId: 'bytedance/vcube',
    providerSchemaRef: 'replicate/bytedance-vcube@2026-09',
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
        id: 'restoration',
        label: { en: 'Restoration', de: 'Restaurierung', es: 'Restauración' },
        hint: {
          en: 'Old, damaged or very low-quality sources',
          de: 'Alte, beschädigte oder sehr schwache Quellen',
          es: 'Fuentes antiguas, dañadas o de baja calidad',
        },
        suitedFor: ['archive'],
      },
    ],
    outputs: [
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30] },
    ],
    outputsByMode: {
      // Restoration runs heavier; the published schema caps it below 4K/30.
      restoration: [
        { resolution: '1080p', fps: [24, 30] },
        { resolution: '2k', fps: [24, 30] },
      ],
    },
    qualityTiers: ['standard', 'pro'],
    entitlementTiers: ['pro'],
    minDurationSeconds: 1,
    maxDurationSeconds: 60,
    typicalProcessingSeconds: [60, 420],
    enabled: false,
    featureFlag: 'video.enhance.bytedance_vcube',
    backendFlag: 'VIDEO_ENHANCE_BYTEDANCE_ENABLED',
  },
  {
    id: 'topaz-video-upscale',
    name: 'Topaz Video Upscale',
    vendor: 'Topaz Labs',
    provider: 'replicate',
    providerModelId: 'topazlabs/video-upscale',
    providerSchemaRef: 'replicate/topazlabs-video-upscale@2026-09',
    positioning: {
      en: 'Best for camera footage and 4K mastering',
      de: 'Am besten für Kameramaterial und 4K-Mastering',
      es: 'Ideal para material de cámara y masterización en 4K',
    },
    description: {
      en: 'Highest fidelity upscaling for real camera footage, up to a 4K master.',
      de: 'Höchste Detailtreue für echtes Kameramaterial, bis zum 4K-Master.',
      es: 'Escalado de máxima fidelidad para material real de cámara, hasta un máster 4K.',
    },
    bestFor: [
      { en: 'Camera uploads', de: 'Kamera-Uploads', es: 'Grabaciones de cámara' },
      { en: 'YouTube 4K masters', de: 'YouTube-4K-Master', es: 'Másteres 4K para YouTube' },
    ],
    capabilities: ['upscale', 'fps_interpolation'],
    processingModes: [
      {
        id: 'standard',
        label: { en: 'Standard', de: 'Standard', es: 'Estándar' },
        suitedFor: ['camera', 'ugc'],
      },
      {
        id: 'high_fidelity',
        label: { en: 'High fidelity', de: 'Hohe Detailtreue', es: 'Alta fidelidad' },
        hint: {
          en: 'Clean, well-exposed source material',
          de: 'Sauberes, gut belichtetes Ausgangsmaterial',
          es: 'Material limpio y bien expuesto',
        },
        suitedFor: ['camera'],
      },
    ],
    // Conservative: only what the current official schema documents.
    outputs: [
      { resolution: '1080p', fps: [24, 30, 60] },
      { resolution: '2k', fps: [24, 30, 60] },
      { resolution: '4k', fps: [24, 30, 60] },
    ],
    qualityTiers: ['standard'],
    minDurationSeconds: 1,
    maxDurationSeconds: 120,
    typicalProcessingSeconds: [120, 900],
    enabled: false,
    featureFlag: 'video.enhance.topaz_video_upscale',
    backendFlag: 'VIDEO_ENHANCE_TOPAZ_ENABLED',
  },
];
