import { tx } from "@/lib/i18nText";
/**
 * Vidu display reference (IDs heißen weiterhin q2-*, laufen real auf Vidu Q3)
 * --------------------------------------------------------------
 * PREISE STEHEN HIER NICHT. Der einzige Preis-Ursprung ist der kanonische
 * Katalog (`src/lib/cost/videoPricingCatalog.ts` bzw. sein Deno-Spiegel).
 * Die früheren `flatCost*`-Felder (0,39–0,43 € pro Clip) stammten aus einer
 * alten Pauschal-Logik und lagen materiell unter dem echten Sekundentarif —
 * sie sind entfernt, damit sie nirgends mehr als Fallback auftauchen können.
 *
 * Vidu Q3 auf Replicate akzeptiert genau EIN Bild (`start_image`, optional mit
 * `end_image`). Es gibt keinen nativen Multi-Reference-Input.
 */

export const VIDU_VIDEO_MODELS = {
  'vidu-q2-reference': {
    name: 'Vidu Q3 Reference',
    provider: 'Shengshu AI (Replicate)',
    fixedDuration: 5,
    maxReferences: 1,
    description: tx({ de: 'Ein Referenzbild als Startframe, optional mit Endframe', en: 'One reference image as the start frame, optionally with an end frame', es: 'Una imagen de referencia como fotograma inicial, opcionalmente con fotograma final' }),
    badge: 'Start+End',
  },
  'vidu-q2-i2v': {
    name: 'Vidu Q3 Image-to-Video',
    provider: 'Shengshu AI (Replicate)',
    fixedDuration: 5,
    description: tx({ de: 'Animiert ein Standbild zu einem Clip', en: 'Animates a still image into a clip', es: 'Anima una imagen fija en un clip' }),
    badge: 'I2V',
  },
  'vidu-q2-t2v': {
    name: 'Vidu Q3 Text-to-Video',
    provider: 'Shengshu AI (Replicate)',
    fixedDuration: 5,
    description: tx({ de: 'Clip aus reinem Prompt', en: 'Clip from a pure prompt', es: 'Clip a partir de un prompt' }),
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
