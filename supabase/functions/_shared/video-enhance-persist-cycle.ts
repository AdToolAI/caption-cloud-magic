/**
 * The ONE persistence cycle of Video Enhance.
 *
 * Heavy work (moving a finished provider file into our storage) has exactly
 * one entry point: the atomic DB claim `video_enhance_claim_persist_run`.
 * Webhook, provider poller and the watchdog cron may all race — the claim
 * decides, everyone else exits silently.
 *
 * The transfer itself is untouched and lives in `video-enhance-finalize.ts` /
 * `video-enhance-transfer.ts`: 6 MB chunks, resumable upload URL, persisted
 * byte offset, deterministic object path. Nothing here buffers a whole file.
 */

import { finalizeFailure, finalizeSuccess } from './video-enhance-finalize.ts';
import { MAX_PERSIST_ATTEMPTS } from './video-enhance-transfer.ts';
import { persistLimits, setStatus } from './video-enhance-runtime.ts';

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Error codes that describe the provider FILE itself, not our infrastructure.
 * Re-fetching the same file can never change them, so they are terminal after
 * one confirming re-measure.
 */
const DETERMINISTIC_OUTPUT_FAILURES = new Set(['OUTPUT_MISMATCH', 'OUTPUT_INVALID']);
const OUTPUT_VERDICT_CONFIRM_ATTEMPTS = 2;

/** Lease held by one worker while it moves bytes. */
export const PERSIST_LEASE_SECONDS = 240;

export interface PersistCycleResult {
  claimed: number;
  completed: number;
  retried: number;
  manualReview: number;
  failed: number;
}

/**
 * Claim and process persistence work until `budgetMs` is spent or nothing is
 * claimable any more. A worker that runs out of budget mid-transfer simply
 * stops: the run keeps its stored offset and is resumed by the next claim.
 */
export async function runPersistCycle(
  admin: Admin,
  options: { maxRuns?: number; budgetMs?: number; env?: (key: string) => string | undefined } = {},
): Promise<PersistCycleResult> {
  const limits = persistLimits(options.env);
  const maxRuns = options.maxRuns ?? limits.maxGlobal;
  const budgetMs = options.budgetMs ?? 100_000;
  const deadline = Date.now() + budgetMs;

  const result: PersistCycleResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    manualReview: 0,
    failed: 0,
  };

  for (let i = 0; i < maxRuns; i++) {
    if (Date.now() >= deadline) break;

    const worker = crypto.randomUUID();
    const { data: claimedRows, error: claimError } = await admin.rpc(
      'video_enhance_claim_persist_run',
      {
        p_worker: worker,
        p_lease_seconds: PERSIST_LEASE_SECONDS,
        p_max_global: limits.maxGlobal,
        p_max_per_user: limits.maxPerUser,
      },
    );
    if (claimError) {
      console.error('[video-enhance-persist] claim failed:', claimError.message);
      break;
    }
    const claim = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!claim) break; // nothing due, or all slots busy — never an error.
    result.claimed++;

    const persistAttempts = Number(claim.persist_attempts ?? 0);

    // A verdict about the provider FILE is deterministic — re-fetching can
    // never change it. Provider failure (with release), not ours.
    if (
      DETERMINISTIC_OUTPUT_FAILURES.has(claim.error_code) &&
      persistAttempts >= OUTPUT_VERDICT_CONFIRM_ATTEMPTS
    ) {
      await finalizeFailure(
        admin,
        claim,
        claim.error_code,
        claim.error_message ?? 'provider output does not match the order',
        'persist',
      );
      result.failed++;
      continue;
    }

    // Retries exhausted: visible for recovery, WITHOUT refunding — the
    // provider file may still be there and is preserved on the row.
    if (persistAttempts >= MAX_PERSIST_ATTEMPTS) {
      await setStatus(admin, claim.id, 'manual_review', {
        failure_stage: 'persist',
        next_persist_at: null,
        next_reconcile_at: null,
        persist_lease_until: null,
      });
      result.manualReview++;
      continue;
    }

    const persisted = await finalizeSuccess(admin, claim, claim.provider_output_url);
    if (persisted.status === 'completed') result.completed++;
    else result.retried++;
  }

  return result;
}
