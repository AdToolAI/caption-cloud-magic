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

  function match(row: Row, filters: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(filters)) {
      if ((row as any)[k] !== v) return false;
    }
    return true;
  }

  function query(table: string) {
    const filters: Record<string, unknown> = {};
    const inFilters: Record<string, unknown[]> = {};
    let selectedCols: string[] = ['*'];
    let countOpts: any = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;

    const builder: any = {
      select: (...cols: any[]) => {
        if (cols.length === 1 && typeof cols[0] === 'object') {
          countOpts = cols[0];
        } else {
          selectedCols = cols.length ? cols : ['*'];
        }
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        inFilters[col] = vals;
        return builder;
      },
      order: (col: string, opts: any) => {
        orderBy = { col, asc: opts?.ascending ?? false };
        return builder;
      },
      limit: (n: number) => {
        limitN = n;
        return builder;
      },
      or: (_expr: string) => builder,
      maybeSingle: async () => {
        let result = Array.from(rows.values()).filter((r) => {
          if (table !== 'composer_pipeline_jobs') return false;
          if (!match(r, filters)) return false;
          for (const [k, vals] of Object.entries(inFilters)) {
            if (!vals.includes((r as any)[k])) return false;
          }
          return true;
        });
        if (orderBy) {
          result.sort((a, b) => {
            const dir = orderBy!.asc ? 1 : -1;
            return ((a as any)[orderBy!.col] > (b as any)[orderBy!.col] ? 1 : -1) * dir;
          });
        }
        if (limitN) result = result.slice(0, limitN);
        return { data: result[0] ?? null };
      },
      then: async (cb: any) => {
        let result = Array.from(rows.values()).filter((r) => {
          if (table !== 'composer_pipeline_jobs') return false;
          if (!match(r, filters)) return false;
          for (const [k, vals] of Object.entries(inFilters)) {
            if (!vals.includes((r as any)[k])) return false;
          }
          return true;
        });
        if (countOpts) {
          return cb({ data: [], count: result.length });
        }
        return cb({ data: result });
      },
      upsert: (row: any) => {
        const id = row.id ?? `job-${Math.random().toString(36).slice(2)}`;
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
        return {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return {
              eq: (col2: string, val2: unknown) => {
                filters[col2] = val2;
                return {
                  in: (col3: string, vals: unknown[]) => {
                    inFilters[col3] = vals;
                    return {
                      or: (_expr: string) => ({
                        select: () => ({
                          maybeSingle: async () => {
                            const candidates = Array.from(rows.values()).filter((r) => {
                              if (table !== 'composer_pipeline_jobs') return false;
                              if (!match(r, filters)) return false;
                              for (const [k, vals] of Object.entries(inFilters)) {
                                if (!vals.includes((r as any)[k])) return false;
                              }
                              return true;
                            });
                            const target = candidates[0];
                            if (target) {
                              for (const [k, v] of Object.entries(patch)) {
                                (target as any)[k] = v;
                              }
                            }
                            return { data: target ?? null };
                          },
                        }),
                      }),
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    return builder;
  }

  return {
    from: (name: string) => {
      if (name === 'composer_scenes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { active_run_id: RUN_ID } }),
            }),
          }),
        };
      }
      return query(name);
    },
    rpc: async () => ({ error: null }),
  } as any;
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

    await completePipelineJob(admin, jobs[0].id, 'failed_redeliverable', 'mux_timeout');

    const row = (await admin.from('composer_pipeline_jobs').select('*').eq('id', jobs[0].id).maybeSingle()).data;
    expect(row.callback_delivery_status).toBe('failed_redeliverable');
    expect(row.status).not.toBe('succeeded');
    expect(row.status).not.toBe('failed');
    expect(row.callback_claim_token).toBeNull();

    const secondClaim = await claimPipelineCallback(admin, id);
    expect(secondClaim.ok).toBe(true);
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);

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
