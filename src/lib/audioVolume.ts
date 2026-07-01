export function clampAudioVolume(value: number | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

const MUSIC_HEADROOM_WITH_VOICEOVER = 0.35;

/**
 * Universal Creator music mix policy.
 *
 * The UI stays simple: users see and control a normal 0–100% music slider.
 * Internally, when a voice-over is present, we reserve headroom so mastered
 * music beds do not overpower narration. Preview and export both use this
 * exact function, so the perceived mix remains identical everywhere.
 *
 * Without voice-over, the slider is direct because music is the primary audio.
 */
export function getEffectiveBackgroundMusicVolume(
  rawVolume: number | null | undefined,
  hasVoiceover = false,
): number {
  const sliderVolume = clampAudioVolume(rawVolume);
  if (!hasVoiceover) return sliderVolume;
  return clampAudioVolume(sliderVolume * MUSIC_HEADROOM_WITH_VOICEOVER);
}
