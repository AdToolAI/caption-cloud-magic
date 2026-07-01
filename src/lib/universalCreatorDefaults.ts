/**
 * Shared defaults for the Universal Content Creator pipeline.
 *
 * Anything that must be identical between the live preview and the final
 * Lambda render lives here so Preview and Export can never silently diverge.
 */

export const DEFAULT_SUBTITLE_STYLE = {
  position: 'bottom' as const,
  font: 'Inter',
  fontSize: 48,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  animation: 'fade' as const,
  animationSpeed: 1,
  outlineStyle: 'stroke' as const,
  outlineColor: '#000000',
  outlineWidth: 2,
};

export const DEFAULT_MUSIC_VOLUME = 0.3;
export const DEFAULT_VOICEOVER_VOLUME = 1.0;
export const MIN_TOTAL_DURATION_SECONDS = 5;

/**
 * Computes the total video duration in seconds from voice-over and scenes.
 * Kept in one place so preview and render always agree on the timeline length.
 */
export function computeTotalDurationSeconds(input: {
  voiceoverDuration?: number | null;
  actualVoiceoverDuration?: number | null;
  scenes?: Array<{ duration?: number | null }> | null;
}): number {
  const scenesSum = Array.isArray(input.scenes)
    ? input.scenes.reduce((sum, s) => {
        const d = Number(s?.duration);
        return sum + (Number.isFinite(d) && d > 0 ? d : 0);
      }, 0)
    : 0;

  const voRaw = Number(input.actualVoiceoverDuration ?? input.voiceoverDuration ?? 0);
  const vo = Number.isFinite(voRaw) && voRaw > 0 ? voRaw : 0;

  return Math.max(vo, scenesSum, MIN_TOTAL_DURATION_SECONDS);
}

export function computeDurationInFrames(input: Parameters<typeof computeTotalDurationSeconds>[0], fps = 30): number {
  const seconds = computeTotalDurationSeconds(input);
  return Math.max(1, Math.ceil(seconds * fps));
}
