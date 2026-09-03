import { tx } from "@/lib/i18nText";
/**
 * Picture Studio model capabilities matrix.
 * Drives the Smart Model Picker, Pre-Flight Checks and the Prompt-Helper.
 *
 * Source of truth for: which model fits which mode, optimal use-cases,
 * prompt-style hints (used server-side by `generate-image-prompt`).
 */

export type PictureMode = 'create' | 'transform' | 'restyle' | 'mix';
export type QualityTier =
  | 'standard'
  | 'fast'
  | 'pro'
  | 'ultra'
  | 'gptimage'
  | 'flux'
  | 'ideogram'
  | 'recraft'
  | 'qwen';

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
  /**
   * Aspect ratios the model really accepts. `null` = no restriction.
   * Single source of truth for the UI filter — never offer anything else,
   * otherwise the provider rejects the whole request.
   */
  aspectRatios: string[] | null;
  /** Shown as a secondary picker ("Spezialmodelle") instead of a main tier. */
  specialist?: boolean;
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
    modeQuality: { create: 3, transform: 3, restyle: 2, mix: 3 },
    aspectRatios: null,
    bestFor: ['Schnelle Drafts', 'Konzept-Skizzen', 'Im Abo gratis'],
    promptStyleHint: 'Concise natural-language prompts. Gemini understands narrative descriptions well; avoid heavy comma-separated tag lists.',
  },
  fast: {
    tier: 'fast',
    label: 'Fast',
    model: 'Seedream 4',
    cost: 0.04,
    modeQuality: { create: 3, transform: 3, restyle: 3, mix: 4 },
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    bestFor: [tx({ de: 'Stilisierte Szenen', en: 'Stylized scenes', es: 'escenas estilizadas' }), 'Mood-Boards', 'Social-Content'],
    promptStyleHint: 'Mid-length descriptive prompts with explicit style cues, lighting and camera language.',
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    model: 'Imagen 4 Ultra',
    cost: 0.08,
    modeQuality: { create: 4, transform: 0, restyle: 0, mix: 0 },
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    bestFor: [tx({ de: 'Hochauflösende Text→Bild Szenen', en: 'High-resolution Text→Image scenes', es: 'Escenas de texto a imagen de alta resolución' }), 'Werbung', 'Produkt-Hero'],
    promptStyleHint: 'Verbose photographic prompts work best. Imagen 4 is weak at preserving complex i2i compositions — use Nano Banana 2 instead.',
  },
  ultra: {
    tier: 'ultra',
    label: 'Ultra',
    model: 'Nano Banana',
    cost: 0.20,
    modeQuality: { create: 4, transform: 4, restyle: 4, mix: 4 },
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    bestFor: [tx({ de: 'Komplexe i2i mit vielen Personen', en: 'Complex i2i with many people', es: 'I2i complejo con mucha gente.' }), 'Stil-Transfer', 'Fotorealismus'],
    promptStyleHint: 'Structured prompts with explicit "preserve X from reference" instructions. Excellent at honoring composition.',
  },
  gptimage: {
    tier: 'gptimage',
    label: 'GPT Image',
    model: 'GPT-Image-2 (ChatGPT)',
    cost: 0.08,
    modeQuality: { create: 4, transform: 4, restyle: 0, mix: 4 },
    aspectRatios: ['1:1', '3:2', '2:3'],
    specialist: true,
    bestFor: [tx({ de: 'Prompt-Treue', en: 'Prompt accuracy', es: 'Fidelidad al prompt' }), 'Saubere Texte', 'ChatGPT-Look'],
    promptStyleHint: 'Plain, instruction-like prompts. GPT-Image follows long, explicit descriptions and renders in-image text reliably.',
  },
  flux: {
    tier: 'flux',
    label: 'FLUX Ultra',
    model: 'FLUX 1.1 Pro Ultra',
    cost: 0.10,
    modeQuality: { create: 4, transform: 3, restyle: 3, mix: 0 },
    aspectRatios: ['1:1', '3:2', '2:3', '4:5', '5:4', '16:9', '9:16', '21:9'],
    specialist: true,
    bestFor: [tx({ de: 'Midjourney-naher Look', en: 'Midjourney-like look', es: 'Estética tipo Midjourney' }), 'Fotorealismus', '4 MP'],
    promptStyleHint: 'Rich cinematic prompts with lens, lighting and film-stock language.',
  },
  ideogram: {
    tier: 'ideogram',
    label: 'Ideogram',
    model: 'Ideogram v3 Turbo',
    cost: 0.06,
    modeQuality: { create: 4, transform: 0, restyle: 4, mix: 0 },
    aspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'],
    specialist: true,
    bestFor: [tx({ de: 'Text im Bild', en: 'Text in image', es: 'Texto en la imagen' }), 'Poster', 'Logos'],
    promptStyleHint: 'Put the exact wording in quotes, then describe layout and typography.',
  },
  recraft: {
    tier: 'recraft',
    label: 'Recraft',
    model: 'Recraft v3',
    cost: 0.06,
    modeQuality: { create: 4, transform: 0, restyle: 0, mix: 0 },
    aspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    specialist: true,
    bestFor: [tx({ de: 'Vektor & Icons', en: 'Vector & icons', es: 'Vectores e iconos' }), 'Brand-Grafiken', 'Illustration'],
    promptStyleHint: 'Describe the graphic flatly: subject, style, palette. Avoid photographic camera language.',
  },
  qwen: {
    tier: 'qwen',
    label: 'Qwen',
    model: 'Qwen Image',
    cost: 0.03,
    modeQuality: { create: 3, transform: 3, restyle: 0, mix: 0 },
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    specialist: true,
    bestFor: [tx({ de: 'Günstiger Allrounder', en: 'Affordable all-rounder', es: 'Todoterreno económico' }), 'Drafts', 'Volumen'],
    promptStyleHint: 'Short, concrete descriptions. Works well with bilingual prompts.',
  },
};

/** Aspect ratios a tier accepts (`null` = unrestricted). */
export function aspectRatiosForTier(tier: QualityTier): string[] | null {
  return PICTURE_MODELS[tier]?.aspectRatios ?? null;
}

/** Closest supported ratio for a tier — used when switching models. */
export function closestAspectRatio(tier: QualityTier, requested: string): string {
  const allowed = PICTURE_MODELS[tier]?.aspectRatios;
  if (!allowed || allowed.includes(requested)) return requested;
  const parse = (r: string) => {
    const [w, h] = r.split(':').map(Number);
    return w > 0 && h > 0 ? w / h : 1;
  };
  const target = parse(requested);
  return allowed.reduce((best, cand) =>
    Math.abs(parse(cand) - target) < Math.abs(parse(best) - target) ? cand : best,
  allowed[0]);
}


export const PICTURE_MODES: Record<PictureMode, {
  label: string;
  description: string;
  needsReference: boolean;
}> = {
  create: {
    label: tx({ de: 'Neues Bild', en: 'New picture', es: 'Nueva imagen' }),
    description: tx({ de: 'Text → Bild. Generiere komplett neu aus deinem Prompt.', en: 'Text → Image. Generate completely new from your prompt.', es: 'Texto → Imagen. Genera completamente nuevo a partir de tu prompt.' }),
    needsReference: false,
  },
  transform: {
    label: tx({ de: 'Bild verwandeln', en: 'Transform image', es: 'Transformar imagen' }),
    description: tx({ de: 'Dein Bild als Vorlage. Komposition bleibt, Stil/Details ändern sich.', en: 'Your image as a template. Composition remains, style/details change.', es: 'Tu imagen como plantilla. La composición permanece, el estilo/los detalles cambian.' }),
    needsReference: true,
  },
  restyle: {
    label: tx({ de: "Stil übernehmen", en: "Adopt Style", es: "Adoptar Estilo" }),
    description: tx({ de: 'Nutze Farben & Mood eines Referenzbildes für ein neues Motiv.', en: 'Use colors & mood of a reference image for a new visual.', es: 'Usa los colores y el ambiente de una imagen de referencia para un nuevo visual.' }),
    needsReference: true,
  },
  mix: {
    label: tx({ de: 'Referenzen kombinieren', en: 'Reference mix', es: 'Combinar referencias' }),
    description: tx({ de: 'Kombiniere mehrere Motive, Personen und Details zu einem neuen Bild.', en: 'Combine multiple subjects, people and details into a new image.', es: 'Combina varios motivos, personas y detalles en una imagen nueva.' }),
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
  if (score === 0) return tx({ de: `${m.label} (${m.model}) unterstützt diesen Modus nicht.`, en: `${m.label} (${m.model}) does not support this mode.`, es: `${m.label} (${m.model}) no admite este modo.` });
  if (score <= 2) {
    const better = recommendedTierForMode(mode);
    const betterModel = PICTURE_MODELS[better];
    if (better !== tier) {
      return tx({ de: `${m.label} ist schwach in diesem Modus. ${betterModel.label} (${betterModel.model}) liefert oft bessere Ergebnisse.`, en: `${m.label} is weak in this mode. ${betterModel.label} (${betterModel.model}) often gives better results.`, es: `${m.label} es débil en este modo. ${betterModel.label} (${betterModel.model}) suele dar mejores resultados.` });
    }
  }
  return null;
}
