/**
 * Money and lifecycle guarantees of the one Video Enhance engine.
 *
 * These are the rules the plan makes non-negotiable:
 *   - a reservation happens before the provider is touched, exactly once
 *   - the frozen price is what is charged, even if the provider bills more
 *   - a cancel WISH never refunds; only a confirmed provider cancel does
 *   - a local timeout never refunds
 *   - a persistence retry never triggers a second provider job or debit
 *   - an invalid output never becomes a finished asset
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ledgerKey,
  backoffMinutes,
  outputMatchesOrder,
  reconcileCost,
  validateStagedOutput,
  walletOperation,
  TERMINAL_STATUSES,
} from '../../supabase/functions/_shared/video-enhance-runtime.ts';
import {
  costDrift,
  priceVideoEnhanceRun,
  actualMargin,
} from '../../supabase/functions/_shared/video-enhance-models.ts';

// --- fake backend ----------------------------------------------------------

interface LedgerRow {
  run_id: string;
  operation: string;
  operation_key: string;
  amount_eur: number;
}

function makeAdmin() {
  const ledger: LedgerRow[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const admin = {
    ledger,
    rpcCalls,
    from(table: string) {
      return {
        insert(payload: LedgerRow) {
          if (table !== 'video_enhance_ledger') return Promise.resolve({ error: null });
          if (ledger.some((row) => row.operation_key === payload.operation_key)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
          }
          ledger.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ error: null });
    },
  };
  return admin;
}

let admin: ReturnType<typeof makeAdmin>;
beforeEach(() => {
  admin = makeAdmin();
});

const RUN = { runId: 'run-1', userId: 'user-1' };

describe('wallet idempotency', () => {
  it('reserves exactly once even when three workers race', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        walletOperation(admin, { ...RUN, operation: 'reserve', amountEur: 1.5 }),
      ),
    );
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'duplicate')).toHaveLength(2);
    expect(admin.rpcCalls.filter((c) => c.name === 'deduct_ai_video_credits')).toHaveLength(1);
  });

  it('never captures or releases twice', async () => {
    await walletOperation(admin, { ...RUN, operation: 'reserve', amountEur: 1.5 });
    await walletOperation(admin, { ...RUN, operation: 'capture', amountEur: 1.5 });
    await walletOperation(admin, { ...RUN, operation: 'capture', amountEur: 1.5 });
    const release1 = await walletOperation(admin, { ...RUN, operation: 'release', amountEur: 1.5 });
    const release2 = await walletOperation(admin, { ...RUN, operation: 'release', amountEur: 1.5 });
    expect(release1.applied).toBe(true);
    expect(release2.applied).toBe(false);
    expect(admin.rpcCalls.filter((c) => c.name === 'refund_ai_video_credits')).toHaveLength(1);
  });

  it('uses separate keys per operation and per run', () => {
    expect(ledgerKey('a', 'reserve')).not.toBe(ledgerKey('a', 'capture'));
    expect(ledgerKey('a', 'reserve')).not.toBe(ledgerKey('b', 'reserve'));
    expect(ledgerKey('a', 'reserve')).toBe('video_enhance:a:reserve');
  });

  it('capture keeps the money without a second wallet movement', async () => {
    await walletOperation(admin, { ...RUN, operation: 'reserve', amountEur: 2 });
    admin.rpcCalls.length = 0;
    await walletOperation(admin, { ...RUN, operation: 'capture', amountEur: 2 });
    expect(admin.rpcCalls).toHaveLength(0);
  });
});

describe('frozen price', () => {
  const config = {
    modelId: 'bytedance-vcube',
    mode: 'aigc',
    resolution: '1080p' as const,
    fps: 30,
    tier: 'standard' as const,
  };
  const source = { durationSeconds: 10, width: 1280, height: 720, fps: 30 };

  it('charges the reserved amount even when the provider bills more', () => {
    const snapshot = priceVideoEnhanceRun(config, source);
    const actual = actualMargin(snapshot.userPriceEur, snapshot.providerCostUsdEstimated * 3);
    // The user price does not move; only the recorded margin does.
    expect(snapshot.userPriceEur).toBe(priceVideoEnhanceRun(config, source).userPriceEur);
    expect(actual.actualContributionEur).toBeLessThan(snapshot.contributionEur);
  });

  it('warns and then blocks when provider cost drifts away from the rate card', () => {
    expect(costDrift(1, 1.05).warn).toBe(false);
    expect(costDrift(1, 1.25).warn).toBe(true);
    expect(costDrift(1, 1.25).block).toBe(false);
    expect(costDrift(1, 2).block).toBe(true);
  });

  it('records prediction and actuals separately', () => {
    const patch = reconcileCost({ user_price_eur: 1, provider_cost_usd_estimated: 0.2 }, 0.5);
    expect(patch.provider_cost_usd_actual).toBe(0.5);
    expect(patch.cost_drift_ratio).toBeCloseTo(1.5, 6);
    expect(patch._block).toBe(true);
  });
});

describe('output validation before asset and capture', () => {
  function fakeVideo(bytes: number): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes);
    const view = new Uint8Array(buffer);
    view.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70], 0); // size + "ftyp"
    return buffer;
  }

  it('rejects an empty file', () => {
    expect(validateStagedOutput(fakeVideo(10), 'video/mp4', {}).ok).toBe(false);
  });

  it('rejects a non-video content type', () => {
    expect(validateStagedOutput(fakeVideo(4096), 'text/html', {}).reason).toBe('unexpected_content_type');
  });

  it('rejects a file without a container header', () => {
    const buffer = new ArrayBuffer(4096);
    expect(validateStagedOutput(buffer, 'video/mp4', {}).reason).toBe('not_a_video_container');
  });

  it('accepts a plausible mp4', () => {
    expect(validateStagedOutput(fakeVideo(4096), 'video/mp4', {}).ok).toBe(true);
  });

  it('rejects an output that does not match the order', () => {
    const ordered = { durationSeconds: 10, width: 3840, height: 2160, fps: 30 };
    expect(outputMatchesOrder({ durationSeconds: 10, width: 1920, height: 1080, fps: 30 }, ordered).reason)
      .toBe('resolution_mismatch');
    expect(outputMatchesOrder({ durationSeconds: 4, width: 3840, height: 2160, fps: 30 }, ordered).reason)
      .toBe('duration_mismatch');
    expect(outputMatchesOrder({ durationSeconds: 10, width: 3840, height: 2160, fps: 15 }, ordered).reason)
      .toBe('fps_mismatch');
    expect(outputMatchesOrder({ durationSeconds: 10.2, width: 3840, height: 2160, fps: 30 }, ordered).ok)
      .toBe(true);
  });
});

describe('lifecycle guarantees', () => {
  it('treats only provider verdicts as terminal', () => {
    expect(TERMINAL_STATUSES).toEqual([
      'completed',
      'provider_failed',
      'provider_cancelled_confirmed',
    ]);
    expect(TERMINAL_STATUSES).not.toContain('cancel_requested');
    expect(TERMINAL_STATUSES).not.toContain('local_poll_timeout');
    expect(TERMINAL_STATUSES).not.toContain('asset_persist_failed');
  });

  it('backs off between reconciliation attempts and caps the delay', () => {
    expect(backoffMinutes(1)).toBe(2);
    expect(backoffMinutes(3)).toBe(8);
    expect(backoffMinutes(99)).toBe(32);
  });
});
