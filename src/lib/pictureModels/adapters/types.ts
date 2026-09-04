/**
 * Provider adapter contract.
 *
 * The registry never builds a provider payload. Each adapter knows exactly how
 * its model's Replicate input looks — if a provider changes its schema, exactly
 * one file changes.
 */

export interface EnhanceRunConfig {
  imageUrl: string;
  scale?: number;
  /** Registry preset id (e.g. 'high-fidelity-v2', 'balanced'). */
  presetId?: string;
  /** Clarity creativity slider, -10..+10. */
  creativity?: number;
  faceEnhancement?: boolean;
  faceEnhancementStrength?: number;
  /** Restore: film grain. */
  filmGrain?: boolean;
  filmGrainStrength?: number;
  /** Colorize: 0 = natural, 1 = vivid. */
  vividness?: number;
  prompt?: string;
}

export interface AdapterValidation {
  ok: boolean;
  code?: string;
  message?: string;
}

export interface ProviderAdapter {
  modelId: string;
  providerModelId: string;
  validate(config: EnhanceRunConfig): AdapterValidation;
  buildInput(config: EnhanceRunConfig): Record<string, unknown>;
}
