/**
 * FA-3/P1 — Stitch Finalizer Output Materialization (reader-side proof).
 *
 * The DB finalizer `composer_finalize_lipsync_scene(..., 'stitch:done')` now
 * materializes `processed_video_url = _final_url` in the same atomic commit as
 * ledger `succeeded` + scene `complete`. These tests pin the resulting row
 * shape against the FROZEN v430 read contract — neither `resolveSceneOutput()`
 * nor `isSceneOutputFinal()` is changed by this fix.
 */
import { describe, it, expect } from 'vitest';
import { resolveSceneOutput } from '../resolveSceneOutput';
import { isSceneOutputFinal } from '../../continuity/continuityState';

const PLATE = 'https://storage.example/plate.mp4';
const FINAL = 'https://render.example/final-stitched.mp4';

/** Row shape exactly as written by the FA-3/P1 finalizer. */
const finalizedLipSyncScene = {
  lip_sync_with_voiceover: true,
  dialog_mode: true,
  engine_override: 'cinematic-sync',
  pipeline_state: 'complete',
  lip_sync_status: 'done',
  base_video_url: PLATE,
  lip_sync_source_clip_url: PLATE,
  processed_video_url: FINAL,
  clip_url: FINAL,
};

/** Pre-fix row: complete, but the finalizer never materialized processed. */
const preFixLipSyncScene = {
  ...finalizedLipSyncScene,
  processed_video_url: null,
};

describe('FA-3/P1 finalizer output materialization', () => {
  it('resolves the finalized lip-sync scene as processed output', () => {
    const out = resolveSceneOutput(finalizedLipSyncScene);
    expect(out.source).toBe('processed');
    expect(out.processedUrl).toBe(FINAL);
    expect(out.effectiveUrl).toBe(FINAL);
    expect(out.baseUrl).toBe(PLATE);
    expect(out.isLipsynced).toBe(true);
  });

  it('marks the finalized intentional lip-sync scene as FINAL', () => {
    expect(isSceneOutputFinal(finalizedLipSyncScene)).toBe(true);
  });

  it('keeps the pre-fix row (complete, no processed_video_url) NON-final', () => {
    // Reader must NOT be softened: clip_url alone is not a processed output.
    expect(isSceneOutputFinal(preFixLipSyncScene)).toBe(false);
  });

  it('leaves the non-lip-sync / plate output contract unchanged', () => {
    const plateScene = {
      lip_sync_with_voiceover: false,
      dialog_mode: false,
      engine_override: null,
      pipeline_state: 'complete',
      lip_sync_status: null,
      base_video_url: PLATE,
      processed_video_url: null,
      clip_url: PLATE,
    };
    const out = resolveSceneOutput(plateScene);
    expect(out.source).toBe('base');
    expect(out.effectiveUrl).toBe(PLATE);
    expect(out.processedUrl).toBeNull();
    expect(out.isLipsynced).toBe(false);
    expect(isSceneOutputFinal(plateScene)).toBe(true);
  });

  it('does not treat clip_url as a substitute for processed on intentional lip-sync', () => {
    const out = resolveSceneOutput(preFixLipSyncScene);
    // Legacy compatibility branch still surfaces the URL for playback …
    expect(out.effectiveUrl).toBe(FINAL);
    // … but finality (continuity binding) stays false until the writer is fixed.
    expect(isSceneOutputFinal(preFixLipSyncScene)).toBe(false);
  });
});
