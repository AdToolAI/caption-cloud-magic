import { describe, expect, it } from 'vitest';
import { canDispatchLipsync, canStartAudioPrep, sceneState } from '../sceneState';

describe('composer client enum contract', () => {
  it('never lets stale legacy lipsync fields override a rendering plate', () => {
    const scene = {
      pipelineState: 'plate_rendering',
      clipStatus: 'ready',
      twoshotStage: 'master_clip',
      lipSyncStatus: 'running',
      clipUrl: 'https://stale.example/old.mp4',
      plateGeneration: 4,
      plateReadyGeneration: 3,
    };

    expect(sceneState(scene)).toBe('plate_rendering');
    expect(canStartAudioPrep(scene)).toBe(false);
    expect(canDispatchLipsync(scene)).toBe(false);
  });

  it('allows audio and lipsync only at their enum gates for the current plate generation', () => {
    const plateReady = {
      pipelineState: 'plate_ready',
      clipUrl: 'https://current.example/plate.mp4',
      plateGeneration: 4,
      plateReadyGeneration: 4,
    };
    const audioReady = { ...plateReady, pipelineState: 'audio_ready' };

    expect(canStartAudioPrep(plateReady)).toBe(true);
    expect(canDispatchLipsync(plateReady)).toBe(false);
    expect(canStartAudioPrep(audioReady)).toBe(false);
    expect(canDispatchLipsync(audioReady)).toBe(true);
  });

  it('projects the legacy clipStatus display value from the state machine only', () => {
    // Alt-Spalte sagt "fertig", der Zustandsautomat sagt "rendert" —
    // die Anzeige muss dem Zustandsautomaten folgen.
    const scene = { pipelineState: 'plate_rendering', clipStatus: 'ready' } as any;
    expect(clipStatusFromState(sceneState(scene))).toBe('generating');

    expect(clipStatusFromState('failed')).toBe('failed');
    expect(clipStatusFromState('idle')).toBe('pending');
    expect(clipStatusFromState('canceled')).toBe('pending');
    expect(clipStatusFromState('lipsync_running')).toBe('ready');
    expect(clipStatusFromState('complete')).toBe('ready');
  });
});
