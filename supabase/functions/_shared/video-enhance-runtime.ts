/**
 * Shared runtime for the one Video Enhance engine.
 *
 * Every money movement, every state change and every finalisation lives here,
 * so the submit function, the webhook and the reconciler behave identically
 * and can safely race each other.
 */

import { actualMargin, costDrift } from './video-enhance-models.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

export const STAGING_BUCKET = 'background-projects';

export type RunStatus =
  | 'created'
  | 'credits_reserved'
  | 'provider_submitting'
  | 'provider_submitted'
  | 'provider_processing'
  | 'provider_output_ready'
  | 'asset_staging'
  | 'asset_persisting'
  | 'completed'
  | 'provider_failed'
  | 'cancel_requested'
  | 'provider_cancelled_confirmed'
  | 'local_poll_timeout'
  | 'asset_persist_failed'
  | 'manual_review';

export const TERMINAL_STATUSES: RunStatus[] = [
  'completed',
  'provider_failed',
  'provider_cancelled_confirmed',
];

/** Lease held while one worker submits to the provider. */
export const SUBMIT_LEASE_SECONDS = 120;
/** After this long without an authoritative provider verdict: manual review. */
export const RECONCILE_HORIZON_MINUTES = 180;

export function ledgerKey(runId: string, operation: 'reserve' | 'capture' | 'release'): string {
  return `video_enhance:${runId}:${operation}`;
}

export function backoffMinutes(attempt: number): number {
  return Math.min(60, 2 ** Math.min(attempt, 5));
}

export interface LedgerResult {
  applied: boolean;
  reason?: 'duplicate' | 'wallet_error';
  error?: string;
}

/**
 * Idempotent money movement. The unique operation key is the guard: even if
 * webhook, poller and a retry run at the same moment and a status check fails,
 * an amount can never move twice.
 */
export async function walletOperation(
  admin: Admin,
  params: {
    runId: string;
    userId: string;
    operation: 'reserve' | 'capture' | 'release';
    amountEur: number;
    note?: string;
  },
): Promise<LedgerResult> {
  const key = ledgerKey(params.runId, params.operation);
  const { error: insertError } = await admin.from('video_enhance_ledger').insert({
    run_id: params.runId,
    user_id: params.userId,
    operation: params.operation,
    operation_key: key,
    amount_eur: params.amountEur,
    note: params.note ?? null,
  });

  if (insertError) {
    // 23505 = unique violation: this operation already happened.
    if (String(insertError.code) === '23505') return { applied: false, reason: 'duplicate' };
    return { applied: false, reason: 'wallet_error', error: insertError.message };
  }

  // `reserve` and `capture` both leave the money with AdTool: the reservation
  // already debits the wallet, the capture only confirms it. `release` gives
  // the reservation back.
  if (params.operation === 'reserve') {
    const { error } = await admin.rpc('deduct_ai_video_credits', {
      p_user_id: params.userId,
      p_amount: params.amountEur,
      p_generation_id: params.runId,
    });
    if (error) return { applied: false, reason: 'wallet_error', error: error.message };
  } else if (params.operation === 'release') {
    const { error } = await admin.rpc('refund_ai_video_credits', {
      p_user_id: params.userId,
      p_amount_euros: params.amountEur,
      p_generation_id: params.runId,
    });
    if (error) return { applied: false, reason: 'wallet_error', error: error.message };
  }

  return { applied: true };
}

export function newCallbackToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setStatus(
  admin: Admin,
  runId: string,
  status: RunStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await admin
    .from('video_enhance_runs')
    .update({ status, ...patch })
    .eq('id', runId);
}

export interface OutputCheck {
  ok: boolean;
  reason?: string;
  sizeBytes?: number;
  contentType?: string;
}

/**
 * Server-side output validation. Runs on the STAGED copy, before an asset row
 * and before the capture — an invalid output is never marked as finished.
 */
export function validateStagedOutput(
  bytes: ArrayBuffer,
  contentType: string,
  expected: { minBytes?: number },
): OutputCheck {
  const sizeBytes = bytes.byteLength;
  if (sizeBytes < (expected.minBytes ?? 1024)) {
    return { ok: false, reason: 'output_empty', sizeBytes };
  }
  const type = contentType.toLowerCase();
  if (!type.startsWith('video/') && !type.includes('octet-stream')) {
    return { ok: false, reason: 'unexpected_content_type', sizeBytes, contentType };
  }
  // ISO base media files carry an `ftyp` box in the first 12 bytes.
  const head = new Uint8Array(bytes.slice(0, 12));
  const marker = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (marker !== 'ftyp') return { ok: false, reason: 'not_a_video_container', sizeBytes };
  return { ok: true, sizeBytes, contentType };
}

/** Tolerances for the measured output against what the user paid for. */
export function outputMatchesOrder(
  measured: { durationSeconds: number; width: number; height: number; fps: number },
  ordered: { durationSeconds: number; width: number; height: number; fps: number },
): OutputCheck {
  const durationGap = Math.abs(measured.durationSeconds - ordered.durationSeconds);
  if (ordered.durationSeconds > 0 && durationGap / ordered.durationSeconds > 0.1) {
    return { ok: false, reason: 'duration_mismatch' };
  }
  if (measured.width < ordered.width * 0.9 || measured.height < ordered.height * 0.9) {
    return { ok: false, reason: 'resolution_mismatch' };
  }
  if (ordered.fps > 0 && Math.abs(measured.fps - ordered.fps) / ordered.fps > 0.15) {
    return { ok: false, reason: 'fps_mismatch' };
  }
  return { ok: true };
}

export function stagingKey(userId: string, runId: string): string {
  return `${userId}/video-enhance-staging/${runId}.mp4`;
}

export function outputKey(userId: string, runId: string): string {
  return `${userId}/video-enhance/${runId}.mp4`;
}

/** Records the actual provider cost and flags rate-card drift. */
export function reconcileCost(
  run: { user_price_eur: number; provider_cost_usd_estimated: number },
  providerCostUsdActual: number,
) {
  const margin = actualMargin(Number(run.user_price_eur), providerCostUsdActual);
  const drift = costDrift(Number(run.provider_cost_usd_estimated), providerCostUsdActual);
  return {
    provider_cost_usd_actual: providerCostUsdActual,
    actual_contribution_eur: margin.actualContributionEur,
    actual_margin_pct: margin.actualMarginPct,
    cost_drift_ratio: drift.ratio,
    _warn: drift.warn,
    _block: drift.block,
  };
}
