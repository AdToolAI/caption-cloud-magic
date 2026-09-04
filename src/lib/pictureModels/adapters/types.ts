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
  /** Control values keyed by the registry control keys. */
  values?: Record<string, unknown>;
  /** Source dimensions, used by auto model selection and pricing. */
  inputWidth?: number;
  inputHeight?: number;
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

export function num(
  values: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const raw = values?.[key];
  let value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  if (min !== undefined) value = Math.max(min, value);
  if (max !== undefined) value = Math.min(max, value);
  return value;
}

export function str(
  values: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
  allowed?: readonly string[],
): string {
  const raw = values?.[key];
  const value = typeof raw === 'string' && raw.length > 0 ? raw : fallback;
  if (allowed && !allowed.includes(value)) return fallback;
  return value;
}

export function bool(
  values: Record<string, unknown> | undefined,
  key: string,
  fallback = false,
): boolean {
  const raw = values?.[key];
  return typeof raw === 'boolean' ? raw : fallback;
}
