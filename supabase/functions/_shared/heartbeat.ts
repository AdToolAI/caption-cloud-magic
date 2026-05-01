/**
 * Heartbeat helper for scheduled background jobs.
 *
 * Every cron-driven edge function should call `recordHeartbeat()` at the END
 * of its run (success OR failure). The watchdog uses these timestamps to
 * detect silent worker deaths.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

export interface HeartbeatInput {
  jobName: string;
  status: "ok" | "error" | "warn";
  durationMs?: number;
  error?: string | null;
  expectedIntervalSeconds?: number;
}

let cached: ReturnType<typeof createClient> | null = null;
function client() {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cached = createClient(url, key);
  return cached;
}

export async function recordHeartbeat(input: HeartbeatInput): Promise<void> {
  try {
    const c = client() as any;
    if (!c) return;
    // Read previous failure count to increment on error
    const { data: prev } = await c
      .from("cron_heartbeats")
      .select("consecutive_failures")
      .eq("job_name", input.jobName)
      .maybeSingle();

    const prevFails = (prev?.consecutive_failures as number) ?? 0;
    const failures = input.status === "error" ? prevFails + 1 : 0;

    await c.from("cron_heartbeats").upsert({
      job_name: input.jobName,
      last_run_at: new Date().toISOString(),
      last_status: input.status,
      last_error: input.error ?? null,
      last_duration_ms: input.durationMs ?? null,
      expected_interval_seconds: input.expectedIntervalSeconds ?? 300,
      consecutive_failures: failures,
      updated_at: new Date().toISOString(),
    }, { onConflict: "job_name" });
  } catch (e) {
    console.error("[heartbeat] failed:", e);
  }
}

/** Convenience: wrap a cron job with automatic heartbeat reporting. */
export async function withHeartbeat<T>(
  jobName: string,
  expectedIntervalSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await recordHeartbeat({
      jobName,
      status: "ok",
      durationMs: Date.now() - start,
      expectedIntervalSeconds,
    });
    return result;
  } catch (e) {
    await recordHeartbeat({
      jobName,
      status: "error",
      durationMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      expectedIntervalSeconds,
    });
    throw e;
  }
}
