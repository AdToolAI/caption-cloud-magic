import type { ClipSource } from '@/types/video-composer';

/**
 * v425 — Lip-Sync provider contract.
 *
 * Only providers explicitly certified here may act as a master plate for the
 * Cinematic-Sync / Sync.so pipeline. The list is the SINGLE source of truth:
 * UI picker, briefing automation and the `compose-video-clips` edge function
 * all derive from it (the backend mirrors it in
 * `supabase/functions/_shared/composer-ai-sources.ts`).
 *
 * Certifying another provider later = add it here (plus the backend mirror)
 * and set its duration clamp below. Nothing else needs to change.
 *
 * Why only Hailuo + HappyHorse:
 *  - both are proven, stable i2v plate providers with reliable face geometry
 *  - Seedance 2.5 (v418) was certified on paper but fails in practice on the
 *    ModelArk person-protection filter; it stays available for all non-dialog
 *    scenes (up to 30s)
 *  - Kling/Wan/Seedance-1/Luma produced regular plate/geometry mismatches
 */
export const DIALOG_MASTER_PROVIDERS = [
  'ai-happyhorse',
  'ai-hailuo',
] as const satisfies readonly ClipSource[];

export type DialogMasterProvider = (typeof DIALOG_MASTER_PROVIDERS)[number];

/** Primary (default) lip-sync plate provider. */
export const LIPSYNC_PRIMARY_PROVIDER: DialogMasterProvider = 'ai-happyhorse';
/** Secondary certified lip-sync plate provider. */
export const LIPSYNC_SECONDARY_PROVIDER: DialogMasterProvider = 'ai-hailuo';

/** True iff the clip source is certified as a lip-sync master plate. */
export function isLipsyncCertifiedProvider(source: string | null | undefined): boolean {
  return (DIALOG_MASTER_PROVIDERS as readonly string[]).includes(source ?? '');
}

export function resolveDialogMasterProvider(source: string | null | undefined): DialogMasterProvider {
  return isLipsyncCertifiedProvider(source)
    ? (source as DialogMasterProvider)
    : LIPSYNC_PRIMARY_PROVIDER;
}

export function clampDialogMasterDuration(provider: DialogMasterProvider, duration: number): number {
  const picked = Number.isFinite(duration) ? Math.ceil(duration) : 6;
  if (provider === 'ai-hailuo') return picked >= 10 ? 10 : 6;
  // HappyHorse: continuous 3–15s
  return Math.min(15, Math.max(3, picked));
}

export const DIALOG_MASTER_PROVIDER_LABELS: Record<DialogMasterProvider, string> = {
  'ai-happyhorse': 'HappyHorse',
  'ai-hailuo': 'Hailuo',
};
