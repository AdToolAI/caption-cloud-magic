/**
 * v430 Step 4 — contract tests for the pure continuity layer.
 *
 * Covers: purity, client/server parity, finality (lip-sync plate is NOT final),
 * non-latching staleness, reset-proof "ever rendered", and the reload-proof
 * dirty state.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isContinuityStale,
  isLipSyncIntentional,
  isSceneOutputFinal,
  needsContinuityRerender,
  sceneWasEverRendered,
} from '../continuity/continuityState';

const CLIENT = 'src/lib/composer/continuity/continuityState.ts';
const SERVER = 'supabase/functions/_shared/continuity-state.ts';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('v430/4 pure layer', () => {
  it('performs no I/O — no supabase, fetch, Deno or DB access', () => {
    for (const p of [CLIENT, SERVER]) {
      // Comments legitimately name the mirror file path — check code only.
      const src = read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/\bDeno\./);
      expect(src).not.toMatch(/\bfrom\(['"]composer_scenes/);
    }
  });

  it('client and backend mirror are identical apart from the doc cross-reference', () => {
    const norm = (s: string) =>
      s.replace(/`(src\/lib\/composer\/continuity\/continuityState|supabase\/functions\/_shared\/continuity-state)\.ts`/g, 'MIRROR');
    expect(norm(read(SERVER))).toBe(norm(read(CLIENT)));
  });
});

describe('isLipSyncIntentional', () => {
  it('matches the established intent rule', () => {
    expect(isLipSyncIntentional({ lip_sync_with_voiceover: true })).toBe(true);
    expect(isLipSyncIntentional({ dialog_mode: true })).toBe(true);
    expect(isLipSyncIntentional({ engine_override: 'cinematic-sync' })).toBe(true);
    expect(isLipSyncIntentional({ engine_override: 'sync-segments' })).toBe(true);
    expect(isLipSyncIntentional({ engine_override: 'native-dialogue' })).toBe(true);
    expect(isLipSyncIntentional({ engine_override: 'ai-seedance25' })).toBe(false);
    expect(isLipSyncIntentional({})).toBe(false);
    expect(isLipSyncIntentional(null)).toBe(false);
  });
});

describe('isSceneOutputFinal', () => {
  it('normal scene: the base plate IS the final output', () => {
    expect(isSceneOutputFinal({ clip_url: 'https://x/plate.mp4' })).toBe(true);
    expect(isSceneOutputFinal({ clip_url: null })).toBe(false);
  });

  it('lip-sync scene: the plate alone is NOT final — only the mux is', () => {
    const plateOnly = { lip_sync_with_voiceover: true, clip_url: 'https://x/plate.mp4' };
    expect(isSceneOutputFinal(plateOnly)).toBe(false);
    expect(
      isSceneOutputFinal({ ...plateOnly, processed_video_url: 'https://x/final.mp4' }),
    ).toBe(true);
  });

  it('an aborted lip-sync after the plate never becomes final', () => {
    expect(
      isSceneOutputFinal({
        engine_override: 'cinematic-sync',
        clip_url: 'https://x/plate.mp4',
        lip_sync_status: 'failed',
      }),
    ).toBe(false);
  });
});

describe('isContinuityStale — value based, never a latch', () => {
  it('unbound scenes are never stale', () => {
    expect(isContinuityStale(null, 'https://x/a.mp4')).toBe(false);
    expect(isContinuityStale('', 'https://x/a.mp4')).toBe(false);
  });

  it('identical URL is not stale', () => {
    expect(isContinuityStale('https://x/a.mp4', 'https://x/a.mp4')).toBe(false);
  });

  it('changed URL is stale', () => {
    expect(isContinuityStale('https://x/a.mp4', 'https://x/b.mp4')).toBe(true);
  });

  it('NULL-safe: output removed → stale', () => {
    expect(isContinuityStale('https://x/a.mp4', null)).toBe(true);
  });

  it('returning to the old URL clears staleness again', () => {
    const bound = 'https://x/a.mp4';
    expect(isContinuityStale(bound, 'https://x/b.mp4')).toBe(true);
    expect(isContinuityStale(bound, bound)).toBe(false);
  });
});

describe('sceneWasEverRendered — reset proof', () => {
  it('first_rendered_at is the primary truth and survives a cleared output', () => {
    expect(
      sceneWasEverRendered({ firstRenderedAt: '2026-08-13T10:00:00Z', legacyEffectiveUrl: null }),
    ).toBe(true);
  });

  it('falls back to a completed plate attempt', () => {
    expect(sceneWasEverRendered({ firstRenderedAt: null, completedPlateAttemptExists: true })).toBe(true);
  });

  it('legacy compatibility branch: an existing output counts', () => {
    expect(sceneWasEverRendered({ legacyEffectiveUrl: 'https://x/a.mp4' })).toBe(true);
  });

  it('a never-rendered scene stays false', () => {
    expect(sceneWasEverRendered({ firstRenderedAt: null, legacyEffectiveUrl: null })).toBe(false);
  });
});

describe('needsContinuityRerender — reload-proof dirty state', () => {
  it('a never-rendered scene is not dirty', () => {
    expect(
      needsContinuityRerender({ everRendered: false, configuredSource: 'Y', renderedSource: 'X' }),
    ).toBe(false);
  });

  it('rendered with X, configured to Y → dirty', () => {
    expect(
      needsContinuityRerender({ everRendered: true, configuredSource: 'Y', renderedSource: 'X' }),
    ).toBe(true);
  });

  it('resolves itself once the render stamps the new source', () => {
    expect(
      needsContinuityRerender({ everRendered: true, configuredSource: 'Y', renderedSource: 'Y' }),
    ).toBe(false);
  });

  it('an unbound scene is never dirty', () => {
    expect(
      needsContinuityRerender({ everRendered: true, configuredSource: null, renderedSource: 'X' }),
    ).toBe(false);
  });
});
