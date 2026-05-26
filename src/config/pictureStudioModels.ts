/**
 * Picture Studio model capabilities matrix.
 * Drives the Smart Model Picker, Pre-Flight Checks and the Prompt-Helper.
 *
 * Source of truth for: which model fits which mode, optimal use-cases,
 * prompt-style hints (used server-side by `generate-image-prompt`).
 */

export type PictureMode = 'create' | 'transform' | 'restyle';
export type QualityTier = 'standard' | 'fast' | 'pro' | 'ultra';

export interface PictureModelCapability {
  tier: QualityTier;
  /** Display label */
  label: string;
  /** Underlying model name (for prompts) */
  model: string;
  /** Cost in EUR per single image (matches TIER_COSTS in ImageGenerator) */
  cost: number;
  /** Quality per mode: 0 = not supported, 1 = weak, 2 = ok, 3 = good, 4 = excellent */
  modeQuality: Record<PictureMode, 0 | 1 | 2 | 3 | 4>;
  /** Optimal use-cases (German, shown in tooltip) */
  bestFor: string[];
  /** Short prompt-style hint for the Prompt-Helper */
  promptStyleHint: string;
}

export const PICTURE_MODELS: Record<QualityTier, PictureModelCapability> = {
  standard: {
    tier: 'standard',
    label: 'Standard',
    model: 'Gemini 2.5 Flash Image',
    cost: 0,
    modeQuality: { create: 3, transform: 3, restyle: 2 },
    bestFor: ['Schnelle Drafts', 'Konzept-Skizzen', 'Im Abo gratis'],
    promptStyleHint: 'Concise natural-language prompts. Gemini understands narrative descriptions well; avoid heavy comma-separated tag lists.',
  },
  fast: {
    tier: 'fast',
    label: 'Fast',
    model: 'Seedream 4',
    cost: 0.04,
    modeQuality: { create: 3, transform: 2, restyle: 3 },
    bestFor: ['Stilisierte Szenen', 'Mood-Boards', 'Social-Content'],
    promptStyleHint: 'Mid-length descriptive prompts with explicit style cues, lighting and camera language.',
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    model: 'Imagen 4 Ultra',
    cost: 0.08,
    modeQuality: { create: 4, transform: 1, restyle: 2 },
    bestFor: ['Hochauflösende Text→Bild Szenen', 'Werbung', 'Produkt-Hero'],
    promptStyleHint: 'Verbose photographic prompts work best. Imagen 4 is weak at preserving complex i2i compositions — use Nano Banana 2 instead.',
  },
  ultra: {
    tier: 'ultra',
    label: 'Ultra',
    model: 'Nano Banana 2',
    cost: 0.20,
    modeQuality: { create: 4, transform: 4, restyle: 4 },
    bestFor: ['Komplexe i2i mit vielen Personen', 'Stil-Transfer', 'Fotorealismus'],
    promptStyleHint: 'Structured prompts with explicit "preserve X from reference" instructions. Excellent at honoring composition.',
  },
};

export const PICTURE_MODES: Record<PictureMode, {
  label: string;
  description: string;
  needsReference: boolean;
}> = {
  create: {
    label: 'Neues Bild',
    description: 'Text → Bild. Generiere komplett neu aus deinem Prompt.',
    needsReference: false,
  },
  transform: {
    label: 'Bild verwandeln',
    description: 'Dein Bild als Vorlage. Komposition bleibt, Stil/Details ändern sich.',
    needsReference: true,
  },
  restyle: {
    label: 'Stil übernehmen',
    description: 'Nutze Farben & Mood eines Referenzbildes für ein neues Motiv.',
    needsReference: true,
  },
};

/**
 * Returns the best-fit tier for a given mode based on `modeQuality`.
 * Ties broken by lowest cost.
 */
export function recommendedTierForMode(mode: PictureMode): QualityTier {
  let best: QualityTier = 'standard';
  let bestScore = -1;
  let bestCost = Infinity;
  for (const tier of Object.keys(PICTURE_MODELS) as QualityTier[]) {
    const m = PICTURE_MODELS[tier];
    const score = m.modeQuality[mode];
    if (score > bestScore || (score === bestScore && m.cost < bestCost)) {
      best = tier;
      bestScore = score;
      bestCost = m.cost;
    }
  }
  return best;
}

/**
 * Detect risky model+mode combinations for the Pre-Flight banner.
 * Returns a warning string or null.
 */
export function detectMismatch(tier: QualityTier, mode: PictureMode): string | null {
  const m = PICTURE_MODELS[tier];
  const score = m.modeQuality[mode];
  if (score === 0) return `${m.label} (${m.model}) unterstützt diesen Modus nicht.`;
  if (score <= 2) {
    const better = recommendedTierForMode(mode);
    const betterModel = PICTURE_MODELS[better];
    if (better !== tier) {
      return `${m.label} ist schwach in diesem Modus. ${betterModel.label} (${betterModel.model}) liefert oft bessere Ergebnisse.`;
    }
  }
  return null;
}
