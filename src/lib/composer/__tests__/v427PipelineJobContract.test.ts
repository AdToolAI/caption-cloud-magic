/**
 * v427A contract guard (Phase 0 + A1).
 *
 * Verifies the additive job-ledger helper without touching the frozen lip-sync
 * chain: the helper must stay a pure admission layer (no framing, masks,
 * payloads, thresholds, retries) and its two operations must stay distinct.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  NON_TERMINAL_STATUSES,
  TERMINAL_STATUSES,
  buildIdempotencyKey,
  allRequiredSyncJobsSucceeded,
} from '../../../../supabase/functions/_shared/composer-pipeline-jobs.ts';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const HELPER = 'supabase/functions/_shared/composer-pipeline-jobs.ts';
const FLAGS = 'supabase/functions/_shared/v427-flags.ts';

function fakeAdmin(rows: Array<{ status: string }>) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    then: (res: any) => res({ data: rows }),
  };
  return { from: () => builder } as any;
}

describe('v427 job ledger', () => {
  it('idempotency key covers scene, run, stage, segment and attempt', () => {
    expect(buildIdempotencyKey({ sceneId: 's', runId: 'r', stage: 'sync_segment', segmentId: 'a', attemptNo: 2 }))
      .toBe('s:r:sync_segment:a:2');
    // A retry must produce a different key than attempt 1.
    expect(buildIdempotencyKey({ sceneId: 's', runId: 'r', stage: 'base_video', attemptNo: 1 }))
      .not.toBe(buildIdempotencyKey({ sceneId: 's', runId: 'r', stage: 'base_video', attemptNo: 2 }));
  });

  it('terminal and non-terminal statuses do not overlap', () => {
    for (const s of TERMINAL_STATUSES) expect(NON_TERMINAL_STATUSES).not.toContain(s);
    expect(NON_TERMINAL_STATUSES).toContain('dispatching');
    expect(TERMINAL_STATUSES).toContain('succeeded');
  });

  it('aggregation barrier only opens when every sync segment succeeded', async () => {
    expect(await allRequiredSyncJobsSucceeded(fakeAdmin([]), 's', 'r')).toBe(false);
    expect(await allRequiredSyncJobsSucceeded(
      fakeAdmin([{ status: 'succeeded' }, { status: 'running' }]), 's', 'r')).toBe(false);
    expect(await allRequiredSyncJobsSucceeded(
      fakeAdmin([{ status: 'succeeded' }, { status: 'succeeded' }]), 's', 'r')).toBe(true);
  });
});

describe('v427 freeze safety', () => {
  it('keeps poller validation and consuming claim as separate operations', () => {
    const src = read(HELPER);
    expect(src).toContain('export async function assertActivePipelineJob');
    expect(src).toContain('export async function claimPipelineCallback');
    // The non-consuming path must never set the claim status.
    const assertBody = src.slice(
      src.indexOf('export async function assertActivePipelineJob'),
      src.indexOf('export async function claimPipelineCallback'),
    );
    expect(assertBody).not.toContain('callback_processing');
    expect(assertBody).toContain('last_heartbeat_at');
  });

  it('never moves a dispatched job backwards', () => {
    const src = read(HELPER);
    expect(src).toContain('if (current.status === "dispatching") patch.status = "dispatched";');
  });

  it('does not touch any frozen lip-sync concern', () => {
    const src = read(HELPER);
    // No imports from frozen modules and no outbound provider calls.
    expect(src).not.toMatch(/from "\.\/(pass-face-preclip|syncso-|plate-|face-|camera-path|compute-mouth)/);
    expect(src).not.toContain('fetch(');
    expect(src).not.toMatch(/sync\.so|replicate\.com|ark\.ap-southeast/i);
  });


  it('all v427 flags default to legacy behaviour', () => {
    const src = read(FLAGS);
    expect(src).toContain('return false;');
    expect(src).toContain(`mode === "observe" || mode === "enforce" ? mode : "off"`);
  });
});
