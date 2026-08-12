import type { ClipSource } from '@/types/video-composer';

export const DIALOG_MASTER_PROVIDERS = [
  'ai-hailuo',
  'ai-happyhorse',
  'ai-kling',
  'ai-wan',
  'ai-seedance',
  'ai-seedance25',
  'ai-luma',
] as const satisfies readonly ClipSource[];

export type DialogMasterProvider = (typeof DIALOG_MASTER_PROVIDERS)[number];

export function resolveDialogMasterProvider(source: string | null | undefined): DialogMasterProvider {
  return (DIALOG_MASTER_PROVIDERS as readonly string[]).includes(source ?? '')
    ? (source as DialogMasterProvider)
    : 'ai-happyhorse';
}

export function clampDialogMasterDuration(provider: DialogMasterProvider, duration: number): number {
  const picked = Number.isFinite(duration) ? Math.ceil(duration) : 6;
  const clamp = (min: number, max: number) => Math.min(max, Math.max(min, picked));

  if (provider === 'ai-hailuo') return picked === 10 ? 10 : 6;
  if (provider === 'ai-happyhorse' || provider === 'ai-kling') return clamp(3, 15);
  if (provider === 'ai-wan') return clamp(3, 10);
  if (provider === 'ai-seedance') return clamp(3, 12);
  if (provider === 'ai-seedance25') return clamp(4, 30);
  return picked >= 8 ? 9 : 5;
}

export const DIALOG_MASTER_PROVIDER_LABELS: Record<DialogMasterProvider, string> = {
  'ai-hailuo': 'Hailuo',
  'ai-happyhorse': 'HappyHorse',
  'ai-kling': 'Kling',
  'ai-wan': 'Wan',
  'ai-seedance': 'Seedance',
  'ai-seedance25': 'Seedance 2.5',
  'ai-luma': 'Luma Ray 2',
};