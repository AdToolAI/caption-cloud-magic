import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Deno edge-function module, imported here as plain TS.
import { materializeCompatibilityOutput } from '../../../../../supabase/functions/_shared/materialize-scene-output.ts';
import { resolveSceneOutput } from '../resolveSceneOutput';

const FN_DIR = resolve(process.cwd(), 'supabase/functions');

/**
 * v430 Step 1 — `materializeCompatibilityOutput` is the ONLY new writer of
 * `clip_url`. These tests pin both the behaviour and the writer inventory.
 */
describe('materializeCompatibilityOutput', () => {
  it('base mode mirrors the plate into clip_url and drops a stale processed result', () => {
    expect(materializeCompatibilityOutput('base', { baseUrl: 'plate.mp4' })).toEqual({
      base_video_url: 'plate.mp4',
      processed_video_url: null,
      clip_url: 'plate.mp4',
    });
  });

  it('processed mode keeps the plate and mirrors the muxed result', () => {
    expect(
      materializeCompatibilityOutput('processed', { baseUrl: 'plate.mp4', processedUrl: 'muxed.mp4' }),
    ).toEqual({
      base_video_url: 'plate.mp4',
      processed_video_url: 'muxed.mp4',
      clip_url: 'muxed.mp4',
    });
  });

  it('processed mode without a mux result falls back to the plate', () => {
    expect(materializeCompatibilityOutput('processed', { baseUrl: 'plate.mp4' }).clip_url).toBe('plate.mp4');
  });

  it('clear mode nulls the whole triple', () => {
    expect(materializeCompatibilityOutput('clear')).toEqual({
      base_video_url: null,
      processed_video_url: null,
      clip_url: null,
    });
  });

  it('blank strings are treated as absent', () => {
    expect(materializeCompatibilityOutput('base', { baseUrl: '   ' }).clip_url).toBeNull();
  });

  it('round-trips through the resolver (writer/reader agreement)', () => {
    const written = materializeCompatibilityOutput('processed', {
      baseUrl: 'plate.mp4',
      processedUrl: 'muxed.mp4',
    });
    const read = resolveSceneOutput({ ...written, lip_sync_status: 'applied' });
    expect(read.effectiveUrl).toBe('muxed.mp4');
    expect(read.baseUrl).toBe('plate.mp4');
    expect(read.isLipsynced).toBe(true);
  });
});

describe('clip_url writer inventory (v430 Step 1)', () => {
  const FINALIZATION_POINTS = [
    'compose-clip-webhook/index.ts',
    'sync-so-webhook/index.ts',
    'remotion-webhook/index.ts',
    'reset-lipsync-scene/index.ts',
    '_shared/scene-run-begin.ts',
    '_shared/scene-hard-reset.ts',
  ];

  it('every migrated finalization point writes through the single writer', () => {
    for (const rel of FINALIZATION_POINTS) {
      const src = readFileSync(resolve(FN_DIR, rel), 'utf8');
      expect(src, rel).toMatch(/materializeCompatibilityOutput\(/);
    }
  });

  it('the migrated finalization points no longer set clip_url directly', () => {
    for (const rel of FINALIZATION_POINTS) {
      const src = readFileSync(resolve(FN_DIR, rel), 'utf8');
      const direct = src
        .split('\n')
        .filter((l) => /^\s*clip_url:/.test(l) && !l.includes('//'));
      expect(direct, `${rel}: ${direct.join(' | ')}`).toEqual([]);
    }
  });
});
