import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  classifyCasAttempt,
  isUsableCasToken,
  MAX_AUDIO_PLAN_CAS_ATTEMPTS,
  planAudioPlanWrite,
} from '../audioPlanOwnership';

/**
 * V537 — `composer_scenes.audio_plan` has two owners. The dialog studio writes
 * the root VO timing fields; the edge functions write `twoshot`, which since
 * V537 carries `canonical_turn_ids` — the frozen turn identity FA-4 compares
 * against. PostgREST replaces jsonb whole, so the generic client save was
 * erasing the server half on the ordinary edit path.
 */

const A = ['a1', 'a2', 'a3', 'a4'];
const B = ['b1', 'b2', 'b3', 'b4'];

const serverPlan = (ids: string[]) => ({
  version: 1,
  speakers: [{ characterId: 'x', startSec: 0 }],
  totalSec: 4,
  generatedAt: 'T-server',
  twoshot: {
    url: 'https://example.invalid/vo.wav',
    segments: ids.map((id, i) => ({ idx: i, turn_id: id })),
    canonical_turn_ids: ids,
    anchor_identity: { assignmentLock: { '0': 'char' } },
  },
});

const localPlanNoTwoshot = () => ({
  version: 1,
  speakers: [{ characterId: 'x', startSec: 0, endSec: 2, text: 'new timing' }],
  totalSec: 9.5,
  interSpeakerGapSec: 0.35,
  language: 'de',
  generatedAt: 'T-client',
});

describe('V537 audio_plan ownership', () => {
  it('a local plan without twoshot never erases the server subtree', () => {
    const w = planAudioPlanWrite(localPlanNoTwoshot(), serverPlan(A));
    expect(w.kind).toBe('write');
    if (w.kind !== 'write') return;
    expect(w.twoshotSource).toBe('server');
    // Client root fields survive.
    expect(w.audioPlan.totalSec).toBe(9.5);
    expect(w.audioPlan.generatedAt).toBe('T-client');
    expect(w.audioPlan.interSpeakerGapSec).toBe(0.35);
    // Server twoshot survives verbatim, including the V537 snapshot.
    expect((w.audioPlan.twoshot as any).canonical_turn_ids).toEqual(A);
    expect((w.audioPlan.twoshot as any).url).toBe('https://example.invalid/vo.wav');
    expect((w.audioPlan.twoshot as any).anchor_identity).toBeTruthy();
  });

  it('an OLDER local twoshot never wins over the server one', () => {
    const stale = { ...localPlanNoTwoshot(), twoshot: { canonical_turn_ids: B, url: 'stale' } };
    const w = planAudioPlanWrite(stale, serverPlan(A));
    if (w.kind !== 'write') throw new Error('expected a write');
    expect((w.audioPlan.twoshot as any).canonical_turn_ids).toEqual(A);
    expect((w.audioPlan.twoshot as any).url).toBe('https://example.invalid/vo.wav');
  });

  it('a null or undefined local twoshot never replaces the server one', () => {
    for (const local of [
      { ...localPlanNoTwoshot(), twoshot: null },
      { ...localPlanNoTwoshot(), twoshot: undefined },
    ]) {
      const w = planAudioPlanWrite(local, serverPlan(A));
      if (w.kind !== 'write') throw new Error('expected a write');
      expect((w.audioPlan.twoshot as any).canonical_turn_ids).toEqual(A);
    }
  });

  it('no local plan means no opinion: the column is omitted, not nulled', () => {
    for (const local of [null, undefined, 'nonsense', 42, []]) {
      const w = planAudioPlanWrite(local, serverPlan(A));
      expect(w.kind).toBe('omit');
    }
  });

  it('with no server twoshot the local subtree is kept, never deleted', () => {
    const local = { ...localPlanNoTwoshot(), twoshot: { url: 'local-only' } };
    const w = planAudioPlanWrite(local, { version: 1, speakers: [], totalSec: 0, generatedAt: 'x' });
    if (w.kind !== 'write') throw new Error('expected a write');
    expect(w.twoshotSource).toBe('local');
    expect((w.audioPlan.twoshot as any).url).toBe('local-only');

    const bare = planAudioPlanWrite(localPlanNoTwoshot(), null);
    if (bare.kind !== 'write') throw new Error('expected a write');
    expect(bare.twoshotSource).toBe('none');
    expect(bare.audioPlan.twoshot).toBeUndefined();
    expect(bare.audioPlan.totalSec).toBe(9.5);
  });

  it('the input objects are never mutated', () => {
    const local = localPlanNoTwoshot();
    const server = serverPlan(A);
    const localBefore = JSON.stringify(local);
    const serverBefore = JSON.stringify(server);
    planAudioPlanWrite(local, server);
    expect(JSON.stringify(local)).toBe(localBefore);
    expect(JSON.stringify(server)).toBe(serverBefore);
  });
});

describe('V537 CAS attempt classification', () => {
  it('a zero-row update is a miss, not a success', () => {
    // supabase-js does NOT report a zero-row update as an error, so without a
    // row count a CAS miss is indistinguishable from a success.
    expect(classifyCasAttempt(null, [])).toBe('missed');
    expect(classifyCasAttempt(null, [{ id: 's1' }])).toBe('applied');
    expect(classifyCasAttempt(null, null)).toBe('missed');
    expect(classifyCasAttempt(null, undefined)).toBe('missed');
    expect(classifyCasAttempt({ message: 'boom' }, [{ id: 's1' }])).toBe('error');
  });

  it('only a usable token can fence', () => {
    expect(isUsableCasToken('2026-09-02T10:00:00.123456+00:00')).toBe(true);
    for (const bad of [null, undefined, '', '   ', 42, {}]) {
      expect(isUsableCasToken(bad)).toBe(false);
    }
  });

  it('the retry budget is bounded', () => {
    expect(MAX_AUDIO_PLAN_CAS_ATTEMPTS).toBe(3);
    expect(Number.isInteger(MAX_AUDIO_PLAN_CAS_ATTEMPTS)).toBe(true);
  });
});

describe('V537 the actual interleaving', () => {
  /** A tiny row store that behaves like the table: every write stamps updated_at. */
  function makeDb(initial: { audio_plan: unknown; updated_at: string }) {
    let row = { ...initial };
    let clock = 0;
    return {
      read: () => ({ ...row }),
      /** Server write — unconditional, like an edge function. */
      serverWrite(plan: unknown) {
        clock += 1;
        row = { audio_plan: plan, updated_at: `T${clock}` };
      },
      /** Client CAS write — applies only if the token still matches. */
      casWrite(plan: unknown, token: string): { rows: Array<{ id: string }> } {
        if (row.updated_at !== token) return { rows: [] };
        clock += 1;
        row = { audio_plan: plan, updated_at: `T${clock}` };
        return { rows: [{ id: 's1' }] };
      },
    };
  }

  it('a CAS miss retries against the NEWER twoshot and preserves the snapshot', () => {
    const db = makeDb({ audio_plan: serverPlan(B), updated_at: 'T0' });

    // 1. the client reads OLD (twoshot = B) at T0
    const firstRead = db.read();
    expect((firstRead.audio_plan as any).twoshot.canonical_turn_ids).toEqual(B);

    // 2. the server then writes the real run's snapshot, A, bumping to T1
    db.serverWrite(serverPlan(A));

    // 3. the client attempts CAS with the stale T0 → zero rows
    const staleWrite = planAudioPlanWrite(localPlanNoTwoshot(), firstRead.audio_plan);
    if (staleWrite.kind !== 'write') throw new Error('expected a write');
    const miss = db.casWrite(staleWrite.audioPlan, firstRead.updated_at);
    expect(classifyCasAttempt(null, miss.rows)).toBe('missed');
    // Nothing was written: the server snapshot is intact.
    expect((db.read().audio_plan as any).twoshot.canonical_turn_ids).toEqual(A);

    // 4. retry: re-read, re-merge against the NEWER twoshot, CAS again
    const second = db.read();
    const retry = planAudioPlanWrite(localPlanNoTwoshot(), second.audio_plan);
    if (retry.kind !== 'write') throw new Error('expected a write');
    const hit = db.casWrite(retry.audioPlan, second.updated_at);
    expect(classifyCasAttempt(null, hit.rows)).toBe('applied');

    // Final state: client root fields applied, server twoshot still A.
    const final = db.read().audio_plan as any;
    expect(final.totalSec).toBe(9.5);
    expect(final.generatedAt).toBe('T-client');
    expect(final.interSpeakerGapSec).toBe(0.35);
    expect(final.twoshot.canonical_turn_ids).toEqual(A);
    expect(final.twoshot.segments.map((s: any) => s.turn_id)).toEqual(A);
    expect(final.twoshot.anchor_identity).toBeTruthy();
  });

  it('N2-02: a stale save cannot change or remove the run snapshot', () => {
    const db = makeDb({ audio_plan: serverPlan(A), updated_at: 'T0' });
    const token = db.read().updated_at;

    // The stale client holds no twoshot at all — the SceneDialogStudio shape.
    const w = planAudioPlanWrite(localPlanNoTwoshot(), db.read().audio_plan);
    if (w.kind !== 'write') throw new Error('expected a write');
    expect(classifyCasAttempt(null, db.casWrite(w.audioPlan, token).rows)).toBe('applied');

    const final = db.read().audio_plan as any;
    expect(final.twoshot.canonical_turn_ids).toEqual(A);
    expect(final.twoshot.segments.map((s: any) => s.turn_id)).toEqual(A);
    // dialog_turns may well have become B; the run's identity did not.
    expect(final.twoshot.canonical_turn_ids).not.toEqual(B);
  });

  it('a repeatedly losing client exhausts its budget without writing', () => {
    const db = makeDb({ audio_plan: serverPlan(A), updated_at: 'T0' });
    let applied = false;
    for (let attempt = 1; attempt <= MAX_AUDIO_PLAN_CAS_ATTEMPTS; attempt += 1) {
      const fresh = db.read();
      const w = planAudioPlanWrite(localPlanNoTwoshot(), fresh.audio_plan);
      if (w.kind !== 'write') break;
      db.serverWrite(serverPlan(A)); // the server always wins the race
      if (classifyCasAttempt(null, db.casWrite(w.audioPlan, fresh.updated_at).rows) === 'applied') {
        applied = true;
        break;
      }
    }
    expect(applied).toBe(false);
    // Bounded, and the server snapshot is untouched.
    expect((db.read().audio_plan as any).twoshot.canonical_turn_ids).toEqual(A);
  });
});

describe('V537 persistence contract', () => {
  const HOOK = () =>
    readFileSync(resolve(process.cwd(), 'src/hooks/useComposerPersistence.ts'), 'utf8');

  it('the generic UPDATE payload no longer carries audio_plan', () => {
    const src = HOOK();
    // Exactly one `audio_plan:` assignment remains — the INSERT path.
    const assignments = src.match(/^\s*audio_plan:\s/gm) ?? [];
    expect(assignments.length).toBe(1);
    // And it is inside the insert, not the update.
    expect(src.indexOf('.insert({')).toBeLessThan(src.indexOf('audio_plan: (scene.audioPlan ?? null)'));
  });

  it('user-editable scene fields are still persisted by the generic UPDATE', () => {
    const src = HOOK();
    const updateStart = src.indexOf('const { error: updErr }');
    const updateEnd = src.indexOf(".eq('id', scene.id);", updateStart);
    const payload = src.slice(updateStart, updateEnd);
    for (
      const field of [
        'dialog_turns:',
        'dialog_script:',
        'dialog_voices:',
        'dialog_locked_at:',
        'ai_prompt:',
        'duration_seconds:',
        'character_shots:',
      ]
    ) {
      expect(payload).toContain(field);
    }
    expect(payload).not.toContain('audio_plan:');
  });

  it('the fenced write uses updated_at CAS and inspects the row count', () => {
    const src = HOOK();
    expect(src).toContain(".select('audio_plan, updated_at')");
    expect(src).toContain(".eq('updated_at', token)");
    expect(src).toContain(".select('id')");
    expect(src).toContain('classifyCasAttempt(casErr, casRows)');
    expect(src).toContain('attempt <= MAX_AUDIO_PLAN_CAS_ATTEMPTS');
    // No unbounded loop.
    expect(src).not.toMatch(/while\s*\(\s*true\s*\)/);
  });

  it('the INSERT path is a plain insert, not an upsert', () => {
    const src = HOOK();
    expect(src).toContain('.insert({');
    expect(src).not.toContain('.upsert(');
    // So it cannot overwrite an existing row's audio_plan.
  });

  it('the specialized FaceMapReviewDialog writer is untouched', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/video-composer/FaceMapReviewDialog.tsx'),
      'utf8',
    );
    // It reads the row immediately before writing and spreads both levels, so
    // canonical_turn_ids survives its patch.
    expect(src).toContain('.select("audio_plan, dialog_shots")');
    expect(src).toContain('...baseAudioPlan,');
    expect(src).toContain('...baseTwoshot,');
    expect(src).not.toContain('audioPlanOwnership');
  });

  it('SceneDialogStudio still authors the root VO timing plan', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/video-composer/SceneDialogStudio.tsx'),
      'utf8',
    );
    expect(src).toContain("const audioPlan: import('@/types/video-composer').AudioPlan = {");
    expect(src).toContain('dialogLockedAt: audioPlan.generatedAt');
    expect(src).not.toContain('audioPlanOwnership');
  });
});

describe('V537 CAS exhaustion is not a silent success', () => {
  /** The loop as it stands in the hook, with the IO injected. */
  async function runCasLoop(io: {
    read: () => { audio_plan: unknown; updated_at: string } | null;
    casWrite: (plan: unknown, token: string) => { rows: Array<{ id: string }> };
    unfenced?: (plan: unknown) => { error: { message: string } | null };
    localPlan: unknown;
  }): Promise<{ settled: boolean; failure: string | null; unfencedCalls: number }> {
    let settled = false;
    let failure: string | null = null;
    let unfencedCalls = 0;

    for (let attempt = 1; attempt <= MAX_AUDIO_PLAN_CAS_ATTEMPTS; attempt += 1) {
      const fresh = io.read();
      const write = planAudioPlanWrite(io.localPlan, fresh?.audio_plan);
      if (write.kind === 'omit') {
        settled = true;
        break;
      }
      const token = fresh?.updated_at;
      if (!isUsableCasToken(token)) {
        // `updated_at` is NOT NULL DEFAULT now(); without a token there is
        // nothing to fence with, and writing anyway is the one thing that
        // would destroy the server subtree.
        failure = 'cas_token_missing';
        break;
      }
      const res = io.casWrite(write.audioPlan, token);
      const outcome = classifyCasAttempt(null, res.rows);
      if (outcome === 'applied') {
        settled = true;
        break;
      }
      if (attempt === MAX_AUDIO_PLAN_CAS_ATTEMPTS) {
        failure = `cas_exhausted_after_${attempt}_attempts`;
      }
    }
    if (!settled) throw new Error(`audio_plan_cas_exhausted:${failure ?? 'unknown'} scene=s1`);
    return { settled, failure, unfencedCalls };
  }

  it('three conflicts reject, leave the snapshot intact, and never write unfenced', async () => {
    let row = { audio_plan: serverPlan(A) as unknown, updated_at: 'T0' };
    let clock = 0;
    let casAttempts = 0;
    let unfencedCalls = 0;

    await expect(
      runCasLoop({
        localPlan: localPlanNoTwoshot(),
        read: () => ({ ...row }),
        casWrite: (_plan, token) => {
          casAttempts += 1;
          // The server always wins the race: bump before comparing.
          clock += 1;
          row = { audio_plan: serverPlan(A), updated_at: `T${clock}` };
          return token === 'never' ? { rows: [{ id: 's1' }] } : { rows: [] };
        },
        unfenced: () => {
          unfencedCalls += 1;
          return { error: null };
        },
      }),
    ).rejects.toThrow(/^audio_plan_cas_exhausted:cas_exhausted_after_3_attempts/);

    expect(casAttempts).toBe(MAX_AUDIO_PLAN_CAS_ATTEMPTS);
    expect(unfencedCalls).toBe(0);
    expect((row.audio_plan as any).twoshot.canonical_turn_ids).toEqual(A);
    expect((row.audio_plan as any).twoshot.segments.map((s: any) => s.turn_id)).toEqual(A);
  });

  it('the successful race still resolves', async () => {
    let row = { audio_plan: serverPlan(B) as unknown, updated_at: 'T0' };
    let attempts = 0;

    const out = await runCasLoop({
      localPlan: localPlanNoTwoshot(),
      read: () => ({ ...row }),
      casWrite: (plan, token) => {
        attempts += 1;
        if (attempts === 1) {
          // Attempt 1 loses: the server wrote the real snapshot in between.
          row = { audio_plan: serverPlan(A), updated_at: 'T1' };
          return { rows: [] };
        }
        if (row.updated_at !== token) return { rows: [] };
        row = { audio_plan: plan, updated_at: 'T2' };
        return { rows: [{ id: 's1' }] };
      },
    });

    expect(out.settled).toBe(true);
    expect(attempts).toBe(2);
    const final = row.audio_plan as any;
    // Attempt 2 fresh-read the NEW twoshot and kept it.
    expect(final.twoshot.canonical_turn_ids).toEqual(A);
    expect(final.totalSec).toBe(9.5);
    expect(final.generatedAt).toBe('T-client');
  });

  it('no local plan settles without running a write at all', async () => {
    let writes = 0;
    const out = await runCasLoop({
      localPlan: null,
      read: () => ({ audio_plan: serverPlan(A), updated_at: 'T0' }),
      casWrite: () => {
        writes += 1;
        return { rows: [{ id: 's1' }] };
      },
    });
    expect(out.settled).toBe(true);
    expect(writes).toBe(0);
  });

  it('the hook rejects rather than pushing the scene as persisted', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/useComposerPersistence.ts'),
      'utf8',
    );
    const guard = src.indexOf('if (!audioPlanSettled) {');
    const push = src.indexOf('persistedScenes.push({ ...scene, projectId: projectId! });', guard);
    expect(guard).toBeGreaterThan(0);
    expect(push).toBeGreaterThan(guard);
    const block = src.slice(guard, push);
    expect(block).toContain('throw new Error(');
    expect(block).toContain('audio_plan_cas_exhausted');
    // No fallback write hidden in the failure path.
    expect(block).not.toContain('.update(');
    expect(block).not.toContain('.upsert(');
  });

  it('the in-flight cache is released on rejection so the next save retries', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/useComposerPersistence.ts'),
      'utf8',
    );
    expect(src).toContain('inFlightPersists.set(cacheKey, promise);');
    const tryIdx = src.indexOf('return await promise;');
    const finallyIdx = src.indexOf('inFlightPersists.delete(cacheKey);', tryIdx);
    expect(finallyIdx).toBeGreaterThan(tryIdx);
    expect(src.slice(tryIdx, finallyIdx)).toContain('finally');
  });
});

describe('V537 no CAS token means fail closed, never an unfenced write', () => {
  it('a row without a usable updated_at rejects and writes nothing', async () => {
    let row = { audio_plan: serverPlan(A) as unknown, updated_at: null as unknown };
    let updateCalls = 0;

    async function loopWithoutToken() {
      let settled = false;
      let failure: string | null = null;
      for (let attempt = 1; attempt <= MAX_AUDIO_PLAN_CAS_ATTEMPTS; attempt += 1) {
        const fresh = { ...row };
        const write = planAudioPlanWrite(localPlanNoTwoshot(), fresh.audio_plan);
        if (write.kind === 'omit') {
          settled = true;
          break;
        }
        if (!isUsableCasToken(fresh.updated_at)) {
          failure = 'cas_token_missing';
          break;
        }
        updateCalls += 1;
        row = { audio_plan: write.audioPlan, updated_at: 'T1' };
        settled = true;
        break;
      }
      if (!settled) throw new Error(`audio_plan_cas_exhausted:${failure ?? 'unknown'} scene=s1`);
      return settled;
    }

    await expect(loopWithoutToken()).rejects.toThrow(
      /^audio_plan_cas_exhausted:cas_token_missing/,
    );
    expect(updateCalls).toBe(0);
    expect((row.audio_plan as any).twoshot.canonical_turn_ids).toEqual(A);
    expect((row.audio_plan as any).twoshot.segments.map((s: any) => s.turn_id)).toEqual(A);
  });

  it('no unfenced audio_plan write remains in the existing-scene path', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/hooks/useComposerPersistence.ts'),
      'utf8',
    );
    const updStart = src.indexOf('const { error: updErr }');
    const insStart = src.indexOf('.insert({', updStart);
    const updatePath = src.slice(updStart, insStart);

    // Exactly one audio_plan write in the whole existing-scene path …
    const writes = updatePath.match(/\.update\(\{ audio_plan:/g) ?? [];
    expect(writes.length).toBe(1);
    // … and it is fenced on BOTH the id and the token.
    const at = updatePath.indexOf('.update({ audio_plan:');
    const stmt = updatePath.slice(at, at + 260);
    expect(stmt).toContain(".eq('id', scene.id)");
    expect(stmt).toContain(".eq('updated_at', token)");
    expect(stmt).toContain(".select('id')");

    // The word "unfenced" no longer names a code path.
    expect(updatePath).not.toContain('unfencedErr');
    expect(updatePath).toContain("audioPlanFailure = 'cas_token_missing';");
  });
});
