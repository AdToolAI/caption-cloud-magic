import { describe, expect, it } from 'vitest';
import { finalizePlanCanonical } from '../finalizePlanCanonical';
import { ensureProductionPlanEnsemble } from '../ensurePlanEnsemble';
import type { TProductionPlan } from '../productionPlan';

describe('finalizePlanCanonical', () => {
  it('uses scene sum when stale canonical duration contradicts concrete scene durations', () => {
    const plan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 50 },
      scenes: [2.5, 2.5, 5].map((durationSec, idx) => ({
        index: idx + 1,
        label: `Shot ${idx + 1}`,
        durationSec,
        engine: 'cinematic-sync',
        lipSync: true,
        cast: [],
      })),
      unresolved: [],
      _meta: {
        source: 'local-fallback',
        debug: {
          canonical_timing: { durationSec: 50, sceneCount: 3, source: 'explicit-total' },
        },
      },
    } as TProductionPlan;

    const result = finalizePlanCanonical(plan);

    expect(result?.plan.project?.totalDurationSec).toBe(10);
    expect(result?.plan.scenes.map((scene) => scene.durationSec)).toEqual([2.5, 2.5, 5]);
    expect(result?.normalization.durationSource).toBe('scene-sum');
    expect(result?.normalization.consistent).toBe(true);
    expect((result?.plan._meta as any)?.debug?.normalization?.actions).toContain('ignored-canonical:50s→10s');
  });

  it('scrubs ensemble prompt leaks from script-locked solo shots', () => {
    const plan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 5 },
      scenes: [{
        index: 1,
        label: 'Shot 1A',
        durationSec: 5,
        engine: 'cinematic-sync',
        lipSync: true,
        dialogTurns: [{ speakerMentionKey: '@samuel', text: 'Kurz und klar.' }],
        cast: [{ mentionKey: '@samuel', characterId: null, characterName: 'Samuel' }],
        anchorPromptEN: 'Samuel, Matthew, Sarah and Kailee share the scene together in a wide group shot, all faces clearly visible to camera, standing side by side. Samuel speaks to camera.',
        voiceover: { text: 'Samuel, Matthew and Sarah share the scene together. Kurz und klar.' },
      }],
      unresolved: [],
      _meta: { script_timing: { mode: 'SHOT_MARKERS', shots: 1, source: 'briefing' } },
    } as TProductionPlan;

    const scrubbed = ensureProductionPlanEnsemble(plan, { characters: [] } as any);

    expect(scrubbed.scenes[0].anchorPromptEN).not.toMatch(/share the scene|all faces|side by side/i);
    expect(scrubbed.scenes[0].voiceover?.text).not.toMatch(/share the scene/i);
    expect(scrubbed.scenes[0].anchorPromptEN).toMatch(/Samuel speaks/i);
  });

  it('enforces an explicit one-scene briefing contract before showing a green plan', () => {
    const plan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 15 },
      scenes: [1, 2, 3, 4, 5].map((index) => ({
        index,
        label: `Segment ${index}`,
        durationSec: 3,
        engine: 'cinematic-sync',
        lipSync: true,
        cast: [{ mentionKey: `@sprecher-${index}`, characterId: null, characterName: `Sprecher ${index}` }],
        dialogTurns: index <= 4 ? [{ speakerMentionKey: `@sprecher-${index}`, text: `Text ${index}` }] : [],
      })),
      unresolved: [],
      _meta: {
        debug: {
          canonical_timing: {
            durationSec: 15,
            sceneCount: 1,
            continuousScene: true,
            explicitSceneCount: true,
            source: 'explicit-total',
          },
        },
      },
    } as TProductionPlan;

    const result = finalizePlanCanonical(plan);

    expect(result?.plan.project?.totalDurationSec).toBe(15);
    expect(result?.plan.scenes).toHaveLength(1);
    expect(result?.plan.scenes[0].durationSec).toBe(15);
    expect(result?.plan.scenes[0].dialogTurns).toHaveLength(4);
    expect(result?.normalization.sceneCount).toBe(1);
    expect(result?.normalization.consistent).toBe(true);
    expect((result?.plan._meta as any)?.debug?.normalization?.actions).toContain('scene-count:5→1');
  });
});