export function clampAudioVolume(value: number | null | undefined): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

export function getEffectiveBackgroundMusicVolume(
  rawVolume: number | null | undefined,
  hasVoiceover = false,
): number {
  const clamped = clampAudioVolume(rawVolume);
  const perceptual = clamped * clamped;
  const duckFactor = hasVoiceover ? 0.5 : 1;
  return clampAudioVolume(perceptual * duckFactor);
}