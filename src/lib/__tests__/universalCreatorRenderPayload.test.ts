import { describe, it, expect } from 'vitest';
import { buildUniversalCreatorCustomizations } from '../universalCreatorRenderPayload';

/**
 * Regression guard: the Universal Content Creator must ALWAYS emit
 * `rawMediaMode: true` in both preview and export payloads. Cinematic
 * post-processing (mood/grain/vignette/KenBurns/parallax/overlays/scene-fx)
 * is exclusive to the Director's Cut and only when the customer opts in.
 */
describe('buildUniversalCreatorCustomizations — rawMediaMode invariant', () => {
  it('emits rawMediaMode: true for an empty input', () => {
    const out = buildUniversalCreatorCustomizations({});
    expect(out.rawMediaMode).toBe(true);
  });

  it('emits rawMediaMode: true with voiceover + music + scenes', () => {
    const out = buildUniversalCreatorCustomizations({
      contentConfig: {
        voiceoverUrl: 'https://example.com/vo.mp3',
        voiceoverDuration: 12,
        voiceoverVolume: 0.9,
        useOriginalAudio: true,
        originalAudioVolume: 0.5,
      } as any,
      selectedMusicUrl: 'https://example.com/music.mp3',
      musicVolume: 0.3,
      scenes: [
        { id: 's1', duration: 4, background: { type: 'color', color: '#000' } },
        { id: 's2', duration: 6, background: { type: 'color', color: '#111' } },
      ],
    });
    expect(out.rawMediaMode).toBe(true);
  });

  it('cannot be overridden by arbitrary extra input fields', () => {
    const out = buildUniversalCreatorCustomizations({
      // @ts-expect-error — proving no back-door exists
      rawMediaMode: false,
    });
    expect(out.rawMediaMode).toBe(true);
  });
});
