/**
 * V443 — Probe-Infrastructure vs. Measured Verdict (PURE + bounded re-measure)
 * ---------------------------------------------------------------------------
 * Confirmed RCA (S11, plate generation 9, 2026-08-22 16:00–16:06 UTC):
 * pass 0 had a GOOD immutable provider output, but the motion measurement died
 * on a transport error (`Unexpected end of JSON input`). The webhook classified
 * that as `indeterminate` and terminalized the whole scene through
 * `ssw:noop_fail`. Four minutes later the SAME immutable pinned output measured
 * delta_mean = 130.7 (> motion threshold 15.4) — clearly motion.
 *
 * A broken measurement is NOT a verdict about the clip. This module splits the
 * single `indeterminate` outcome into two classes:
 *
 *   probe_infra_error  — empty/truncated response, JSON parse failure, HTTP or
 *                        extraction failure, timeout/abort, transport error.
 *                        NOT a statement about the clip → bounded re-measure.
 *   measured_ambiguous — the measurement completed, the numeric result lies in
 *                        the existing gray zone (or the inputs are structurally
 *                        unusable). Fail-closed exactly as before.
 *
 * NOTHING here changes a threshold, a provider payload, an artifact identity or
 * a credit booking. Re-measurement always runs on the SAME immutable v434-pinned
 * provider output — no new provider generation, no new spend.
 */

export type MeasurementFailureClass = "probe_infra_error" | "measured_ambiguous";

/** Max re-measure attempts AFTER the first failed measurement. Frozen at 2. */
export const PROBE_INFRA_MAX_RETRIES = 2;

/** Short bounded backoff between the re-measure attempts (ms). */
export const PROBE_INFRA_BACKOFF_MS: readonly number[] = [750, 2000];

/** Telemetry state written when the bounded re-measure is exhausted. */
export const MOTION_UNVERIFIED_STATE = "motion_unverified";

/**
 * Substrings that identify an INFRASTRUCTURE/TRANSPORT failure of the probe.
 * Everything not listed here is treated as `measured_ambiguous` (fail-closed).
 */
const INFRA_PATTERNS: readonly string[] = [
  // transport / parsing of the Lambda still response
  "unexpected end of json input",
  "json",
  "lambda_http_",
  "lambda_no_output",
  "still_download_",
  "still_too_small",
  // extraction / decode infrastructure
  "dimensions_unknown",
  "insufficient_frames",
  // deadline / abort / network
  "measurement_deadline_exceeded",
  "timeouterror",
  "aborterror",
  "aborted",
  "timed out",
  "timeout",
  "network",
  "fetch failed",
  "connection",
  "econnreset",
  "socket",
  "stream",
  "http2",
  "503",
  "502",
  "504",
];

/**
 * Reasons that are explicitly NOT infrastructure: missing inputs, unusable
 * metrics and the gray-zone band. These keep today's fail-closed behavior.
 */
const NON_INFRA_PATTERNS: readonly string[] = [
  "preclip_url_missing",
  "provider_url_missing",
  "duration_unknown",
  "invalid_metric",
  "metric_not_finite",
  "roi_invalid",
  "still_dimensions_invalid",
  "measurement_missing",
  "between noop_threshold",
];

/** PURE — classifies a failed/unusable measurement reason. */
export function classifyMeasurementFailure(reason: string | null | undefined): MeasurementFailureClass {
  const r = String(reason ?? "").toLowerCase();
  if (!r) return "measured_ambiguous";
  for (const p of NON_INFRA_PATTERNS) {
    if (r.includes(p)) return "measured_ambiguous";
  }
  for (const p of INFRA_PATTERNS) {
    if (r.includes(p)) return "probe_infra_error";
  }
  return "measured_ambiguous";
}

/** PURE — convenience predicate. */
export function isProbeInfraError(reason: string | null | undefined): boolean {
  return classifyMeasurementFailure(reason) === "probe_infra_error";
}

export interface MeasurementLike {
  measurement_status: "measured" | "unmeasurable";
  reason: string;
}

export interface BoundedReMeasureOutcome<T extends MeasurementLike> {
  result: T;
  /** Total measurement attempts, including the first one. Max 1 + 2 = 3. */
  attempts: number;
  /** Which class the LAST failure belongs to (null when measured). */
  failureClass: MeasurementFailureClass | null;
  /** True when every bounded attempt failed for infrastructure reasons. */
  infraExhausted: boolean;
}

/**
 * Runs `measure` and — ONLY for `probe_infra_error` — repeats it at most
 * `PROBE_INFRA_MAX_RETRIES` times with a short bounded backoff. The caller must
 * pass the exact same immutable inputs on every attempt (same pinned provider
 * output, same preclip, same run/generation/pass identity).
 */
export async function measureWithBoundedReMeasure<T extends MeasurementLike>(
  measure: (attempt: number) => Promise<T>,
  opts?: {
    maxRetries?: number;
    backoffMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (info: { attempt: number; reason: string; waitMs: number }) => void;
  },
): Promise<BoundedReMeasureOutcome<T>> {
  const maxRetries = Math.max(0, opts?.maxRetries ?? PROBE_INFRA_MAX_RETRIES);
  const backoff = opts?.backoffMs ?? PROBE_INFRA_BACKOFF_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let attempts = 0;
  let result = await measure(++attempts);

  while (
    result.measurement_status !== "measured" &&
    isProbeInfraError(result.reason) &&
    attempts <= maxRetries
  ) {
    const waitMs = backoff[Math.min(attempts - 1, backoff.length - 1)] ?? 0;
    opts?.onRetry?.({ attempt: attempts, reason: result.reason, waitMs });
    if (waitMs > 0) await sleep(waitMs);
    result = await measure(++attempts);
  }

  const failureClass = result.measurement_status === "measured"
    ? null
    : classifyMeasurementFailure(result.reason);

  return {
    result,
    attempts,
    failureClass,
    infraExhausted: failureClass === "probe_infra_error",
  };
}
