/**
 * Picture Studio 2.0 — Model Registry types.
 *
 * The registry describes WHAT a model can do (capabilities, pricing, UI copy).
 * It never builds a provider request — that is the job of the adapter layer in
 * `src/lib/pictureModels/adapters/`.
 *
 *   Registry -> Capability / Pricing / UI -> Provider Adapter -> Replicate API
 */

export type PictureCapability =
  | 'text_to_image'
  | 'image_edit'
  | 'object_remove'
  | 'inpaint'
  | 'outpaint'
  | 'upscale'
  | 'face_enhance'
  | 'restore'
  | 'colorize'
  | 'background_remove'
  | 'background_replace';

export type PictureCategory = 'generate' | 'edit' | 'enhance' | 'background';

export type PictureProvider = 'replicate' | 'lovable' | 'internal';

export interface LocalizedText {
  en: string;
  de: string;
  es: string;
}

export type PricingUnit = 'per_image' | 'per_output_megapixel' | 'per_run';

export interface PricingModel {
  unit: PricingUnit;
  /** Real provider cost in EUR for one unit. */
  providerCostEUR: number;
  /**
   * Fixed end price in EUR that overrides the margin engine.
   * Used where a price is already live and must not change (Clarity).
   */
  fixedSellEUR?: Partial<Record<number, number>> | number;
  /** true until a real, billed test run confirmed the provider cost. */
  costUnverified?: boolean;
}

export interface PictureModelPreset {
  id: string;
  label: LocalizedText;
  /** Adapter-specific values merged into the run config. */
  values: Record<string, unknown>;
}

export interface PictureModelDefinition {
  id: string;
  /** Real model name — always visible in the UI. No black box. */
  name: string;
  vendor: string;
  provider: PictureProvider;
  /** Provider-side identifier, consumed only by the adapter. */
  providerModelId: string;
  category: PictureCategory;
  capabilities: PictureCapability[];
  bestFor: LocalizedText[];
  description: LocalizedText;
  badges?: LocalizedText[];
  supportedScales?: number[];
  supportedFormats?: string[];
  presets?: PictureModelPreset[];
  pricing: PricingModel;
  /** Typical processing time range in seconds — a range, never a promise. */
  typicalProcessingSeconds?: [number, number];
  /**
   * Visible in production UI. Stays false until one real end-to-end test
   * (wallet debit, refund, media library, download) passed.
   */
  enabled: boolean;
  beta?: boolean;
  /** Feature flag key that can enable the model ahead of a global rollout. */
  featureFlag?: string;
}
