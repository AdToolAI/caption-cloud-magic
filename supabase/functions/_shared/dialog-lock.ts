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

export async function withDialogLock<T>(
  supabase: SB,
  sceneId: string,
  holderPrefix: string,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; maxAttempts?: number } = {},
): Promise<{ result: T; acquired: boolean }> {
  const ttl = opts.ttlSeconds ?? 30;
  const maxAttempts = opts.maxAttempts ?? 4;
  const backoffMs = [200, 500, 1000, 1500];
  const holder = `${holderPrefix}-${crypto.randomUUID()}`;

  let acquired = false;
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

  if (!acquired) {
    console.warn(
      `[dialog-lock] scene ${sceneId} holder=${holderPrefix} proceeding WITHOUT lock after ${maxAttempts} attempts (poller reconciliation is safety net)`,
    );
  }

  try {
    const result = await fn();
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
