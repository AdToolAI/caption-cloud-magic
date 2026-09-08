import { supabase } from '@/integrations/supabase/client';
import type { EnhanceRunRow } from '@/hooks/useEnhanceVideo';

/**
 * App-wide store of the enhancement jobs the BACKEND owns.
 *
 * An upscale does not belong to a panel, a tab or a browser: it runs on the
 * server and keeps running when the customer navigates away, reloads or closes
 * everything. This store is therefore an observer, never an owner — it holds
 * every unfinished run of the signed-in user, polls each one independently and
 * lets any surface (Enhance panel, job center, History) show the same truth.
 */

export const ENHANCE_TERMINAL_STATUSES = [
  'completed',
  'provider_failed',
  'output_lost',
  'provider_cancelled_confirmed',
];

/** `manual_review` is unfinished for us, but it no longer moves on its own. */
export const ENHANCE_STALLED_STATUSES = ['manual_review'];

export function isEnhanceTerminal(status: string): boolean {
  return ENHANCE_TERMINAL_STATUSES.includes(status);
}

/** Whether the run still changes by itself and is therefore worth polling. */
export function isEnhanceLive(status: string): boolean {
  return !isEnhanceTerminal(status) && !ENHANCE_STALLED_STATUSES.includes(status);
}

const POLL_INTERVAL_MS = 5_000;

type Listener = (runs: EnhanceRunRow[]) => void;

const runs = new Map<string, EnhanceRunRow>();
const timers = new Map<string, number>();
const listeners = new Set<Listener>();
let hydrated = false;
let hydrating: Promise<void> | null = null;

function snapshot(): EnhanceRunRow[] {
  return Array.from(runs.values()).sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );
}

let cached: EnhanceRunRow[] = [];

export function getEnhanceRuns(): EnhanceRunRow[] {
  return cached;
}

function emit() {
  cached = snapshot();
  for (const listener of listeners) listener(cached);
}

export function subscribeEnhanceRuns(listener: Listener): () => void {
  listeners.add(listener);
  listener(cached);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchRun(runId: string): Promise<EnhanceRunRow | null> {
  const { data, error } = await supabase.functions.invoke('video-enhance', {
    body: { action: 'status', runId },
  });
  if (error || !data?.run) return null;
  return data.run as EnhanceRunRow;
}

function stopPolling(runId: string) {
  const timer = timers.get(runId);
  if (timer) window.clearInterval(timer);
  timers.delete(runId);
}

/**
 * One independent poll loop per run — a second job never replaces the first,
 * and cancelling one leaves every other loop untouched.
 */
function startPolling(runId: string) {
  if (timers.has(runId)) return;
  const timer = window.setInterval(async () => {
    const fresh = await fetchRun(runId);
    // A polling hiccup is not a verdict: keep the run and keep watching.
    if (!fresh) return;
    upsertEnhanceRun(fresh);
  }, POLL_INTERVAL_MS);
  timers.set(runId, timer);
}

export function upsertEnhanceRun(run: EnhanceRunRow): void {
  runs.set(run.id, run);
  if (isEnhanceLive(run.status)) startPolling(run.id);
  else stopPolling(run.id);
  emit();
}

/** Drops a finished run from the live view without touching the backend. */
export function dismissEnhanceRun(runId: string): void {
  stopPolling(runId);
  runs.delete(runId);
  emit();
}

/**
 * Restores every unfinished job of the signed-in user.
 *
 * Called on app start and by any surface that mounts, so reload, navigation
 * and a fresh login all end with the same set of visible jobs. Runs at most
 * once concurrently; `force` re-reads after a login change.
 */
export async function hydrateEnhanceRuns(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('video-enhance', {
        body: { action: 'open_runs' },
      });
      if (error) return;
      const open = (data?.runs ?? []) as EnhanceRunRow[];
      for (const run of open) {
        // Never clobber a fresher local state with the hydration snapshot.
        if (!runs.has(run.id)) upsertEnhanceRun(run);
      }
      hydrated = true;
    } catch {
      // Signed out or offline: the surfaces simply start empty.
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

/** Test seam: forget everything without leaking interval timers. */
export function resetEnhanceRunStore(): void {
  for (const runId of Array.from(timers.keys())) stopPolling(runId);
  runs.clear();
  hydrated = false;
  hydrating = null;
  emit();
}
