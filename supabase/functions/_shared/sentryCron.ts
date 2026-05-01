/**
 * Sentry Cron Monitors — Layer 2 Observability
 *
 * Sends check-in events to Sentry's Cron Monitor API. Sentry alerts via
 * Email/Slack if a check-in is missed (= worker died silently) or if
 * `error` status is reported.
 *
 * Monitors are auto-created on first check-in (no manual Sentry setup).
 *
 * Usage:
 *   Deno.serve(withSentryCron("qa-watchdog", "*/2 * * * *", async (req) => {
 *     // existing handler logic
 *   }, { maxRuntimeMinutes: 5 }));
 *
 * Or manually:
 *   const id = await sentryCronCheckIn("my-job", "in_progress");
 *   try { ... await sentryCronCheckIn("my-job", "ok", id, durationMs); }
 *   catch (e) { await sentryCronCheckIn("my-job", "error", id, durationMs); }
 */

const SENTRY_AUTH_TOKEN = Deno.env.get("SENTRY_AUTH_TOKEN");
const SENTRY_ORG_SLUG = Deno.env.get("SENTRY_ORG_SLUG");
const SENTRY_PROJECT_SLUG = Deno.env.get("SENTRY_PROJECT_SLUG");

export type CronStatus = "in_progress" | "ok" | "error";

export interface MonitorConfig {
  /** Crontab expression, e.g. "*\/2 * * * *". Set null for on-demand jobs. */
  schedule: string | null;
  /** Tolerance window for late check-ins (minutes). Default 1. */
  checkinMargin?: number;
  /** Max time a job may run before considered failed (minutes). Default 30. */
  maxRuntime?: number;
  /** Failures before issue is created. Default 1 (alert immediately). */
  failureIssueThreshold?: number;
  timezone?: string;
}

function isEnabled(): boolean {
  return Boolean(SENTRY_AUTH_TOKEN && SENTRY_ORG_SLUG && SENTRY_PROJECT_SLUG);
}

/**
 * Send a check-in to Sentry. Non-throwing — Sentry outages must never break
 * production cron jobs.
 *
 * Returns the check-in ID so subsequent calls (ok/error) can be linked.
 */
export async function sentryCronCheckIn(
  monitorSlug: string,
  status: CronStatus,
  config: MonitorConfig,
  options?: { checkInId?: string; durationMs?: number },
): Promise<string | null> {
  if (!isEnabled()) return null;

  try {
    const url = options?.checkInId
      ? `https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/monitors/${monitorSlug}/checkins/${options.checkInId}/`
      : `https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/monitors/${monitorSlug}/checkins/`;

    const method = options?.checkInId ? "PUT" : "POST";

    const body: Record<string, unknown> = {
      status,
      monitor_config: {
        schedule: config.schedule
          ? { type: "crontab", value: config.schedule }
          : { type: "interval", value: 1, unit: "day" }, // dummy for on-demand
        checkin_margin: config.checkinMargin ?? 1,
        max_runtime: config.maxRuntime ?? 30,
        failure_issue_threshold: config.failureIssueThreshold ?? 1,
        timezone: config.timezone ?? "UTC",
      },
      environment: "production",
    };

    if (options?.durationMs !== undefined) {
      body.duration = options.durationMs;
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[sentryCron] ${monitorSlug} ${status} → ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await res.json().catch(() => ({}));
    return data.id ?? options?.checkInId ?? null;
  } catch (err) {
    console.warn(`[sentryCron] ${monitorSlug} ${status} failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Wrap a Deno.serve handler with Sentry Cron check-ins.
 * - Sends `in_progress` at start
 * - Sends `ok` on success (with duration)
 * - Sends `error` on thrown exception
 * - All Sentry calls are non-blocking via EdgeRuntime.waitUntil where possible
 */
export function withSentryCron(
  monitorSlug: string,
  config: MonitorConfig,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    // Skip check-ins for OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") {
      return await handler(req);
    }

    const start = Date.now();
    const checkInId = await sentryCronCheckIn(monitorSlug, "in_progress", config);

    try {
      const res = await handler(req);
      const duration = Date.now() - start;
      // Fire-and-forget the success check-in
      const finalStatus: CronStatus = res.status >= 500 ? "error" : "ok";
      // Don't await — don't add latency to user response
      sentryCronCheckIn(monitorSlug, finalStatus, config, {
        checkInId: checkInId ?? undefined,
        durationMs: duration,
      }).catch(() => {});
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      await sentryCronCheckIn(monitorSlug, "error", config, {
        checkInId: checkInId ?? undefined,
        durationMs: duration,
      });
      throw err;
    }
  };
}

export function sentryCronEnabled(): boolean {
  return isEnabled();
}
