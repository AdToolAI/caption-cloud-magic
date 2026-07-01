export function clampAudioVolume(value: number | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

/**
 * Honest music volume policy — WYSIWYG.
 *
 * The slider value IS the volume the user hears — in preview AND in the
 * final render. No hidden sidechain math. If the mix feels off, the user
 * lowers the slider; the number on screen matches what they hear.
 *
 * The `hasVoiceover` argument is kept for backwards compatibility but is
 * intentionally ignored so preview and export always agree with the slider.
 */
export function getEffectiveBackgroundMusicVolume(
  rawVolume: number | null | undefined,
  _hasVoiceover = false,
): number {
  return clampAudioVolume(rawVolume);
}
