import type { DialogVoiceCfg } from '@/types/video-composer';

export type AutoVoiceGender = 'male' | 'female' | 'neutral';

export interface AutoVoiceMeta {
  id: string;
  name: string;
  gender: AutoVoiceGender;
}

export const AUTO_VOICE_OPTIONS: AutoVoiceMeta[] = [
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'male' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'male' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', gender: 'neutral' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'neutral' },
];

const POOLS: Record<AutoVoiceGender, AutoVoiceMeta[]> = {
  male: AUTO_VOICE_OPTIONS.filter((v) => v.gender === 'male'),
  female: AUTO_VOICE_OPTIONS.filter((v) => v.gender === 'female'),
  neutral: AUTO_VOICE_OPTIONS.filter((v) => v.gender === 'neutral'),
};

const AUTO_VOICE_BY_ID = new Map(AUTO_VOICE_OPTIONS.map((v) => [v.id, v]));
const INVALID_VOICE_TOKENS = new Set([
  'lipsync-2', 'lipsync-2-pro', 'sync-3', 'sync.so', 'cinematic-sync', 'happyhorse', 'hailuo',
]);

export interface VoicePoolPicker {
  pick: (gender: AutoVoiceGender | null | undefined) => AutoVoiceMeta;
}

export function normalizeAutoVoiceGender(raw?: string | null): AutoVoiceGender | null {
  const g = String(raw ?? '').trim().toLowerCase();
  if (g === 'female' || g === 'f' || g === 'frau' || g === 'weiblich') return 'female';
  if (g === 'neutral' || g === 'nonbinary' || g === 'non-binary' || g === 'divers') return 'neutral';
  if (g === 'male' || g === 'm' || g === 'mann' || g === 'männlich') return 'male';
  return null;
}

export function cleanVoiceId(
  raw?: string | null,
  defaultVoicesByCharacter?: Record<string, string | undefined>,
): string | undefined {
  const v = String(raw ?? '').trim();
  if (!v) return undefined;
  if (INVALID_VOICE_TOKENS.has(v.toLowerCase())) return undefined;
  if (/^(sync|lipsync|hailuo|happyhorse|cinematic|model)[\w\-/:.]*$/i.test(v)) return undefined;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    const fallback = defaultVoicesByCharacter?.[v];
    if (fallback && !/^[0-9a-f]{8}-/i.test(fallback)) return fallback;
    return undefined;
  }
  return v;
}

export function getAutoVoiceName(voiceId?: string | null): string | undefined {
  const id = cleanVoiceId(voiceId);
  return id ? AUTO_VOICE_BY_ID.get(id)?.name : undefined;
}

export function toElevenLabsDialogVoice(voiceId: string, voiceName?: string, auto = false): DialogVoiceCfg {
  const id = cleanVoiceId(voiceId) ?? voiceId;
  const label = voiceName || getAutoVoiceName(id) || id;
  return { engine: 'elevenlabs', voiceId: id, voiceName: auto ? `${label} · Auto` : label };
}

export function createVoicePoolPicker(): VoicePoolPicker {
  let mi = 0;
  let fi = 0;
  let ni = 0;
  return {
    pick: (gender) => {
      const g = normalizeAutoVoiceGender(gender) ?? 'male';
      const pool = POOLS[g];
      const index = g === 'female' ? fi++ : g === 'neutral' ? ni++ : mi++;
      return pool[index % pool.length];
    },
  };
}