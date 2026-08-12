/**
 * v427A2 contract guard.
 *
 * The dual-write layer must stay a pure mirror: off by default, never
 * branching the dispatch, never touching frozen lip-sync concerns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { dualWriteDispatch } from '../../../../supabase/functions/_shared/v427-dual-write.ts';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const DUAL = 'supabase/functions/_shared/v427-dual-write.ts';
const CALLER = 'supabase/functions/compose-video-clips/index.ts';

function adminWithFlag(enabled: boolean, writes: string[]) {
  const table = (name: string): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: async () =>
        name === 'system_config'
          ? { data: enabled ? { value: true } : null }
          : { data: { active_run_id: 'run-1' } },
      upsert: (row: any) => {
        writes.push(`${name}:${row.stage}`);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: 'job-1', ...row } }) }) };
      },
      update: () => b,
      then: (res: any) => res({ data: [], count: 0 }),
    };
    return b;
  };
  return { from: (n: string) => table(n), rpc: async () => ({ error: null }) } as any;
}

describe('v427 dual-write', () => {
  it('writes nothing while the flag is off', async () => {
    const writes: string[] = [];
    await dualWriteDispatch(adminWithFlag(false, writes), { sceneId: 's', externalJobId: 'x' });
    expect(writes).toEqual([]);
  });

  it('mirrors a base_video dispatch once the flag is on', async () => {
    const writes: string[] = [];
    await dualWriteDispatch(adminWithFlag(true, writes), { sceneId: 's', externalJobId: 'x' });
    expect(writes).toEqual(['composer_pipeline_jobs:base_video']);
  });

  it('never throws, whatever the database does', async () => {
    const broken = { from: () => { throw new Error('boom'); } } as any;
    await expect(dualWriteDispatch(broken, { sceneId: 's' })).resolves.toBeUndefined();
  });

  it('stays free of frozen lip-sync concerns and of provider calls', () => {
    const src = read(DUAL);
    expect(src).not.toContain('fetch(');
    expect(src).not.toMatch(/sync\.so|replicate\.com|ark\.ap-southeast/i);
    expect(src).not.toMatch(/from "\.\/(pass-face-preclip|syncso-|plate-|face-|camera-path)/);
  });

  it('is called after dispatch, not before, and cannot abort the run', () => {
    const src = read(CALLER);
    const call = src.indexOf('await dualWriteDispatches(');
    expect(call).toBeGreaterThan(-1);
    // must sit after the per-scene dispatch loop, before the credit deduction
    expect(call).toBeGreaterThan(src.indexOf('replicate.predictions.create'));
    expect(call).toBeLessThan(src.indexOf('const billableResults'));
  });
});
