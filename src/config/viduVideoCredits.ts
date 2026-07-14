/**
 * Vidu Q2 Pricing Reference
 * --------------------------------------------------------------
 * Vidu Q2 from Shengshu AI — distinguishing feature: Reference2V mode
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
    name: 'Vidu Q2 Reference',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.66,
    flatCostUSD: 0.66,
    fixedDuration: 5,
    maxReferences: 7,
    description: 'Bis zu 7 Referenzbilder (Character + Produkt + Location) in einer 5s-Szene',
    badge: 'Multi-Ref',
  },
  'vidu-q2-i2v': {
    name: 'Vidu Q2 Image-to-Video',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.60,
    flatCostUSD: 0.60,
    fixedDuration: 5,
    description: 'Animiert ein Standbild zu einem 5s-Clip',
    badge: 'I2V',
  },
  'vidu-q2-t2v': {
    name: 'Vidu Q2 Text-to-Video',
    provider: 'Shengshu AI (Replicate)',
    flatCostEUR: 0.60,
    flatCostUSD: 0.60,
    fixedDuration: 5,
    description: '5s Clip aus reinem Prompt',
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
