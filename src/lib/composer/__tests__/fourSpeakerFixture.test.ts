/**
 * v427A3+ — Four-speaker fixture test.
 *
 * Simulates a complex lip-sync scene with 4 speakers. Each speaker gets its own
 * sync_segment job in the ledger. The aggregation barrier only opens when all
 * 4 segment jobs report succeeded. No segment may overwrite another segment's
 * state.
 */
import { describe, it, expect } from 'vitest';
import {
  createPipelineJob,
  claimPipelineCallback,
  completePipelineJob,
  allRequiredSyncJobsSucceeded,
  buildIdempotencyKey,
  type CallbackIdentity,
} from '../../../../supabase/functions/_shared/composer-pipeline-jobs.ts';

const SCENE_ID = 'scene-four-speaker';
const RUN_ID = 'run-four-speaker';

interface Row {
  id: string;
  scene_id: string;
  run_id: string;
  stage: string;
  segment_id: string | null;
  attempt_no: number;
  status: string;
  callback_delivery_status: string | null;
  external_job_id: string | null;
  callback_claim_token: string | null;
  callback_claim_expires_at: string | null;
}

function makeAdmin(initial: Row[] = []) {
  const rows = new Map<string, Row>();
  for (const r of initial) rows.set(r.id, { ...r });

  const table = (name: string): any => {
    if (name !== 'composer_pipeline_jobs' && name !== 'composer_scenes') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      };
    }

    if (name === 'composer_scenes') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { active_run_id: RUN_ID } }),
          }),
        }),
      };
    }

    const builder: any = {
      select: (...cols: string[]) => {
        let result = Array.from(rows.values());
        builder._eq = {};
        builder._in = {};
        builder._order = null;
        builder._limit = null;

        builder.eq = (col: string, val: unknown) => {
          builder._eq[col] = val;
          result = result.filter((r) => (r as any)[col] === val);
          return builder;
        };
        builder.in = (col: string, vals: unknown[]) => {
          result = result.filter((r) => vals.includes((r as any)[col]));
          return builder;
        };
        builder.order = (col: string, opts: any) => {
          builder._order = { col, asc: opts?.ascending ?? false };
          result.sort((a, b) => {
            const dir = builder._order.asc ? 1 : -1;
            return ((a as any)[col] > (b as any)[col] ? 1 : -1) * dir;
          });
          return builder;
        };
        builder.limit = (n: number) => {
          builder._limit = n;
          return builder;
        };
        builder.maybeSingle = async () => {
          const slice = builder._limit ? result.slice(0, builder._limit) : result;
          return { data: slice[0] ?? null };
        };
        builder.then = async (cb: any) => cb({ data: result });
        return builder;
      },
      upsert: (row: any, _opts?: any) => {
        const id = row.id ?? `job-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        const next: Row = {
          id,
          scene_id: row.scene_id,
          run_id: row.run_id,
          stage: row.stage,
          segment_id: row.segment_id ?? null,
          attempt_no: row.attempt_no ?? 1,
          status: row.status ?? 'pending',
          callback_delivery_status: row.callback_delivery_status ?? null,
          external_job_id: row.external_job_id ?? null,
          callback_claim_token: row.callback_claim_token ?? null,
          callback_claim_expires_at: row.callback_claim_expires_at ?? null,
        };
        rows.set(id, next);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: next }),
          }),
        };
      },
      update: (patch: any) => {
        const target = Array.from(rows.values()).find((r) => {
          for (const [k, v] of Object.entries(builder._eq ?? {})) {
            if ((r as any)[k] !== v) return false;
          }
          return true;
        });
        if (target) {
          for (const [k, v] of Object.entries(patch)) {
            (target as any)[k] = v;
          }
        }
        return {
          select: () => ({
            maybeSingle: async () => ({ data: target ?? null }),
          }),
        };
      },
      eq: (col: string, val: unknown) => {
        builder._eq = { ...(builder._eq ?? {}), [col]: val };
        return builder;
      },
      or: (_expr: string) => builder,
    };
    return builder;
  };

  return { from: (n: string) => table(n), rpc: async () => ({ error: null }) } as any;
}

const SPEAKERS = ['spk-a', 'spk-b', 'spk-c', 'spk-d'];

async function seedFourSpeakerSegmentJobs(admin: any) {
  const jobs = [];
  for (const speakerId of SPEAKERS) {
    const job = await createPipelineJob(admin, {
      sceneId: SCENE_ID,
      runId: RUN_ID,
      stage: 'sync_segment',
      segmentId: `seg-${speakerId}`,
      speakerId,
      provider: 'ai-happyhorse',
      metadata: { speakerId },
    });
    jobs.push(job!);
  }
  return jobs;
}

describe('four-speaker fixture', () => {
  it('creates one ledger row per speaker', async () => {
    const admin = makeAdmin();
    const jobs = await seedFourSpeakerSegmentJobs(admin);

    expect(jobs).toHaveLength(4);
    expect(new Set(jobs.map((j) => j.segment_id)).size).toBe(4);
    for (const job of jobs) {
      expect(job.status).toBe('dispatching');
      expect(job.run_id).toBe(RUN_ID);
      expect(job.stage).toBe('sync_segment');
    }
  });

  it('keeps segment statuses isolated', async () => {
    const admin = makeAdmin();
    const jobs = await seedFourSpeakerSegmentJobs(admin);

    // Complete speaker A only.
    await completePipelineJob(admin, jobs[0].id, 'succeeded');

    const a = (await admin.from('composer_pipeline_jobs').select('*').eq('id', jobs[0].id).maybeSingle()).data;
    const b = (await admin.from('composer_pipeline_jobs').select('*').eq('id', jobs[1].id).maybeSingle()).data;

    expect(a.status).toBe('succeeded');
    expect(a.callback_delivery_status).toBe('succeeded');
    expect(b.status).toBe('dispatching');
    expect(b.callback_delivery_status).toBeNull();
  });

  it('barrier opens only after all four segments succeed', async () => {
    const admin = makeAdmin();
    const jobs = await seedFourSpeakerSegmentJobs(admin);

    expect(await allRequiredSyncJobsSucceeded(admin, SCENE_ID, RUN_ID)).toBe(false);

    for (let i = 0; i < 3; i++) {
      await completePipelineJob(admin, jobs[i].id, 'succeeded');
      expect(await allRequiredSyncJobsSucceeded(admin, SCENE_ID, RUN_ID)).toBe(false);
    }

    await completePipelineJob(admin, jobs[3].id, 'succeeded');
    expect(await allRequiredSyncJobsSucceeded(admin, SCENE_ID, RUN_ID)).toBe(true);
  });

  it('allows redelivery of a failed_redeliverable segment', async () => {
    const admin = makeAdmin();
    const jobs = await seedFourSpeakerSegmentJobs(admin);

    const id: CallbackIdentity = {
      sceneId: SCENE_ID,
      runId: RUN_ID,
      stage: 'sync_segment',
      segmentId: jobs[0].segment_id!,
    };

    const firstClaim = await claimPipelineCallback(admin, id);
    expect(firstClaim.ok).toBe(true);

    // Business logic fails retryably.
    await completePipelineJob(admin, jobs[0].id, 'failed_redeliverable', 'mux_timeout');

    const row = (await admin.from('composer_pipeline_jobs').select('*').eq('id', jobs[0].id).maybeSingle()).data;
    expect(row.callback_delivery_status).toBe('failed_redeliverable');
    expect(row.status).not.toBe('succeeded');
    expect(row.status).not.toBe('failed');
    expect(row.callback_claim_token).toBeNull();

    // Provider redelivers; claim succeeds again.
    const secondClaim = await claimPipelineCallback(admin, id);
    expect(secondClaim.ok).toBe(true);
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);

    // Now succeed.
    await completePipelineJob(admin, jobs[0].id, 'succeeded');
    const done = (await admin.from('composer_pipeline_jobs').select('*').eq('id', jobs[0].id).maybeSingle()).data;
    expect(done.status).toBe('succeeded');
    expect(done.callback_delivery_status).toBe('succeeded');
  });

  it('rejects a duplicate delivery once a segment is succeeded', async () => {
    const admin = makeAdmin();
    const jobs = await seedFourSpeakerSegmentJobs(admin);

    const id: CallbackIdentity = {
      sceneId: SCENE_ID,
      runId: RUN_ID,
      stage: 'sync_segment',
      segmentId: jobs[0].segment_id!,
    };

    await claimPipelineCallback(admin, id);
    await completePipelineJob(admin, jobs[0].id, 'succeeded');

    const duplicate = await claimPipelineCallback(admin, id);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toBe('duplicate_callback');
  });
});
