/**
 * V515 — what the user actually sees when the run is terminal.
 *
 * The hook tests prove the state; this proves the rendering. The generation-14
 * report was a screenshot, not a state dump: a spinner, "99 %", a growing
 * timer and "Slots 0/3" on a run that had been dead for 109 minutes.
 */
import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PipelineProgressBar from '@/components/video-composer/PipelineProgressBar';
import { emitPipelineEvent } from '@/lib/pipelineEvents';

// The shared setup mock has no `.gte`, and the slot chip polls
// `syncso_inflight_jobs` every 5 s while lip-sync is running. Stub the chain
// locally so the poll resolves instead of rejecting — and so the test can
// assert that the poll STOPS once the phase is terminal.
const slotQuery = vi.fn(async () => ({ count: 0, error: null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ gte: (...a: unknown[]) => slotQuery(...(a as [])) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

const SCENE = '67b392b1-aca1-489d-b773-d604deb22623';
const RUN_14 = '6c3a617b-0873-4f42-b34a-e86409b11b33';

const base: any = {
  id: SCENE,
  clipSource: 'ai-veo',
  clipUrl: 'https://cdn.example/scene-67b392b1-plate.mp4',
  dialogMode: true,
  lipSyncWithVoiceover: true,
  activeRunId: RUN_14,
  plateGeneration: 14,
  plateReadyGeneration: 14,
};

const running: any = {
  ...base,
  clipStatus: 'generating',
  pipelineState: 'lipsync_running',
  lipSyncStatus: 'running',
  twoshotStage: 'lipsync',
  dialogShots: { status: 'lipsyncing', passes: [{ idx: 0, status: 'rendering', job_id: 'x' }] },
};

const failed: any = {
  ...base,
  clipStatus: 'failed',
  clipError: 'preclip_mouth_roi_outside_crop',
  pipelineState: 'failed',
  pipelineSubstate: 'lipsync_failed',
  lipSyncStatus: 'failed',
  twoshotStage: 'failed',
  refunded: true,
  dialogShots: {
    status: 'failed',
    error: 'preclip_mouth_roi_outside_crop',
    finished_at: '2026-08-27T01:54:06.357Z',
    v510_terminal: { reason: 'preclip_mouth_roi_outside_crop', pass_idx: 5, run_id: RUN_14 },
  },
};

const ASSEMBLY: any = { voiceover: { enabled: false, audioUrl: null }, music: null };

const spinners = (c: HTMLElement) => c.querySelectorAll('.animate-spin').length;
const pulses = (c: HTMLElement) => c.querySelectorAll('.animate-pulse').length;

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('V515 — PipelineProgressBar on a terminal run', () => {
  it('4/5/11/12. the failed run shows the failure, not a spinner, a percentage or a timer', async () => {
    const view = render(
      <PipelineProgressBar scenes={[running]} assemblyConfig={ASSEMBLY} projectId="v515" />,
    );
    act(() => {
      emitPipelineEvent({ type: 'clips:start', sceneIds: [SCENE] });
      emitPipelineEvent({ type: 'lipsync:start' });
    });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    // While running the bar is genuinely animated — the regression guard.
    expect(spinners(view.container) + pulses(view.container)).toBeGreaterThan(0);

    view.rerender(
      <PipelineProgressBar scenes={[failed]} assemblyConfig={ASSEMBLY} projectId="v515" />,
    );
    await act(async () => { vi.advanceTimersByTime(120_000); });

    // No spinner, no pulsing "running" pill.
    expect(spinners(view.container)).toBe(0);
    expect(pulses(view.container)).toBe(0);
    // The failure is announced, not narrated as progress.
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
    // No elapsed / remaining pair.
    expect(screen.queryByText(/\d+:\d\d min \/ ~/)).toBeNull();
    // The Sync.so slot chip is released with the phase.
    expect(screen.queryByText(/Slots \d+\/3/)).toBeNull();
  });

  it('9. a running run still shows progress and no failure styling', async () => {
    const view = render(
      <PipelineProgressBar scenes={[running]} assemblyConfig={ASSEMBLY} projectId="v515-run" />,
    );
    act(() => {
      emitPipelineEvent({ type: 'clips:start', sceneIds: [SCENE] });
      emitPipelineEvent({ type: 'lipsync:start' });
    });
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(view.container.querySelector('[role="status"]')).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(screen.queryByText(/^\d+%$/)).not.toBeNull();
  });
});
