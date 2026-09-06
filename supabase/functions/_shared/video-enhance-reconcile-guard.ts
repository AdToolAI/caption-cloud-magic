/**
 * Caller and burst guard for `video-enhance-reconcile`.
 *
 * Kept in `_shared` so the rules are unit-testable without booting the
 * function's `serve()` — the reconciler imports them, the test suite proves
 * them.
 *
 * Abuse model. The scheduler (pg_cron, see the `video-enhance-reconcile-5min`
 * migration) authenticates with the project's PUBLISHABLE key: no privileged
 * secret lives in the cron command or in the repo. The endpoint is therefore
 * treated as reachable by anyone who has the app bundle, and the defence is
 * NOT the key but the shape of the work:
 *   - the request body is never read — no caller can pick rows;
 *   - the response carries counters only — never run or user data;
 *   - every unit of work is gated by a per-run timestamp the reconciler
 *     advances itself, so a second call right after the first finds nothing
 *     due and costs a handful of indexed queries — no provider traffic;
 *   - the in-isolate throttle below collapses bursts on top.
 * A user JWT is rejected outright: no product surface calls this function.
 */

/**
 * A full cycle is worth running at most this often. The schedule fires every
 * five minutes; anything denser is a burst and is answered without work.
 */
export const MIN_CYCLE_INTERVAL_MS = 30_000;

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Internal callers only. Accepted, in this order:
 *   1. `x-cron-secret` matching CRON_SECRET (when that secret is configured),
 *   2. the service role key as Bearer (edge-to-edge / admin tooling),
 *   3. the project's publishable key as Bearer or `apikey` — what pg_cron
 *      sends. It is public, which is exactly why the work itself is bounded.
 * A user JWT or an empty header is rejected.
 */
export function isUserJwt(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { role?: string; sub?: string };
    if (typeof claims.sub === 'string' && claims.sub.length > 0) return true;
    return typeof claims.role === 'string' && claims.role !== 'anon' &&
      claims.role !== 'service_role';
  } catch {
    return false;
  }
}

export function isInternalCaller(
  headers: Headers,
  env: (key: string) => string | undefined,
): boolean {
  const cronSecret = env('CRON_SECRET');
  const providedCron = headers.get('x-cron-secret');
  if (cronSecret && providedCron && timingSafeEqual(providedCron, cronSecret)) return true;

  const bearer = (headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const apikey = (headers.get('apikey') ?? '').trim();
  // A signed-in caller is rejected even when the request also carries the
  // public apikey header — every browser client sends that header.
  if (bearer.length > 0 && isUserJwt(bearer)) return false;
  const accepted = [env('SUPABASE_SERVICE_ROLE_KEY'), env('SUPABASE_ANON_KEY')]
    .filter((key): key is string => typeof key === 'string' && key.length > 0);
  return accepted.some((key) =>
    (bearer.length > 0 && timingSafeEqual(bearer, key)) ||
    (apikey.length > 0 && timingSafeEqual(apikey, key))
  );
}


export type CycleDecision =
  | { run: true }
  | { run: false; skipped: 'in_flight' }
  | { run: false; skipped: 'throttled'; retryInMs: number };

/**
 * Whether a cycle may start now. Pure: the caller owns the state and must
 * clear `inFlight` in a `finally`, whatever the cycle does.
 */
export function decideCycle(
  state: { inFlight: boolean; lastStartedAt: number },
  nowMs: number,
  minIntervalMs = MIN_CYCLE_INTERVAL_MS,
): CycleDecision {
  if (state.inFlight) return { run: false, skipped: 'in_flight' };
  const sinceLast = nowMs - state.lastStartedAt;
  if (sinceLast < minIntervalMs) {
    return { run: false, skipped: 'throttled', retryInMs: minIntervalMs - sinceLast };
  }
  return { run: true };
}
