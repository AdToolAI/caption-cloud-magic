import { ENHANCE_MODELS } from './enhanceModels';
import type {
  LocalizedText,
  PictureCapability,
  PictureCategory,
  PictureModelDefinition,
} from './types';

export * from './types';
export { ENHANCE_MODELS };

/**
 * Single source of truth for Picture Studio models.
 * The UI asks the registry ("which models can upscale?") — no per-model
 * React special case, no hardcoded action tiles.
 */
export const PICTURE_MODEL_REGISTRY: PictureModelDefinition[] = [...ENHANCE_MODELS];

export function getPictureModel(id: string): PictureModelDefinition | undefined {
  return PICTURE_MODEL_REGISTRY.find((m) => m.id === id);
}

export interface RegistryQuery {
  /** Include models that are not enabled yet (feature-flagged / beta). */
  includeDisabled?: boolean;
  /** Feature flags that are switched on for the current user. */
  enabledFlags?: string[];
}

export function isModelVisible(
  model: PictureModelDefinition,
  query: RegistryQuery = {},
): boolean {
  if (query.includeDisabled) return true;
  if (model.enabled) return true;
  if (model.featureFlag && query.enabledFlags?.includes(model.featureFlag)) return true;
  return false;
}

export function modelsWithCapability(
  capability: PictureCapability,
  query: RegistryQuery = {},
): PictureModelDefinition[] {
  return PICTURE_MODEL_REGISTRY.filter(
    (m) => m.capabilities.includes(capability) && isModelVisible(m, query),
  );
}

export function modelsInCategory(
  category: PictureCategory,
  query: RegistryQuery = {},
): PictureModelDefinition[] {
  return PICTURE_MODEL_REGISTRY.filter(
    (m) => m.category === category && isModelVisible(m, query),
  );
}

export function availableCapabilities(
  category: PictureCategory,
  query: RegistryQuery = {},
): PictureCapability[] {
  const set = new Set<PictureCapability>();
  for (const model of modelsInCategory(category, query)) {
    model.capabilities.forEach((c) => set.add(c));
  }
  return [...set];
}

export function pickLocalized(text: LocalizedText, lang: string): string {
  if (lang.startsWith('de')) return text.de;
  if (lang.startsWith('es')) return text.es;
  return text.en;
}
