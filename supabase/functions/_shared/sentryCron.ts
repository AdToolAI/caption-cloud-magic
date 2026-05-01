/**
 * Sentry Cron Monitors — Layer 2 Observability (DSN Envelope variant)
 *
 * Sends check-in envelopes directly to the Sentry ingest endpoint using the
 * project DSN. No auth token needed, no special scopes. Monitors are
 * auto-provisioned in Sentry on first check-in via the embedded
 * `monitor_config`.
 *
 * Docs: https://docs.sentry.io/product/crons/getting-started/http/
 *
 * Usage:
 *   Deno.serve(withSentryCron("qa-watchdog", { schedule: "*\/2 * * * *" }, handler));
 */

const SENTRY_DSN = Deno.env.get("SENTRY_DSN");

export type CronStatus = "in_progress" | "ok" | "error";

export interface MonitorConfig {
  schedule: string | null;
  checkinMargin?: number;
  maxRuntime?: number;
  failureIssueThreshold?: number;
  timezone?: string;
}

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
}

let cachedDsn: ParsedDsn | null | undefined;

function parseDsn(): ParsedDsn | null {
  if (cachedDsn !== undefined) return cachedDsn;
  if (!SENTRY_DSN) {
    cachedDsn = null;
    return null;
  }
  try {
    const u = new URL(SENTRY_DSN);
    const projectId = u.pathname.replace(/^\/+/, "");
    if (!u.username || !u.host || !projectId) throw new Error("DSN missing parts");
    cachedDsn = {
      publicKey: u.username,
      host: u.host,
      projectId,
      protocol: u.protocol.replace(":", ""),
    };
    return cachedDsn;
  } catch (e) {
    console.warn("[sentryCron] Invalid SENTRY_DSN:", (e as Error).message);
    cachedDsn = null;
    return null;
  }
}

function uuid32(): string {
  // Sentry envelope IDs: 32 hex chars (no dashes)
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Send a check-in envelope to Sentry. Non-throwing.
 * Returns the check_in_id so subsequent ok/error calls can update the same row.
 */
export async function sentryCronCheckIn(
  monitorSlug: string,
  status: CronStatus,
  config: MonitorConfig,
  options?: { checkInId?: string; durationMs?: number },
): Promise<string | null> {
  const dsn = parseDsn();
  if (!dsn) return null;

  try {
    const eventId = uuid32();
    const checkInId = options?.checkInId ?? uuid32();

    const checkIn: Record<string, unknown> = {
      check_in_id: checkInId,
      monitor_slug: monitorSlug,
      status,
      environment: "production",
      monitor_config: {
        schedule: config.schedule
          ? { type: "crontab", value: config.schedule }
          : { type: "interval", value: 1, unit: "day" },
        checkin_margin: config.checkinMargin ?? 1,
        max_runtime: config.maxRuntime ?? 30,
        failure_issue_threshold: config.failureIssueThreshold ?? 1,
        timezone: config.timezone ?? "UTC",
      },
    };
    if (options?.durationMs !== undefined) {
      checkIn.duration = options.durationMs / 1000; // seconds
    }

    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn: SENTRY_DSN,
    });
    const itemHeader = JSON.stringify({ type: "check_in" });
    const itemPayload = JSON.stringify(checkIn);
    const body = `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`;

    const url = `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/`;
    const auth =
      `Sentry sentry_version=7,sentry_client=lovable-cron/1.0,sentry_key=${dsn.publicKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": auth,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        `[sentryCron] ${monitorSlug} ${status} → ${res.status}: ${text.slice(0, 200)}`,
      );
      return null;
    }
    return checkInId;
  } catch (err) {
    console.warn(`[sentryCron] ${monitorSlug} ${status} failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Wrap a Deno.serve handler with Sentry Cron check-ins.
 */
export function withSentryCron(
  monitorSlug: string,
  config: MonitorConfig,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return await handler(req);
    }

    const start = Date.now();
    const checkInId = await sentryCronCheckIn(monitorSlug, "in_progress", config);

    try {
      const res = await handler(req);
      const duration = Date.now() - start;
      const finalStatus: CronStatus = res.status >= 500 ? "error" : "ok";
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
  return parseDsn() !== null;
}
