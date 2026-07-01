export function clampAudioVolume(value: number | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

/**
 * Honest music volume policy.
 *
 * The slider value IS the volume the user hears — in preview AND in the final
 * render. The only automatic adjustment is a gentle sidechain when a voiceover
 * is present: music is capped at 40 % of the slider value so narration stays
 * intelligible without shrinking the slider into meaningless single digits.
 */
export function getEffectiveBackgroundMusicVolume(
  rawVolume: number | null | undefined,
  hasVoiceover = false,
): number {
  const clamped = clampAudioVolume(rawVolume);
  if (!hasVoiceover) return clamped;
  return clampAudioVolume(clamped * 0.4);
}