import { describe, expect, it } from 'vitest';
import {
  applyCanonicalTimingToPlan,
  detectCanonicalBriefingTiming,
} from '@/hooks/useStoryboardTransition';
import type { ComposerBriefing } from '@/types/video-composer';
import type { TProductionPlan } from '@/lib/video-composer/briefing/productionPlan';

describe('useStoryboardTransition canonical briefing timing', () => {
  const adToolBriefing = [
    'Motion-Studio-Briefing',
    'AdTool AI Werbevideo — „Vier Sprecher. Ein perfekter Lip-Sync.“',
    'Format: Realistisches AI-Werbevideo',
    'Länge: ca. 15 Sekunden',
    'Szenen: 3 Szenen',
    'Sprecher: 4 Lip-Sync-Sprecher',
    'Ziel: In 15 Sekunden zeigen, dass AdTool AI realistische Lip-Sync-Videos mit mehreren Sprechern erstellen kann.',
    'Sprecher 1 — Alter: 30–45 Jahre',
    'Sprecher 2 — Alter: 25–40 Jahre',
    'Sprecher 3 — Alter: 30–50 Jahre',
    'Sprecher 4 — Alter: 25–40 Jahre',
    'Szene 1 — Der Einstieg: AdTool AI startet den Flow',
    'Dauer: ca. 0–5 Sekunden',
    'Shot 1A — Sprecher 1',
    'Zeit: ca. 0–2,5 Sekunden',
    'Text:',
    '„Mit AdTool AI erstellst du…“',
    'Shot 1B — Sprecher 2',
    'Zeit: ca. 2,5–5 Sekunden',
    'Text:',
    '„…realistische Lip-Sync-Videos…“',
    'Szene 2 — Der Proof: Mehrere Sprecher, ein Satzfluss',
    'Dauer: ca. 5–10 Sekunden',
    'Shot 2A — Sprecher 3',
    'Zeit: ca. 5–7,5 Sekunden',
    'Text:',
    '„…mit mehreren Sprechern…“',
    'Shot 2B — Sprecher 4',
    'Zeit: ca. 7,5–10 Sekunden',
    'Text:',
    '„…die perfekt zusammenpassen.“',
    'Szene 3 — Split-Screen + Endcard',
    'Dauer: ca. 10–15 Sekunden',
    'Kompakte Shotliste',
    '0,0–2,5 Sek.',
    'Sprecher 1, Stadtstraße, leichter Walk-in:',
    '„Mit AdTool AI erstellst du…“',
    '2,5–5,0 Sek.',
    'Sprecher 2, modernes Büro, leichter Walk-in:',
    '„…realistische Lip-Sync-Videos…“',
    '5,0–7,5 Sek.',
    'Sprecher 3, Café/Fußgängerzone, leichter Walk-in:',
    '„…mit mehreren Sprechern…“',
    '7,5–10,0 Sek.',
    'Sprecher 4, Creator-Studio, leichter Walk-in:',
    '„…die perfekt zusammenpassen.“',
    '10,0–12,5 Sek.',
    'Split-Screen mit allen vier Sprechern.',
    '12,5–15,0 Sek.',
    'Endcard:',
    'AdTool AI',
  ].join('\n');

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

  it('detects the full AdTool briefing as 15s / 3 scenes despite ages and sub-shot ranges', () => {
    const b = { productName: 'AdTool', productDescription: adToolBriefing, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const timing = detectCanonicalBriefingTiming(b, `${adToolBriefing}\n\n## Project\n- Total duration: 30s`);
    expect(timing).toMatchObject({ durationSec: 15, sceneCount: 3, source: 'explicit-total', explicitSceneCount: true });
  });

  it('overrides a stale 50s server plan with the explicit 15s briefing duration', () => {
    const b = { productName: 'AdTool', productDescription: adToolBriefing, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const staleServerPlan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 50 },
      scenes: [16.7, 16.7, 16.6].map((durationSec, idx) => ({
        index: idx + 1,
        label: `S${idx + 1}`,
        durationSec,
        engine: 'cinematic-sync',
        lipSync: true,
        cast: [],
      })),
      unresolved: [],
      _meta: {
        script_timing: { mode: 'SHOT_MARKERS', shots: 3, source: 'briefing' },
        debug: { canonical_timing: { durationSec: 50, sceneCount: 3, source: 'explicit-total' } },
      },
    } as TProductionPlan;

    const normalized = applyCanonicalTimingToPlan(staleServerPlan, b, adToolBriefing);
    expect(normalized.timing?.durationSec).toBe(15);
    expect(normalized.plan.project?.totalDurationSec).toBe(15);
    expect(normalized.plan.scenes.map((scene) => scene.durationSec)).toEqual([5, 5, 5]);
    expect((normalized.plan._meta as any)?.debug?.canonical_timing).toMatchObject({
      durationSec: 15,
      sceneCount: 3,
      source: 'explicit-total',
    });
  });

  it('treats "1 durchgehende Szene" as one scene with internal speaker turns, not five scenes', () => {
    const continuousBriefing = [
      'AdTool AI Spot — „Vier Sprecher. Eine Szene. Perfekter Lip-Sync.“',
      'Länge: 15 Sekunden',
      'Szenen: 1 durchgehende Szene',
      'Sprecher: 4 Personen',
      'Timing:',
      '0–3s Sprecher 1: „Mit AdTool AI erstellst du…“',
      '3–6s Sprecher 2: „…realistische Lip-Sync-Videos…“',
      '6–9s Sprecher 3: „…mit mehreren Sprechern…“',
      '9–12s Sprecher 4: „…die perfekt zusammenpassen.“',
      '12–15s Endcard: AdTool AI',
    ].join('\n');
    const b = { productName: 'AdTool', productDescription: continuousBriefing, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const timing = detectCanonicalBriefingTiming(b, continuousBriefing);
    expect(timing).toMatchObject({
      durationSec: 15,
      sceneCount: 1,
      continuousScene: true,
      explicitSceneCount: true,
      source: 'explicit-total',
    });
  });

  it('merges a five-scene server plan back to one scene for a continuous-scene briefing', () => {
    const continuousBriefing = [
      'Länge: 15 Sekunden',
      'Szenen: 1 durchgehende Szene',
      '0–3s Sprecher 1: „Mit AdTool AI erstellst du…“',
      '3–6s Sprecher 2: „…realistische Lip-Sync-Videos…“',
      '6–9s Sprecher 3: „…mit mehreren Sprechern…“',
      '9–12s Sprecher 4: „…die perfekt zusammenpassen.“',
      '12–15s Endcard: AdTool AI',
    ].join('\n');
    const b = { productName: 'AdTool', productDescription: continuousBriefing, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const badPlan = {
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
      _meta: { source: 'ai' },
    } as TProductionPlan;

    const normalized = applyCanonicalTimingToPlan(badPlan, b, continuousBriefing);
    expect(normalized.plan.project?.totalDurationSec).toBe(15);
    expect(normalized.plan.scenes).toHaveLength(1);
    expect(normalized.plan.scenes[0].durationSec).toBe(15);
    expect(normalized.plan.scenes[0].dialogTurns).toHaveLength(4);
  });

  it('prefers the server briefing_contract over conflicting client detection', () => {
    // Briefing text says 30s / 3 scenes but the server contract insists on 15s / 1 scene.
    // The server is authoritative — the client must NOT re-detect and override.
    const briefingText = [
      'Länge: 30 Sekunden',
      'Szenen: 3 Szenen',
      '0–10s Sprecher 1: „…“',
      '10–20s Sprecher 2: „…“',
      '20–30s Sprecher 3: „…“',
    ].join('\n');
    const b = { productName: 'AdTool', productDescription: briefingText, duration: 30, aspectRatio: '16:9', characters: [] } as unknown as ComposerBriefing;
    const plan = {
      project: { name: 'AdTool', aspectRatio: '16:9', totalDurationSec: 15 },
      scenes: [{
        index: 1,
        label: 'Scene 1',
        durationSec: 15,
        engine: 'cinematic-sync',
        lipSync: true,
        cast: [],
      }],
      unresolved: [],
      _meta: {
        source: 'ai',
        debug: {
          briefing_contract: {
            durationSec: 15,
            sceneCount: 1,
            explicitSceneCount: true,
            continuousScene: true,
            source: 'explicit-briefing',
            scriptTimingMode: 'FREETEXT',
            shots: 0,
            pipelineVersion: 'server-v214',
          },
        },
      },
    } as unknown as TProductionPlan;

    const normalized = applyCanonicalTimingToPlan(plan, b, briefingText);
    expect(normalized.timing?.durationSec).toBe(15);
    expect(normalized.timing?.sceneCount).toBe(1);
    expect(normalized.plan.project?.totalDurationSec).toBe(15);
    expect(normalized.plan.scenes).toHaveLength(1);
  });
});