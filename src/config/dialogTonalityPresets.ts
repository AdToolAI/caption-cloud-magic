/**
 * Dialog Tonality Presets (Phase C — Baustein 2)
 *
 * Per-line performance markers ([whisper], [shouting], …) for the
 * SceneDialogStudio dialog pipeline. Each preset maps to an ElevenLabs
 * voice_settings delta that is layered ON TOP of the character's
 * Brand-Voice profile (resolveCharacterVoiceProfile + mergeWithTonality).
 *
 * Why multiplicative merging (in resolveDialogVoice.ts) and not absolute
 * overrides? So a soft-spoken Brand Character still sounds like *that
 * character* when whispering — we modulate, we don't replace.
 */

export type DialogTonalityId =
  | 'neutral'
  | 'whisper'
  | 'shouting'
  | 'excited'
  | 'calm'
  | 'serious'
  | 'playful'
  | 'sad';

export interface DialogTonalityPreset {
  id: DialogTonalityId;
  label: string;
  emoji: string;
  /** Short hint shown in tooltips. */
  hint: string;
  /** ElevenLabs voice_settings delta. NULL fields = inherit. */
  settings: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speed?: number;
  };
}

export const DIALOG_TONALITY_PRESETS: Record<DialogTonalityId, DialogTonalityPreset> = {
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    emoji: '💬',
    hint: 'Default tonality — uses the Brand voice profile as-is.',
    settings: {},
  },
  whisper: {
    id: 'whisper',
    label: 'Whisper',
    emoji: '🤫',
    hint: 'Intimate, breathy delivery. Slower and more stable.',
    settings: { stability: 0.85, style: 0.15, speed: 0.9 },
  },
  shouting: {
    id: 'shouting',
    label: 'Shouting',
    emoji: '📢',
    hint: 'Loud, urgent. Higher style, faster delivery.',
    settings: { stability: 0.3, style: 0.75, speed: 1.1, useSpeakerBoost: true },
  },
  excited: {
    id: 'excited',
    label: 'Excited',
    emoji: '🤩',
    hint: 'Energetic, expressive — great for hooks and reveals.',
    settings: { stability: 0.4, style: 0.6, speed: 1.05 },
  },
  calm: {
    id: 'calm',
    label: 'Calm',
    emoji: '🧘',
    hint: 'Composed, even — wellness, meditation, trust scenes.',
    settings: { stability: 0.8, style: 0.2, speed: 0.95 },
  },
  serious: {
    id: 'serious',
    label: 'Serious',
    emoji: '🎯',
    hint: 'Authoritative, grounded — news, finance, B2B reveals.',
    settings: { stability: 0.75, style: 0.15, speed: 0.95 },
  },
  playful: {
    id: 'playful',
    label: 'Playful',
    emoji: '😄',
    hint: 'Light, witty — punchlines, comedic beats.',
    settings: { stability: 0.45, style: 0.55, speed: 1.05 },
  },
  sad: {
    id: 'sad',
    label: 'Sad',
    emoji: '😔',
    hint: 'Soft, melancholic — emotional storytelling beats.',
    settings: { stability: 0.7, style: 0.45, speed: 0.9 },
  },
};

export const DIALOG_TONALITY_LIST: DialogTonalityPreset[] = Object.values(DIALOG_TONALITY_PRESETS);

export function getTonalityPreset(id: DialogTonalityId | string | undefined | null):
  | DialogTonalityPreset
  | undefined {
  if (!id) return undefined;
  return DIALOG_TONALITY_PRESETS[id as DialogTonalityId];
}

/** Normalise free-form marker text ("Whisper", "WHISPERING", "shout") to a preset id. */
export function normalizeTonalityMarker(raw: string | undefined | null): DialogTonalityId | undefined {
  if (!raw) return undefined;
  const k = String(raw).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return undefined;
  if (k.startsWith('whisper')) return 'whisper';
  if (k.startsWith('shout') || k === 'yell' || k === 'yelling') return 'shouting';
  if (k.startsWith('excit')) return 'excited';
  if (k.startsWith('calm')) return 'calm';
  if (k.startsWith('serious') || k === 'authority' || k === 'authoritative') return 'serious';
  if (k.startsWith('play') || k === 'witty' || k === 'fun') return 'playful';
  if (k.startsWith('sad') || k === 'melancholy' || k === 'melancholic') return 'sad';
  if (k.startsWith('neutral') || k === 'default' || k === 'normal') return 'neutral';
  // Direct id hit
  if ((DIALOG_TONALITY_PRESETS as any)[k]) return k as DialogTonalityId;
  return undefined;
}
