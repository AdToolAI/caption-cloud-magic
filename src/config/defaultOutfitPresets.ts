/**
 * Default Outfit Presets — 10 curated, prompt-only outfit fragments used
 * when a cast slot has no library `outfitLookId` selected.
 *
 * Design invariants:
 *  - `promptEN` MUST stay English (Core memory: visual prompts for AI
 *    models remain in English regardless of UI language).
 *  - `labels` are localized for UI only (DE/EN/ES supported; other
 *    languages fall back to EN).
 *  - No DB writes. No effect on `outfitLookId`. Preset selection is
 *    stored on the plan cast slot as `outfitPreset` (the preset id) and
 *    appended as a "Wardrobe: <name> wears <promptEN>" hint to the
 *    scene prompt at apply-time.
 */

export type OutfitPresetId =
  | 'business-formal'
  | 'business-casual'
  | 'smart-casual'
  | 'streetwear'
  | 'creative-modern'
  | 'gym-athleisure'
  | 'outdoor-casual'
  | 'evening-elegant'
  | 'weekend-relaxed'
  | 'tech-founder';

export interface OutfitPreset {
  id: OutfitPresetId;
  /** Localized labels for the dropdown. */
  labels: Record<'de' | 'en' | 'es', string>;
  /** English prompt fragment appended to the scene prompt. */
  promptEN: string;
}

export const DEFAULT_OUTFIT_PRESETS: OutfitPreset[] = [
  {
    id: 'business-formal',
    labels: {
      de: 'Business Formal (Anzug)',
      en: 'Business Formal (Suit)',
      es: 'Formal (Traje)',
    },
    promptEN: 'a tailored dark business suit, crisp white dress shirt, subtle tie, polished leather shoes',
  },
  {
    id: 'business-casual',
    labels: {
      de: 'Business Casual',
      en: 'Business Casual',
      es: 'Business Casual',
    },
    promptEN: 'a neat button-down shirt, chinos, clean leather shoes, no tie',
  },
  {
    id: 'smart-casual',
    labels: {
      de: 'Smart Casual',
      en: 'Smart Casual',
      es: 'Smart Casual',
    },
    promptEN: 'a fitted knit sweater over a collared shirt, dark jeans, minimalist sneakers',
  },
  {
    id: 'streetwear',
    labels: {
      de: 'Streetwear',
      en: 'Streetwear',
      es: 'Streetwear',
    },
    promptEN: 'an oversized hoodie, relaxed cargo pants, modern chunky sneakers, understated accessories',
  },
  {
    id: 'creative-modern',
    labels: {
      de: 'Kreativ / Modern',
      en: 'Creative / Modern',
      es: 'Creativo / Moderno',
    },
    promptEN: 'a monochrome designer t-shirt, tailored joggers, clean minimalist sneakers, contemporary editorial look',
  },
  {
    id: 'gym-athleisure',
    labels: {
      de: 'Gym / Athleisure',
      en: 'Gym / Athleisure',
      es: 'Gimnasio / Deportivo',
    },
    promptEN: 'a fitted performance t-shirt, athletic joggers, modern running shoes, technical sportswear look',
  },
  {
    id: 'outdoor-casual',
    labels: {
      de: 'Outdoor / Casual',
      en: 'Outdoor / Casual',
      es: 'Outdoor / Casual',
    },
    promptEN: 'a rugged flannel shirt over a plain tee, dark denim jeans, sturdy leather boots',
  },
  {
    id: 'evening-elegant',
    labels: {
      de: 'Evening / Elegant',
      en: 'Evening / Elegant',
      es: 'Noche / Elegante',
    },
    promptEN: 'an elegant fitted black outfit, refined tailoring, sleek minimalist accessories, upscale evening look',
  },
  {
    id: 'weekend-relaxed',
    labels: {
      de: 'Weekend / Entspannt',
      en: 'Weekend / Relaxed',
      es: 'Fin de semana / Relajado',
    },
    promptEN: 'a soft crewneck t-shirt, comfortable straight-leg jeans, clean white sneakers',
  },
  {
    id: 'tech-founder',
    labels: {
      de: 'Tech Founder',
      en: 'Tech Founder',
      es: 'Tech Founder',
    },
    promptEN: 'a plain premium black t-shirt, dark tailored jeans, minimalist white sneakers, understated modern tech look',
  },
];

export function getOutfitPresetById(id?: string | null): OutfitPreset | null {
  if (!id) return null;
  return DEFAULT_OUTFIT_PRESETS.find((p) => p.id === id) ?? null;
}

export function outfitPresetLabel(preset: OutfitPreset, language?: string): string {
  const lang = (language ?? 'de').toLowerCase().slice(0, 2) as 'de' | 'en' | 'es';
  return preset.labels[lang] ?? preset.labels.en;
}
