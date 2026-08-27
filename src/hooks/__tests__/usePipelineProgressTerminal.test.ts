/**
 * V515 — TERMINAL PIPELINE UI RECONCILIATION
 *
 * Scene 67b392b1, generation 14, run 6c3a617b. The backend reached a terminal
 * failed state at 01:54:06Z — `pipeline_state = failed`,
 * `pipeline_substate = lipsync_failed`, `dialog_shots.error =
 * preclip_mouth_roi_outside_crop`, refunded. The Composer nevertheless showed
 * 99 %, "Starting lip-sync…" and an elapsed timer that reached 109 minutes.
 *
 * These tests drive the real hook with the real row. They are not source
 * assertions: the stale state lived in an interaction between the derived
 * phase arithmetic and an optimistic event flag that only a running hook
 * reproduces.
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineProgress } from '@/hooks/usePipelineProgress';
import { emitPipelineEvent } from '@/lib/pipelineEvents';
import { sceneState, sceneSubstate, isSceneSettled } from '@/lib/composer/sceneState';
import { sceneStatusPresentation } from '@/lib/composer/status/sceneStatusPresenter';
import { presentSceneError } from '@/lib/composer/errors/sceneErrorPresenter';

const RUN_14 = '6c3a617b-0873-4f42-b34a-e86409b11b33';
const RUN_15 = '9f2b1c44-1111-4111-8111-222222222222';
const SCENE = '67b392b1-aca1-489d-b773-d604deb22623';
const FINISHED_AT = '2026-08-27T01:54:06.357Z';

/** The generation-14 row, exactly as production held it. */
function gen14Failed(): any {
  return {
    id: SCENE,
    clipSource: 'ai-veo',
    // The plate of the clip phase that DID succeed. This URL is what made the
    // scene invisible to the failure count — it read as "has output".
    clipUrl: 'https://cdn.example/scene-67b392b1-plate.mp4',
    clipStatus: 'failed',
    clipError: 'preclip_mouth_roi_outside_crop',
    dialogMode: true,
    lipSyncWithVoiceover: true,
    activeRunId: RUN_14,
    plateGeneration: 14,
    plateReadyGeneration: 14,
    pipelineState: 'failed',
    pipelineSubstate: 'lipsync_failed',
    lipSyncStatus: 'failed',
    twoshotStage: 'failed',
    refunded: true,
    dialogShots: {
      status: 'failed',
      error: 'preclip_mouth_roi_outside_crop',
      finished_at: FINISHED_AT,
      v510_terminal: {
        reason: 'preclip_mouth_roi_outside_crop',
        pass_idx: 5,
        run_id: RUN_14,
      },
      passes: [
        { idx: 0, status: 'rendering', job_id: 'sync-0' },
        { idx: 1, status: 'rendering', job_id: 'sync-1' },
        { idx: 2, status: 'rendering', job_id: 'sync-2' },
        { idx: 3, status: 'rendering', job_id: 'sync-3' },
        { idx: 4, status: 'rendering', job_id: 'sync-4' },
        { idx: 5, status: 'failed', error: 'preclip_mouth_roi_outside_crop' },
      ],
    },
  };
}

/** The same scene while it was genuinely running. */
function gen14Running(): any {
  return {
    ...gen14Failed(),
    clipStatus: 'generating',
    clipError: null,
    pipelineState: 'lipsync_running',
    pipelineSubstate: null,
    lipSyncStatus: 'running',
    twoshotStage: 'lipsync',
    refunded: false,
    dialogShots: {
      status: 'lipsyncing',
      passes: [{ idx: 0, status: 'rendering', job_id: 'sync-0' }],
    },
  };
}

const ASSEMBLY: any = { voiceover: { enabled: false, audioUrl: null }, music: null };

const render = (scenes: any[]) =>
  renderHook(
    ({ s }: { s: any[] }) =>
      usePipelineProgress({ scenes: s, assemblyConfig: ASSEMBLY, projectId: 'v515' }),
    { initialProps: { s: scenes } },
  );

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

/** The incident: the user clicked generate, then the run terminalized. */
function runThenFail(initial: any[], failed: any[]) {
  const h = render(initial);
  act(() => {
    emitPipelineEvent({ type: 'clips:start', sceneIds: [SCENE] });
    emitPipelineEvent({ type: 'lipsync:start' });
  });
  act(() => { vi.advanceTimersByTime(60_000); });
  h.rerender({ s: failed });
  act(() => { vi.advanceTimersByTime(120_000); });
  return h;
}

const statusOf = (h: any, id: string) =>
  h.result.current.phases.find((p: any) => p.id === id)?.status ?? 'absent';

describe('V515 — a terminal scene must not present as running', () => {
  it('1/3. the generation-14 failure stops the run instead of animating on', () => {
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    expect(h.result.current.isActive).toBe(false);
    expect(h.result.current.hasFailure).toBe(true);
    // No phase may still claim to be running — that is what drove the
    // spinner, the soft-floor animation and the 1 Hz tick.
    expect(h.result.current.phases.every((p: any) => p.status !== 'running')).toBe(true);
    expect(statusOf(h, 'lipsync')).toBe('failed');
  });

  it('2. the elapsed timer never advances again after terminalization', () => {
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    const atFailure = h.result.current.elapsedSeconds;
    for (const step of [60_000, 300_000, 600_000]) {
      act(() => { vi.advanceTimersByTime(step); });
      h.rerender({ s: [gen14Failed()] });
      expect(h.result.current.elapsedSeconds).toBeLessThanOrEqual(atFailure);
      expect(h.result.current.etaSeconds).toBe(0);
    }
  });

  it('5/8/11. the failed run releases the lip-sync slot indicator', () => {
    // The Sync.so slot chip and its 5 s poll are gated on the lipsync phase
    // being `running`. A terminal phase therefore hides the chip and clears
    // the interval — no separate release path is needed, only a truthful
    // status. "Slots 0/3" stayed on screen because the status lied.
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    expect(statusOf(h, 'lipsync')).not.toBe('running');
    expect(h.result.current.isStalled).toBe(false);
  });

  it('6/7. late sibling passes never resurrect the run', () => {
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    // T2..T6 — passes 3, 1, 4, 0 and 2 complete after the root already failed
    // and are reconciled by ssw:terminal_reconcile.
    for (const idx of [3, 1, 4, 0, 2]) {
      const late = gen14Failed();
      late.dialogShots.passes = late.dialogShots.passes.map((p: any) =>
        p.idx === idx
          ? { ...p, status: 'done', output_url: `https://cdn.example/pass-${idx}.mp4`, finished_at: FINISHED_AT }
          : p,
      );
      h.rerender({ s: [late] });
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(h.result.current.isActive).toBe(false);
      expect(h.result.current.hasFailure).toBe(true);
      expect(h.result.current.phases.every((p: any) => p.status !== 'running')).toBe(true);
    }
  });

  it('14. a late refund flag is financial metadata, not liveness', () => {
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    const refunded = { ...gen14Failed(), refunded: true, refundedAt: FINISHED_AT };
    h.rerender({ s: [refunded] });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(h.result.current.isActive).toBe(false);
    expect(h.result.current.hasFailure).toBe(true);
  });

  it('9/10. a genuinely running scene still runs, and a clean finish completes', () => {
    const h = render([gen14Running()]);
    act(() => { emitPipelineEvent({ type: 'lipsync:start' }); });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(h.result.current.isActive).toBe(true);
    expect(h.result.current.hasFailure).toBe(false);

    const done = {
      ...gen14Running(),
      clipStatus: 'ready',
      pipelineState: 'complete',
      lipSyncStatus: 'applied',
      twoshotStage: 'done',
      lipSyncAppliedAt: FINISHED_AT,
      dialogShots: { status: 'done', passes: [{ idx: 0, status: 'done' }] },
    };
    h.rerender({ s: [done] });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(h.result.current.hasFailure).toBe(false);
    expect(h.result.current.isActive).toBe(false);
  });

  it('11/12. a newer generation-15 run starts fresh and is not poisoned by 14', () => {
    const h = runThenFail([gen14Running()], [gen14Failed()]);
    expect(h.result.current.isActive).toBe(false);

    const gen15 = {
      ...gen14Running(),
      activeRunId: RUN_15,
      plateGeneration: 15,
      plateReadyGeneration: 14,
      clipUrl: null,
      pipelineState: 'plate_rendering',
      clipStatus: 'generating',
      lipSyncStatus: null,
      twoshotStage: null,
      dialogShots: null,
      refunded: false,
    };
    act(() => { emitPipelineEvent({ type: 'clips:start', sceneIds: [SCENE] }); });
    h.rerender({ s: [gen15] });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(h.result.current.isActive).toBe(true);
    expect(h.result.current.hasFailure).toBe(false);
    expect(h.result.current.overallPercent).toBeLessThan(50);

    // And a stale generation-14 pass arriving mid-run must not stop 15.
    const staleCallback = {
      ...gen15,
      dialogShots: {
        status: 'failed',
        v510_terminal: { reason: 'preclip_mouth_roi_outside_crop', pass_idx: 5, run_id: RUN_14 },
      },
    };
    h.rerender({ s: [staleCallback] });
    act(() => { vi.advanceTimersByTime(5_000); });
    // The scene row itself is the authority, and it says run 15 / plate_rendering.
    expect(sceneState(staleCallback)).toBe('plate_rendering');
    expect(isSceneSettled(staleCallback)).toBe(false);
  });
});

describe('V515 — the scene presentation tells the truth', () => {
  it('4/10. the card resolves to a failed state, never to "Starting lip-sync"', () => {
    const row = gen14Failed();
    expect(sceneState(row)).toBe('failed');
    expect(sceneSubstate(row)).toBe('lipsync_failed');
    expect(isSceneSettled(row)).toBe(true);

    const p = sceneStatusPresentation(sceneState(row), sceneSubstate(row), {
      errorCode: row.clipError,
    });
    expect(p.key).toBe('scene.status.failed');
    expect(p.tone).toBe('error');
    expect(p.detailKey).toBe('scene.status.detail.lipsync_failed');
    // The dispatched/running keys are what produced "Starting lip-sync…".
    expect(p.key).not.toBe('scene.status.lipsync_dispatched');
    expect(p.key).not.toBe('scene.status.lipsync_running');
  });

  it('4. the failure reason reaches the customer through the existing table', () => {
    const e = presentSceneError('preclip_mouth_roi_outside_crop');
    expect(e.kind).toBe('known');
    expect(e.code).toBe('preclip_mouth_roi_outside_crop');
    expect(e.headline.en).toMatch(/crop/i);
    // Technical detail is retained for the diagnostics slot.
    expect(e.raw).toBe('preclip_mouth_roi_outside_crop');
    expect(e.autoRetryHint).toBe(false);
  });

  it('3. the settled predicate is a projection of the one state machine', () => {
    expect(isSceneSettled({ pipeline_state: 'failed' })).toBe(true);
    expect(isSceneSettled({ pipeline_state: 'canceled' })).toBe(true);
    expect(isSceneSettled({ pipeline_state: 'complete' })).toBe(true);
    expect(isSceneSettled({ pipeline_state: 'lipsync_running' })).toBe(false);
    expect(isSceneSettled({ pipeline_state: 'plate_rendering' })).toBe(false);
    // Legacy rows without pipeline_state derive the same answer.
    expect(isSceneSettled({ lip_sync_status: 'failed' })).toBe(true);
    expect(isSceneSettled({ clip_status: 'generating' })).toBe(false);
  });
});
