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
    name: 'Topaz Video Upscale',
    vendor: 'Topaz Labs',
    provider: 'replicate',
    providerModelId: 'topazlabs/video-upscale',
    providerSchemaRef: 'replicate/topazlabs-video-upscale@972107c4',
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
        hint: {
          en: 'The model has one processing path; quality follows the target output',
          de: 'Das Modell hat einen Verarbeitungsweg; die Qualität folgt dem Zielformat',
          es: 'El modelo tiene una sola vía de procesado; la calidad sigue al formato de salida',
        },
        suitedFor: ['camera', 'ugc'],
      },
    ],
    // Exactly the documented rows of the official schema and price table.
    outputs: [
      { resolution: '720p', fps: [30, 60] },
      { resolution: '1080p', fps: [30, 60] },
      { resolution: '4k', fps: [30, 60] },
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
