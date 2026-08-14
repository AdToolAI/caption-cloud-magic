/**
 * v430.0 Hotfix — `done` and `applied` are equivalent "lip-sync finished"
 * compatibility values for the READ contract.
 *
 * Regression: the frozen lip-sync chain writes `done`, while v430 Step 1 only
 * understood `applied`. Completed lip-sync scenes therefore resolved to the
 * silent plate instead of the muxed clip.
 */
import { describe, it, expect } from 'vitest';
import { resolveSceneOutput, LIPSYNC_DONE_STATES } from '../resolveSceneOutput';

const PLATE = 'https://storage.example/plate.mp4';
const MUXED = 'https://render.example/muxed.mp4';

describe('v430.0 lip-sync done/applied compatibility', () => {
  it('exposes exactly the two historical completed values', () => {
    expect([...LIPSYNC_DONE_STATES].sort()).toEqual(['applied', 'done']);
  });

  it('resolves a completed `done` scene to the muxed clip', () => {
    const out = resolveSceneOutput({
      lip_sync_status: 'done',
      base_video_url: PLATE,
      processed_video_url: MUXED,
      clip_url: MUXED,
    });
    expect(out.effectiveUrl).toBe(MUXED);
    expect(out.processedUrl).toBe(MUXED);
    expect(out.baseUrl).toBe(PLATE);
    expect(out.source).toBe('processed');
    expect(out.isLipsynced).toBe(true);
  });

  it('resolves a `done` scene without processed column via clip_url (pre-backfill row)', () => {
    const out = resolveSceneOutput({
      lip_sync_status: 'done',
      base_video_url: PLATE,
      clip_url: MUXED,
    });
    expect(out.effectiveUrl).toBe(MUXED);
    expect(out.processedUrl).toBe(MUXED);
    expect(out.baseUrl).toBe(PLATE);
    expect(out.isLipsynced).toBe(true);
  });

  it('gives `done` and `applied` identical semantics', () => {
    const row = { base_video_url: PLATE, clip_url: MUXED };
    expect(resolveSceneOutput({ ...row, lip_sync_status: 'done' })).toEqual(
      resolveSceneOutput({ ...row, lip_sync_status: 'applied' }),
    );
  });

  for (const status of ['failed', 'canceled', 'pending', 'running', null]) {
    it(`keeps the plate for lip_sync_status=${String(status)}`, () => {
      const out = resolveSceneOutput({
        lip_sync_status: status,
        base_video_url: PLATE,
        clip_url: PLATE,
      });
      expect(out.effectiveUrl).toBe(PLATE);
      expect(out.processedUrl).toBeNull();
      expect(out.baseUrl).toBe(PLATE);
      expect(out.isLipsynced).toBe(false);
    });
  }

  it('never infers a processed output for a reset scene', () => {
    const out = resolveSceneOutput({
      lip_sync_status: 'failed',
      base_video_url: PLATE,
      clip_url: MUXED,
    });
    expect(out.processedUrl).toBeNull();
    expect(out.effectiveUrl).toBe(PLATE);
  });

  it('normal (non lip-sync) scene resolves to the base video', () => {
    const out = resolveSceneOutput({ base_video_url: PLATE, clip_url: PLATE });
    expect(out.effectiveUrl).toBe(PLATE);
    expect(out.source).toBe('base');
  });
});
