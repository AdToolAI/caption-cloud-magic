/**
 * Backwards-compatible reader for `ComposerScene.dialogVoices` entries.
 * Old format: plain ElevenLabs voiceId string.
 * New format: { engine, voiceId, voiceName?, isCustom?, elevenlabsVoiceId?, provider? }
 */
import type { DialogVoiceCfg } from '@/types/video-composer';

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
