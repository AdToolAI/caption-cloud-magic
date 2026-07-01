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
  const duckFactor = hasVoiceover ? 0.28 : 1;
  const ducked = perceptual * duckFactor;

  // Keep music safely below narration when a voiceover exists. Many stock
  // tracks are mastered much louder than generated VO, so a linear 30% still
  // feels too hot without this ceiling.
  return clampAudioVolume(hasVoiceover ? Math.min(ducked, 0.18) : ducked);
}