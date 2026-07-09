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

  it('detects "Länge: ca. 15 Sekunden" as explicit total', () => {
    const b = { productName: 'X', productDescription: 'Länge: ca. 15 Sekunden', duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const timing = detectCanonicalBriefingTiming(b, b.productDescription!);
    expect(timing?.durationSec).toBe(15);
    expect(timing?.source).toBe('explicit-total');
  });

  it('does not treat "Alter: 30–50 Jahre" as a time window', () => {
    const text = 'Casting:\nSprecher A — Alter: 30–50 Jahre\nSprecher B — Alter: 25–40 Jahre';
    const b = { productName: 'X', productDescription: text, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const timing = detectCanonicalBriefingTiming(b, text);
    expect(timing).toBeNull();
  });

  it('picks Länge over age-range noise in an AdTool-style briefing', () => {
    const text = [
      'AdTool AI Werbevideo',
      'Länge: ca. 15 Sekunden',
      'Szenen: 3 Szenen',
      'Sprecher 1 — Alter: 30–45 Jahre',
      'Sprecher 2 — Alter: 25–40 Jahre',
      'Sprecher 3 — Alter: 30–50 Jahre',
      'Sprecher 4 — Alter: 25–40 Jahre',
    ].join('\n');
    const b = { productName: 'AdTool', productDescription: text, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const timing = detectCanonicalBriefingTiming(b, text);
    expect(timing?.durationSec).toBe(15);
    expect(timing?.sceneCount).toBe(3);
  });
});