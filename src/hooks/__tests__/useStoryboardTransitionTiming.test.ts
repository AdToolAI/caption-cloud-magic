import { describe, expect, it } from 'vitest';
import {
  applyCanonicalTimingToPlan,
  detectCanonicalBriefingTiming,
} from '@/hooks/useStoryboardTransition';
import type { ComposerBriefing } from '@/types/video-composer';
import type { TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';

describe('useStoryboardTransition canonical briefing timing', () => {
  const briefing = {
    productName: 'AdTool',
    productDescription: 'Motion-Studio-Briefing\nGesamtdauer: 15 Sekunden / 3 Szenen à 5s\nSZENE 1 — 0–5s\nSZENE 2 — 5–10s\nSZENE 3 — 10–15s',
    duration: 30,
    aspectRatio: '16:9',
    characters: [],
  } as unknown as ComposerBriefing;

  it('detects 15s from the original briefing instead of the 30s board wrapper', () => {
    const wrapper = `${briefing.productDescription}\n\n## Project\n- Total duration: 30s`;
    const timing = detectCanonicalBriefingTiming(briefing, wrapper);

    expect(timing?.durationSec).toBe(15);
    expect(timing?.sceneCount).toBe(3);
  });

  it('normalizes an already-built fallback plan before it reaches the sheet', () => {
    const plan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 30 },
      scenes: [1, 2, 3].map((index) => ({
        index,
        label: `S${index}`,
        durationSec: 10,
        engine: 'cinematic-sync',
        lipSync: true,
        cast: [],
      })),
      unresolved: [],
      _meta: { source: 'local-fallback' },
    } as TProductionPlan;

    const normalized = applyCanonicalTimingToPlan(plan, briefing, `${briefing.productDescription}\n\n## Project\n- Total duration: 30s`);

    expect(normalized.timing?.durationSec).toBe(15);
    expect(normalized.plan.project?.totalDurationSec).toBe(15);
    expect(normalized.plan.scenes.map((scene) => scene.durationSec)).toEqual([5, 5, 5]);
    expect((normalized.plan._meta as any)?.debug?.canonical_timing?.durationSec).toBe(15);
  });
});