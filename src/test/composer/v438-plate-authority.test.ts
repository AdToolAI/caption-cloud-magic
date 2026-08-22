/**
 * V438 — Permanent invariant guard: CURRENT-GENERATION PLATE AUTHORITY.
 *
 * Stale legacy markers (`twoshot_stage`, `lip_sync_status`) of a previous
 * plate generation must never advance a fresh run into audio/lip-sync phases
 * — neither in the derived state, nor in the substate, nor in the
 * auto-trigger eligibility predicate, nor in the global progress counters.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveStateFromLegacy,
  deriveSubstateFromLegacy,
  isCurrentGenerationPlateReady,
  isPlateDependentState,
  legacyClipReadyEquivalentRow,
  sceneState,
  type SceneState,
} from '@/lib/composer/sceneState';

const STAGES = [
  null,
  'audio',
  'master_clip',
  'lipsync',
  'audio_muxing',
  'done',
  'complete',
  'applied',
  'preview',
  'anchor',
  'anchor_soft_pass',
  'circuit_open',
  'deferred',
  'needs_clip_rerender',
  'syncso_pass_2',
  'syncso_retry_1',
  'syncso_fanout_3',
  'failed',
  'audio_mux_failed',
];

const LIPSYNC = [null, 'pending', 'running', 'stitching', 'audio_muxing', 'applied', 'done', 'failed', 'canceled'];

const CLIP_STATUSES = ['pending', 'queued', 'generating', 'ready', 'completed', 'failed', 'canceled'];

const FORBIDDEN: SceneState[] = [
  'audio_prep',
  'audio_ready',
  'lipsync_dispatched',
  'lipsync_running',
  'lipsync_muxing',
  'complete',
];

/** Fresh run: generation bumped, plate of the current generation NOT ready. */
const staleRow = (over: Record<string, unknown> = {}) => ({
  clip_url: 'https://cdn.example/old-generation-plate.mp4',
  plate_generation: 4,
  plate_ready_generation: 3,
  active_run_id: 'run-4',
  clip_status: 'pending',
  twoshot_stage: null,
  lip_sync_status: null,
  ...over,
});

describe('V438 · invariant 1 — current plate not ready ⇒ no plate-dependent state', () => {
  it('holds across the full legacy truth table', () => {
    const violations: string[] = [];
    for (const clip_status of CLIP_STATUSES) {
      for (const twoshot_stage of STAGES) {
        for (const lip_sync_status of LIPSYNC) {
          const row = staleRow({ clip_status, twoshot_stage, lip_sync_status });
          const s = deriveStateFromLegacy(row);
          if (isPlateDependentState(s)) {
            violations.push(`${clip_status}/${twoshot_stage}/${lip_sync_status} → ${s}`);
          }
          expect(FORBIDDEN).not.toContain(s);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('missing clip_url is never plate-ready even with a matching generation', () => {
    expect(
      isCurrentGenerationPlateReady({ clip_url: null, plate_generation: 2, plate_ready_generation: 2 }),
    ).toBe(false);
  });

  it('matching generation + output URL is plate-ready and phases work again', () => {
    const row = staleRow({ plate_ready_generation: 4, clip_status: 'ready', twoshot_stage: 'master_clip' });
    expect(isCurrentGenerationPlateReady(row)).toBe(true);
    expect(deriveStateFromLegacy(row)).toBe('audio_ready');
  });

  it('rows without generation columns keep legacy (URL-only) behaviour', () => {
    expect(
      deriveStateFromLegacy({ clip_status: 'ready', clip_url: 'u', twoshot_stage: 'master_clip' }),
    ).toBe('audio_ready');
  });
});

describe('V438 · invariant 2 — auto-trigger predicate', () => {
  it('is false when plate_ready_generation != plate_generation, even with a clip_url', () => {
    expect(isCurrentGenerationPlateReady(staleRow({ clip_status: 'ready' }))).toBe(false);
  });

  it('is false when the current generation has no ready plate yet (null)', () => {
    expect(
      isCurrentGenerationPlateReady({ clip_url: 'u', plate_generation: 4, plate_ready_generation: null }),
    ).toBe(false);
  });
});

describe('V438 · invariant 3 — failure substate truth', () => {
  it('emits plate_failed when the current plate was never ready', () => {
    const row = staleRow({ clip_status: 'pending', twoshot_stage: 'failed', lip_sync_status: 'failed' });
    expect(deriveStateFromLegacy(row)).toBe('failed');
    expect(deriveSubstateFromLegacy(row)).toBe('plate_failed');
  });

  it('emits lipsync_failed only with a ready current-generation plate', () => {
    const row = staleRow({
      plate_ready_generation: 4,
      clip_status: 'ready',
      twoshot_stage: 'failed',
      lip_sync_status: 'failed',
    });
    expect(deriveSubstateFromLegacy(row)).toBe('lipsync_failed');
  });

  it('terminal states never carry progress-like substates', () => {
    const anchorFail = staleRow({ clip_status: 'failed', twoshot_stage: 'anchor' });
    expect(deriveStateFromLegacy(anchorFail)).toBe('failed');
    expect(deriveSubstateFromLegacy(anchorFail)).toBe('plate_failed');

    const canceled = staleRow({ clip_status: 'canceled', twoshot_stage: 'anchor' });
    expect(deriveStateFromLegacy(canceled)).toBe('canceled');
    expect(deriveSubstateFromLegacy(canceled)).toBeNull();
  });
});

describe('V438 · invariant 5 — failed-with-output is not clips-ready', () => {
  it('legacyClipReadyEquivalentRow stays compatible but the failed class is exclusive', () => {
    const row = {
      pipeline_state: 'failed',
      clip_url: 'https://cdn.example/plate.mp4',
      clip_status: 'ready',
      plate_generation: 2,
      plate_ready_generation: 2,
    };
    expect(legacyClipReadyEquivalentRow(row)).toBe(true);
    // The progress hook additionally excludes failed scenes — assert the exact
    // predicate it uses.
    expect(legacyClipReadyEquivalentRow(row) && sceneState(row) !== 'failed').toBe(false);
  });
});

describe('V438 · invariant 6 — V435/V437 regression sequence', () => {
  it('new generation + stale clip_url + stale master_clip stage stays in the plate phase', () => {
    const row = staleRow({
      clip_status: 'pending',
      twoshot_stage: 'master_clip',
      lip_sync_status: null,
      active_run_id: 'run-4',
    });
    expect(deriveStateFromLegacy(row)).toBe('plate_queued');
    expect(isCurrentGenerationPlateReady(row)).toBe(false);
  });

  it('and while the new plate renders it reports plate_rendering, not audio_ready', () => {
    const row = staleRow({ clip_status: 'generating', twoshot_stage: 'master_clip' });
    expect(deriveStateFromLegacy(row)).toBe('plate_rendering');
  });
});
