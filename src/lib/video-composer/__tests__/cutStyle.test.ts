/**
 * v430 Schritt 6.2 — Mapping-Grenzen `cutStyle` ⇄ `transition_type`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cutStyleFromRow, cutStyleToRow } from '../cutStyle';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('cutStyleFromRow / cutStyleToRow', () => {
  it('round-trips a concrete value through both directions', () => {
    for (const value of ['none', 'fade', 'crossfade', 'whip_pan']) {
      const domain = cutStyleFromRow({ transition_type: value }, 'crossfade' as any);
      expect(domain).toBe(value);
      expect(cutStyleToRow(domain, 'fade' as any)).toBe(value);
    }
  });

  it('falls back on NULL, undefined, missing rows and empty strings', () => {
    expect(cutStyleFromRow({ transition_type: null }, 'crossfade' as any)).toBe('crossfade');
    expect(cutStyleFromRow({}, 'crossfade' as any)).toBe('crossfade');
    expect(cutStyleFromRow(null, 'crossfade' as any)).toBe('crossfade');
    expect(cutStyleFromRow({ transition_type: '  ' }, 'crossfade' as any)).toBe('crossfade');
    expect(cutStyleToRow(null, 'fade' as any)).toBe('fade');
    expect(cutStyleToRow(undefined, 'none' as any)).toBe('none');
    expect(cutStyleToRow('', 'none' as any)).toBe('none');
  });

  it('supports the snapshot boundary with a NULL fallback', () => {
    expect(cutStyleToRow(undefined, null)).toBeNull();
    expect(cutStyleToRow('fade', null)).toBe('fade');
  });

  it('keeps the update boundary default-free (undefined stays undefined)', () => {
    expect(cutStyleToRow(undefined, undefined)).toBeUndefined();
  });
});

describe('Default-Vertrag der Create/Clone/Persistenz-Pfade', () => {
  const cases: Array<[string, string, string]> = [
    // [Datei, erwarteter Aufruf, Beschreibung]
    ["src/hooks/useComposerPersistence.ts", "cutStyleToRow(scene.cutStyle, 'fade' as any)", 'Insert'],
    ["src/hooks/useComposerPersistence.ts", 'cutStyleToRow(scene.cutStyle, undefined)', 'Update'],
    ["src/hooks/useApplyProductionPlan.ts", "cutStyleToRow(s.cutStyle, 'crossfade' as any)", 'Plan-Insert'],
    ["src/lib/adDirector/spawnAdCampaignChildren.ts", "cutStyleToRow(s.cutStyle, 'fade' as any)", 'Ad-Child-Insert'],
    ["src/lib/video-composer/sceneSnapshot.ts", 'cutStyleToRow(scene.cutStyle, null)', 'Snapshot'],
    ["src/components/video-composer/VideoComposerDashboard.tsx", "cutStyleToRow(p.cutStyle, 'none' as any)", 'Create'],
    ["src/components/video-composer/VideoComposerDashboard.tsx", 'cutStyleToRow(baseScene.cutStyle, undefined)', 'Clone/Duplicate'],
    ["src/components/video-composer/VideoComposerDashboard.tsx", "cutStyleFromRow(row, local?.cutStyle ?? ('crossfade' as any))", 'Hydration'],
  ];

  it.each(cases)('%s keeps the %s default (%s)', (file, call) => {
    expect(read(file)).toContain(call);
  });
});

describe('Keine doppelte Domain-Wahrheit', () => {
  it('ComposerScene has cutStyle and no transitionType alias', () => {
    const types = read('src/types/video-composer.ts');
    expect(types).toContain('cutStyle: TransitionStyle;');
    expect(types).not.toMatch(/^\s*transitionType\??:/m);
  });

  it('composer domain/UI code no longer mentions transitionType', () => {
    const files = [
      'src/components/video-composer/StoryboardTab.tsx',
      'src/components/video-composer/StoryboardScenePlayerList.tsx',
      'src/components/video-composer/SceneTransitionInlineEditor.tsx',
      'src/components/video-composer/ClipsTab.tsx',
      'src/components/video-composer/ComposerSequencePreview.tsx',
      'src/lib/video-composer/briefing/driftDetector.ts',
      'src/lib/adDirector/buildAdScenes.ts',
      'src/lib/shotDirector/spawnCoverageScenes.ts',
      'src/hooks/useApplyBriefingManifest.ts',
    ];
    for (const f of files) expect(read(f), f).not.toContain('transitionType');
  });

  it('the snake_case column only appears at declared mapping boundaries', () => {
    const boundaries = [
      'src/lib/video-composer/cutStyle.ts',
      'src/hooks/useComposerPersistence.ts',
      'src/hooks/useApplyProductionPlan.ts',
      'src/lib/adDirector/spawnAdCampaignChildren.ts',
      'src/lib/video-composer/sceneSnapshot.ts',
      'src/components/video-composer/VideoComposerDashboard.tsx',
    ];
    for (const f of boundaries) expect(read(f)).toContain('transition_type');
    for (const f of [
      'src/components/video-composer/StoryboardTab.tsx',
      'src/components/video-composer/ClipsTab.tsx',
      'src/components/video-composer/SceneTransitionInlineEditor.tsx',
    ]) {
      expect(read(f), f).not.toContain('transition_type');
    }
  });
});
