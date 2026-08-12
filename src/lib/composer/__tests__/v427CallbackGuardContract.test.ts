/**
 * v427A3 contract guard.
 *
 * The callback guard must be inert by default, must never reject on telemetry
 * gaps, and must never touch frozen lip-sync concerns. The legacy stale-run
 * gate in compose-clip-webhook stays the first authority.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { guardCallback } from '../../../../supabase/functions/_shared/v427-callback-guard.ts';
import { __resetV427FlagCache } from '../../../../supabase/functions/_shared/v427-flags.ts';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const GUARD = 'supabase/functions/_shared/v427-callback-guard.ts';
const WEBHOOK = 'supabase/functions/compose-clip-webhook/index.ts';

interface WorldOpts {
  mode: string | null;
  activeRunId?: string | null;
  job?: Record<string, unknown> | null;
}

function admin({ mode, activeRunId = 'run-1', job = null }: WorldOpts) {
  const table = (name: string): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      or: () => b,
      limit: () => b,
      update: () => b,
      maybeSingle: async () => {
        if (name === 'system_config') return { data: mode === null ? null : { value: mode } };
        if (name === 'composer_scenes') return { data: { active_run_id: activeRunId } };
        if (name === 'composer_pipeline_jobs') return { data: job };
        return { data: null };
      },
      order: () => b,
      then: (res: any) => res({ data: job ? [job] : [] }),
    };
    return b;
  };
  return { from: (n: string) => table(n) } as any;
}

const identity = { sceneId: 's1', runId: 'run-1', stage: 'base_video' as const };

describe('v427 callback guard', () => {
  beforeEach(() => __resetV427FlagCache());

  it('is a no-op while the mode flag is unset', async () => {
    const out = await guardCallback(admin({ mode: null }), identity);
    expect(out).toEqual({ proceed: true, mode: 'off' });
  });

  it('never rejects in observe mode, even on a wrong run', async () => {
    const out = await guardCallback(
      admin({ mode: 'observe', activeRunId: 'run-2' }),
      identity,
    );
    expect(out.proceed).toBe(true);
    expect(out.reason).toBe('wrong_run');
  });

  it('rejects a wrong run once enforcing', async () => {
    const out = await guardCallback(
      admin({ mode: 'enforce', activeRunId: 'run-2' }),
      identity,
    );
    expect(out.proceed).toBe(false);
    expect(out.reason).toBe('wrong_run');
  });

  it('lets a missing ledger row through even when enforcing', async () => {
    const out = await guardCallback(admin({ mode: 'enforce', job: null }), identity);
    expect(out.proceed).toBe(true);
    expect(out.reason).toBe('job_missing');
  });

  it('never throws, whatever the database does', async () => {
    const broken = { from: () => { throw new Error('boom'); } } as any;
    await expect(guardCallback(broken, identity)).resolves.toMatchObject({ proceed: true });
  });

  it('stays free of frozen lip-sync concerns', () => {
    const src = read(GUARD);
    for (const term of ['mask', 'crop', 'bbox', 'face', 'preclip', 'happyhorse', 'hailuo']) {
      expect(src.toLowerCase()).not.toContain(term);
    }
  });

  it('runs after the legacy stale-run gate in the webhook', () => {
    const src = read(WEBHOOK);
    expect(src.indexOf("reason: 'stale_run'")).toBeGreaterThan(-1);
    expect(src.indexOf("reason: 'stale_run'")).toBeLessThan(src.indexOf('guardCallback('));
  });
});
