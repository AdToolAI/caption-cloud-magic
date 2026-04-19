// Per-model compatibility matrix for Composer Visual Styles.
// Used by the AI Video Studio Style-Picker to show how well each model
// handles each style — green = excellent, yellow = works, orange = limited.
//
// Ratings are based on observed model behaviour and provider docs.
// Tweak as new models / capabilities arrive.

import type { ComposerVisualStyle } from './composerVisualStyles';

export type StyleCompatibility = 'optimal' | 'good' | 'limited';

export type AIVideoModel = 'hailuo' | 'kling' | 'seedance' | 'wan' | 'luma' | 'sora';

export interface CompatibilityInfo {
  level: StyleCompatibility;
  /** Short tooltip message shown on hover. EN-style, short. */
  note: { de: string; en: string; es: string };
  /** Optional alternative model recommendation when level === 'limited'. */
  recommend?: AIVideoModel[];
}

const OPTIMAL: CompatibilityInfo = {
  level: 'optimal',
  note: {
    de: 'Optimal für dieses Modell',
    en: 'Optimal for this model',
    es: 'Óptimo para este modelo',
  },
};

const GOOD: CompatibilityInfo = {
  level: 'good',
  note: {
    de: 'Funktioniert gut, aber nicht der Sweet-Spot',
    en: 'Works well, but not the sweet spot',
    es: 'Funciona bien, pero no es lo ideal',
  },
};

const limited = (recommend: AIVideoModel[]): CompatibilityInfo => ({
  level: 'limited',
  note: {
    de: 'Eingeschränkte Qualität — alternatives Modell empfohlen',
    en: 'Limited quality — alternative model recommended',
    es: 'Calidad limitada — se recomienda otro modelo',
  },
  recommend,
});

export const MODEL_STYLE_COMPATIBILITY: Record<AIVideoModel, Record<ComposerVisualStyle, CompatibilityInfo>> = {
  // Hailuo 2.3 — primarily a realism / character motion model.
  hailuo: {
    realistic: OPTIMAL,
    cinematic: OPTIMAL,
    documentary: OPTIMAL,
    'vintage-film': OPTIMAL,
    noir: OPTIMAL,
    cyberpunk: OPTIMAL,
    '3d-animation': GOOD,
    anime: GOOD,
    comic: limited(['kling', 'seedance']),
    watercolor: limited(['kling']),
    claymation: limited(['kling']),
    'pixel-art': limited(['kling', 'seedance']),
  },
  // Placeholders for the other studios — refined when those pickers ship.
  kling: {
    realistic: OPTIMAL, cinematic: OPTIMAL, documentary: OPTIMAL, 'vintage-film': GOOD,
    noir: GOOD, cyberpunk: OPTIMAL, '3d-animation': OPTIMAL, anime: OPTIMAL,
    comic: OPTIMAL, watercolor: OPTIMAL, claymation: GOOD, 'pixel-art': GOOD,
  },
  seedance: {
    realistic: OPTIMAL, cinematic: OPTIMAL, documentary: OPTIMAL, 'vintage-film': GOOD,
    noir: GOOD, cyberpunk: OPTIMAL, '3d-animation': OPTIMAL, anime: OPTIMAL,
    comic: GOOD, watercolor: GOOD, claymation: GOOD, 'pixel-art': GOOD,
  },
  wan: {
    realistic: OPTIMAL, cinematic: OPTIMAL, documentary: OPTIMAL, 'vintage-film': GOOD,
    noir: GOOD, cyberpunk: OPTIMAL, '3d-animation': GOOD, anime: GOOD,
    comic: limited(['kling']), watercolor: limited(['kling']),
    claymation: limited(['kling']), 'pixel-art': limited(['kling']),
  },
  luma: {
    realistic: OPTIMAL, cinematic: OPTIMAL, documentary: OPTIMAL, 'vintage-film': GOOD,
    noir: GOOD, cyberpunk: OPTIMAL, '3d-animation': GOOD, anime: GOOD,
    comic: limited(['kling']), watercolor: limited(['kling']),
    claymation: limited(['kling']), 'pixel-art': limited(['kling']),
  },
  sora: {
    realistic: OPTIMAL, cinematic: OPTIMAL, documentary: OPTIMAL, 'vintage-film': OPTIMAL,
    noir: OPTIMAL, cyberpunk: OPTIMAL, '3d-animation': OPTIMAL, anime: GOOD,
    comic: GOOD, watercolor: GOOD, claymation: GOOD, 'pixel-art': GOOD,
  },
};

export function getCompatibility(
  model: AIVideoModel,
  style: ComposerVisualStyle,
): CompatibilityInfo {
  return MODEL_STYLE_COMPATIBILITY[model][style];
}

export function compatibilityDotClass(level: StyleCompatibility): string {
  // HSL semantic tokens — defined in index.css
  switch (level) {
    case 'optimal':
      return 'bg-emerald-500';
    case 'good':
      return 'bg-amber-400';
    case 'limited':
      return 'bg-orange-500';
  }
}
