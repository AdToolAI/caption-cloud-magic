import { tx } from "@/lib/i18nText";
/**
 * Vidu Pricing Reference (IDs heißen weiterhin q2-*, laufen real auf Vidu Q3)
 * --------------------------------------------------------------
 * Vidu Q3 from Shengshu AI — distinguishing feature: Reference2V mode
 * accepts up to 7 reference images (character + product + location +
 * style + props) and blends them into one consistent 5-second clip.
 *
 * Pricing is FLAT per generation (5s fixed), not per-second.
 * The cost-per-second numbers below exist only for UI parity with
 * other providers (= flat / 5).
 */

// Margin policy: exactly 3.00× Replicate flat cost (normalized 14.07.2026)
// Ref: $0.22/clip → €0.66 | I2V/T2V: $0.20/clip → €0.60
export const VIDU_VIDEO_MODELS = {
  'vidu-q2-reference': {
    name: 'Vidu Q3 Reference',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.43,
    flatCostUSD: 0.43,
    fixedDuration: 5,
    maxReferences: 7,
    description: tx({ de: 'Bis zu 7 Referenzbilder (Character + Produkt + Location) in einer 5s-Szene', en: 'Up to 7 reference images (character + product + location) in a 5s scene', es: 'Hasta 7 imágenes de referencia (personaje + producto + ubicación) en una escena de 5 segundos' }),
    badge: 'Multi-Ref',
  },
  'vidu-q2-i2v': {
    name: 'Vidu Q3 Image-to-Video',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.39,
    flatCostUSD: 0.39,
    fixedDuration: 5,
    description: tx({ de: 'Animiert ein Standbild zu einem 5s-Clip', en: 'Animates a still image into a 5s clip', es: 'Anima una imagen fija en un clip de 5 segundos.' }),
    badge: 'I2V',
  },
  'vidu-q2-t2v': {
    name: 'Vidu Q3 Text-to-Video',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.39,
    flatCostUSD: 0.39,
    fixedDuration: 5,
    description: tx({ de: '5s Clip aus reinem Prompt', en: '5s clip from pure prompt', es: 'Clip de 5 segundos de Pure Prompt' }),
    badge: 'T2V',
  },
} as const;

export type ViduVideoModelId = keyof typeof VIDU_VIDEO_MODELS;

export const VIDU_REFERENCE_ROLES = [
  { id: 'character', labelDE: 'Charakter', labelEN: 'Character', labelES: 'Personaje' },
  { id: 'product',   labelDE: 'Produkt',   labelEN: 'Product',   labelES: 'Producto' },
  { id: 'location',  labelDE: 'Location',  labelEN: 'Location',  labelES: 'Ubicación' },
  { id: 'style',     labelDE: 'Style',     labelEN: 'Style',     labelES: 'Estilo' },
  { id: 'prop',      labelDE: 'Requisite', labelEN: 'Prop',      labelES: 'Atrezo' },
] as const;

export type ViduReferenceRole = typeof VIDU_REFERENCE_ROLES[number]['id'];
