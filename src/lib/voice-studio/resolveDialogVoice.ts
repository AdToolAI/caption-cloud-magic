/**
 * Backwards-compatible reader for `ComposerScene.dialogVoices` entries.
 * Old format: plain ElevenLabs voiceId string.
 * New format: { engine, voiceId, voiceName?, isCustom?, elevenlabsVoiceId?, provider? }
 *
 * Phase C additions:
 *  - resolveCharacterVoiceProfile — reads brand_characters.voice_settings
 *  - mergeWithTonality — layers a tonality delta on top of a brand profile
 *    using multiplicative blending, clamped to [0, 1] (speed clamped to
 *    [0.7, 1.2] per ElevenLabs limits). Keeps the brand identity intact
 *    while still letting `[whisper]` actually sound like a whisper.
 */
import type { DialogVoiceCfg } from '@/types/video-composer';
import {
  DIALOG_TONALITY_PRESETS,
  type DialogTonalityId,
  type DialogTonalityPreset,
} from '@/config/dialogTonalityPresets';

export interface VoiceTuning {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
}

export const DEFAULT_VOICE_TUNING: Required<VoiceTuning> = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.3,
  useSpeakerBoost: true,
  speed: 1.0,
};

export function resolveDialogVoice(
  raw: string | DialogVoiceCfg | undefined | null,
): DialogVoiceCfg | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    return { engine: 'elevenlabs', voiceId: raw };
  }
  return raw;
}

export function isHumeDialogVoice(raw: string | DialogVoiceCfg | undefined | null): boolean {
  const r = resolveDialogVoice(raw);
  return r?.engine === 'hume';
}

/** Read a Brand Character's voice tuning profile from the DB row, with safe coercion. */
export function resolveCharacterVoiceProfile(
  character: { voice_settings?: any } | null | undefined,
): VoiceTuning | null {
  const raw = character?.voice_settings;
  if (!raw || typeof raw !== 'object') return null;
  const out: VoiceTuning = {};
  if (typeof raw.stability === 'number') out.stability = clamp01(raw.stability);
  if (typeof raw.similarityBoost === 'number') out.similarityBoost = clamp01(raw.similarityBoost);
  if (typeof raw.similarity_boost === 'number') out.similarityBoost = clamp01(raw.similarity_boost);
  if (typeof raw.style === 'number') out.style = clamp01(raw.style);
  if (typeof raw.useSpeakerBoost === 'boolean') out.useSpeakerBoost = raw.useSpeakerBoost;
  if (typeof raw.use_speaker_boost === 'boolean') out.useSpeakerBoost = raw.use_speaker_boost;
  if (typeof raw.speed === 'number') out.speed = clampSpeed(raw.speed);
  return Object.keys(out).length ? out : null;
}

/**
 * Layer a tonality preset on top of a brand profile.
 *
 * Multiplicative blending for the 0..1 axes (stability/similarityBoost/style):
 *   merged = clamp01( base * (1 - α) + tonality * α )    where α = TONALITY_WEIGHT
 *
 * Speed uses the tonality speed directly (additive ratio) so [whisper] actually
 * slows the line — speed has too narrow a band for meaningful multiplicative
 * blending. `useSpeakerBoost` always falls back to the tonality preset if set.
 */
const TONALITY_WEIGHT = 0.65; // strong tonality voice, brand still audible

export function mergeWithTonality(
  base: VoiceTuning | null | undefined,
  tonality: DialogTonalityId | undefined | null,
): VoiceTuning {
  const baseFull = { ...DEFAULT_VOICE_TUNING, ...(base ?? {}) };
  const preset: DialogTonalityPreset | undefined = tonality
    ? DIALOG_TONALITY_PRESETS[tonality]
    : undefined;
  if (!preset || tonality === 'neutral') return baseFull;
  const t = preset.settings;
  const blend = (b: number, x: number | undefined) =>
    typeof x === 'number' ? clamp01(b * (1 - TONALITY_WEIGHT) + x * TONALITY_WEIGHT) : b;
  return {
    stability: blend(baseFull.stability, t.stability),
    similarityBoost: blend(baseFull.similarityBoost, t.similarityBoost),
    style: blend(baseFull.style, t.style),
    useSpeakerBoost:
      typeof t.useSpeakerBoost === 'boolean' ? t.useSpeakerBoost : baseFull.useSpeakerBoost,
    speed: typeof t.speed === 'number' ? clampSpeed(t.speed) : baseFull.speed,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function clampSpeed(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.7, Math.min(1.2, n));
}
