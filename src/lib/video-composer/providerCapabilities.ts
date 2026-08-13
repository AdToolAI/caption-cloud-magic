/**
 * providerCapabilities — ADAPTER (v430 Schritt 2).
 *
 * The capability truth now lives in `src/lib/composer/providerMatrix.ts`.
 * This module keeps the historic API surface (`PROVIDER_CAPS` and the
 * `provider*` helpers) so existing callers (SceneCard, renderWarnings,
 * validateSceneForCinematicSync) stay untouched — every value is read from
 * the matrix, nothing is maintained here.
 */

import {
  PROVIDER_MATRIX,
  type ProviderMatrixEntry,
  getProviderDurations,
  getProviderLabel,
  getLipsyncProviders as matrixLipsyncProviders,
  providerHasNativeAudio,
  providerHasNativeLipSync,
  providerMaxSpeakers,
  providerSupportedLanguages,
  providerSupportsLipsync,
  providerSupportsMultiSpeaker,
  snapDurationToProvider,
} from '@/lib/composer/providerMatrix';

export type ClipSource =
  | 'ai-hailuo'
  | 'ai-happyhorse'
  | 'ai-kling'
  | 'ai-veo'
  | 'ai-wan'
  | 'ai-seedance'
  | 'ai-seedance25'
  | 'ai-luma'
  | 'ai-ltx'
  | 'ai-sora'
  | 'ai-pika'
  | 'ai-runway'
  | 'ai-vidu'
  | 'ai-kling-omni';

export type ProviderCapability = ProviderMatrixEntry;

/** @deprecated read the matrix directly — kept as a view for legacy callers. */
export const PROVIDER_CAPS: Record<string, ProviderCapability> = PROVIDER_MATRIX;

export {
  getProviderDurations,
  getProviderLabel,
  providerHasNativeAudio,
  providerHasNativeLipSync,
  providerMaxSpeakers,
  providerSupportedLanguages,
  providerSupportsLipsync,
  providerSupportsMultiSpeaker,
  snapDurationToProvider,
};

/** All lip-sync capable providers (used to build provider dropdowns). */
export function getLipsyncProviders(): ClipSource[] {
  return matrixLipsyncProviders() as ClipSource[];
}
