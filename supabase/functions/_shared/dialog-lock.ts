/**
 * Per-scene dialog dispatch lock helper (v16).
 *
 * Wraps the `try_acquire_dialog_lock` / `release_dialog_lock` Postgres RPCs
 * with a small acquire-retry budget so webhooks (which MUST patch
 * `composer_scenes.dialog_shots` to record their write) don't get wedged
 * forever waiting on a poller — but also don't race against it.
 *
 * Strategy:
 *  - Try to acquire the lock up to 4× with 200/500/1000/1500 ms backoff.
 *  - If still not acquired (poller holds it), proceed WITHOUT the lock and
 *    log a warning. The poller's own reconciliation step (see
 *    poll-dialog-shots) is the safety net that re-hydrates any state we may
 *    have written into a stale snapshot.
 *  - Always release in `finally` if we did acquire.
 *
 * TTLs: webhook holders use 30 s (short, since their work is one RMW);
 * pollers use 60 s (longer, since they may run multi-step ticks).
 */
import type { createClient } from "npm:@supabase/supabase-js@2.75.0";

type SB = ReturnType<typeof createClient>;

/**
 * V511 — context handed to the locked callback.
 *
 * `runUnlocked` exists because of a proven production defect: on 2026-08-26
 * lipsync-watchdog held this lock for scene 67b392b1 while synchronously
 * POSTing to sync-so-webhook, which then tried to take the SAME lock for the
 * SAME scene. It never deadlocked — the acquire path below falls through
 * after four attempts — but every one of those callbacks burned 3.2 s of
 * backoff and then ran its critical section lockless, while the watchdog's
 * own lease stayed open for the whole round trip.
 *
 * Blocking I/O therefore has to happen with the lease RELEASED, not merely
 * with the lease ignored. Callers that do not take the argument are
 * unaffected: the parameter is optional and nothing about the acquire,
 * fallback or release behaviour changes for them.
 *
 * The state a caller read before `runUnlocked` is STALE afterwards. The lock
 * was genuinely gone; another writer may have committed. Re-read before
 * mutating — this helper cannot do it for you because it does not know what
 * you read.
 */
export interface DialogLockContext {
  /** Whether the lease is currently held (false = running in fallback mode). */
  readonly acquired: boolean;
  /**
   * Release the lease, run `io` with NO lock held, then re-acquire.
   *
   * `reacquired` is returned EXPLICITLY rather than folded into `acquired`,
   * because the honest answer after a failed re-acquire is caller-specific.
   * A caller whose remaining work is atomic or independently fenced may
   * continue; a caller that would perform a read-modify-write on the scene
   * must not, because another writer may have committed during the unlocked
   * phase and the lease is no longer there to order against it.
   *
   * `false` is also returned when the lease was never held to begin with —
   * the caller then never had exclusion and must not assume it now.
   */
  runUnlocked<R>(io: () => Promise<R>): Promise<{ result: R; reacquired: boolean }>;
}

export async function withDialogLock<T>(
  supabase: SB,
  sceneId: string,
  holderPrefix: string,
  fn: (ctx: DialogLockContext) => Promise<T>,
  opts: { ttlSeconds?: number; maxAttempts?: number } = {},
): Promise<{ result: T; acquired: boolean }> {
  const ttl = opts.ttlSeconds ?? 30;
  const maxAttempts = opts.maxAttempts ?? 4;
  const backoffMs = [200, 500, 1000, 1500];
  const holder = `${holderPrefix}-${crypto.randomUUID()}`;

  let acquired = false;
  const acquireOnce = async (): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.rpc("try_acquire_dialog_lock", {
        _scene_id: sceneId,
        _holder: holder,
        _ttl_seconds: ttl,
      });
      if (!error && data === true) {
        acquired = true;
        break;
      }
      if (error) {
        console.warn(
          `[dialog-lock] scene ${sceneId} holder=${holderPrefix} rpc error attempt=${attempt + 1}: ${error.message}`,
        );
        break; // RPC error → don't keep retrying, just proceed
      }
    } catch (e) {
      console.warn(
        `[dialog-lock] scene ${sceneId} holder=${holderPrefix} crash attempt=${attempt + 1}: ${(e as Error).message}`,
      );
      break;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt] ?? 1500));
    }
  }

    return acquired;
  };

  const releaseOnce = async (): Promise<void> => {
    if (!acquired) return;
    acquired = false;
    try {
      await supabase.rpc("release_dialog_lock", { _scene_id: sceneId, _holder: holder });
    } catch (e) {
      console.warn(
        `[dialog-lock] scene ${sceneId} holder=${holderPrefix} release failed: ${(e as Error).message}`,
      );
    }
  };

  await acquireOnce();
  if (!acquired) {
    console.warn(
      `[dialog-lock] scene ${sceneId} holder=${holderPrefix} proceeding WITHOUT lock after ${maxAttempts} attempts (poller reconciliation is safety net)`,
    );
  }

  const ctx: DialogLockContext = {
    get acquired() {
      return acquired;
    },
    async runUnlocked<R>(io: () => Promise<R>): Promise<{ result: R; reacquired: boolean }> {
      const held = acquired;
      await releaseOnce();
      let result: R;
      try {
        result = await io();
      } catch (e) {
        // Re-acquire even when `io` threw, so the outer `finally` releases a
        // lease that is actually held.
        if (held) await acquireOnce();
        throw e;
      }
      let reacquired = false;
      if (held) {
        reacquired = await acquireOnce();
        if (!reacquired) {
          console.warn(
            `[dialog-lock] scene ${sceneId} holder=${holderPrefix} could not re-acquire after unlocked I/O ` +
              `— the caller decides whether its remaining work is safe without exclusion`,
          );
        }
      }
      return { result, reacquired };
    },
  };

  try {
    const result = await fn(ctx);
    return { result, acquired };
  } finally {
    if (acquired) {
      try {
        await supabase.rpc("release_dialog_lock", {
          _scene_id: sceneId,
          _holder: holder,
        });
      } catch (e) {
        console.warn(
          `[dialog-lock] scene ${sceneId} holder=${holderPrefix} release failed: ${(e as Error).message}`,
        );
      }
    }
  }
}
