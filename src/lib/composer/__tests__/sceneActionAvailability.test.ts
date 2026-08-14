/**
 * v430 Schritt 6.1 — Verfügbarkeitsregeln + Akzeptanzregel „Einzigartigkeit".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sceneActionAvailability, type SceneActionInput } from '../sceneActionAvailability';

const base: SceneActionInput = {
  state: 'complete',
  substate: null,
  lipSyncIntentional: false,
  engineOverride: null,
  continuityConfigured: false,
  continuityStale: false,
  predecessorFinal: false,
  predecessorHasOutput: false,
};

describe('sceneActionAvailability', () => {
  it('hides everything for a plain finished scene', () => {
    const a = sceneActionAvailability(base);
    expect(a.anyVisible).toBe(false);
  });

  it('shows lip-sync restart on lip-sync intent and disables it while running', () => {
    expect(sceneActionAvailability({ ...base, lipSyncIntentional: true }).lipSyncRestart)
      .toEqual({ visible: true, disabled: false });
    expect(
      sceneActionAvailability({ ...base, lipSyncIntentional: true, state: 'lipsync_running' })
        .lipSyncRestart.disabled,
    ).toBe(true);
  });

  it('treats an existing substate as a lip-sync artifact', () => {
    expect(
      sceneActionAvailability({ ...base, state: 'idle', substate: 'twoshot_audio_prep' })
        .lipSyncRestart.visible,
    ).toBe(true);
  });

  it('offers the full regenerate only for the cinematic-sync engine', () => {
    expect(sceneActionAvailability(base).fullRegenerate.visible).toBe(false);
    const a = sceneActionAvailability({ ...base, engineOverride: 'cinematic-sync' });
    expect(a.fullRegenerate).toEqual({ visible: true, disabled: false });
    expect(
      sceneActionAvailability({
        ...base,
        engineOverride: 'cinematic-sync',
        state: 'plate_rendering',
      }).fullRegenerate.disabled,
    ).toBe(true);
  });

  it('shows continuity update only when configured AND stale', () => {
    expect(
      sceneActionAvailability({ ...base, continuityStale: true }).continuityUpdate.visible,
    ).toBe(false);
    const a = sceneActionAvailability({
      ...base,
      continuityConfigured: true,
      continuityStale: true,
      predecessorFinal: true,
      predecessorHasOutput: true,
    });
    expect(a.continuityUpdate).toEqual({ visible: true, disabled: false });
  });

  it('disables continuity update while the predecessor output is not final', () => {
    const a = sceneActionAvailability({
      ...base,
      continuityConfigured: true,
      continuityStale: true,
      predecessorFinal: false,
      predecessorHasOutput: false,
    });
    expect(a.continuityUpdate).toEqual({ visible: true, disabled: true });
  });

  it('disables every visible action while a local action is busy', () => {
    const a = sceneActionAvailability({
      ...base,
      busy: true,
      lipSyncIntentional: true,
      engineOverride: 'cinematic-sync',
      continuityConfigured: true,
      continuityStale: true,
      predecessorFinal: true,
      predecessorHasOutput: true,
    });
    expect(a.lipSyncRestart.disabled).toBe(true);
    expect(a.fullRegenerate.disabled).toBe(true);
    expect(a.continuityUpdate.disabled).toBe(true);
  });
});

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('v430 6.1 — Einzigartigkeit der Einstiegspunkte', () => {
  it('SceneCard has no parallel restart / regenerate buttons left', () => {
    const src = read('src/components/video-composer/SceneCard.tsx');
    expect(src).toContain('<SceneActionsMenu');
    expect(src).not.toContain('🔁 {tx({ de: "Lip-Sync neu rendern"');
    expect(src).not.toContain('🎥 Clip + Lip-Sync neu rendern');
  });

  it('SceneContinuityStatus is display-only (no continuity update button)', () => {
    const src = read('src/components/video-composer/SceneContinuityStatus.tsx');
    expect(src).not.toContain('<Button');
    expect(src).toContain('useSceneContinuityAction');
  });

  it('the continuity write lives in exactly one place', () => {
    const hook = read('src/hooks/useSceneContinuityAction.ts');
    expect(hook).toContain('continuity_source_clip_url');
    const status = read('src/components/video-composer/SceneContinuityStatus.tsx');
    expect(status).not.toContain('continuity_source_clip_url');
  });
});
