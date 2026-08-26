/**
 * V511 — WEBHOOK APPLY ACKNOWLEDGEMENT + IDEMPOTENT REHOST IDENTITY
 * ---------------------------------------------------------------------------
 * Scene 67b392b1, generation 12, run ba3be9a8, pass 5 (Kay Mark).
 *
 * The provider finished. The output was rehosted. V465 measured 2.0237 —
 * inside the 2.00..2.65 gray band — V466 re-measured with 16 stills, the pass
 * stayed indeterminate, and MOTION_UNVERIFIED plus V465_VERDICT were both
 * persisted. Then nothing. `composer_scene_transition_log` holds ZERO rows for
 * pipeline job acd9070a, which is only possible if
 * `composer_apply_sync_segment_result` was never called: every rejection path
 * inside that RPC writes an audit row before returning.
 *
 * The webhook therefore ran out of invocation before it reached the apply, and
 * did so 27 times in 22 minutes, redoing the full download-and-upload of the
 * same MP4 each time. What made that survivable-looking instead of loud is the
 * watchdog's progress test:
 *
 *     if (r.terminal && r.status === "COMPLETED" && r.applied !== false)
 *
 * `applied` is `boolean | undefined`, and `undefined !== false` is true. A
 * timeout, an empty body, a `skipped:` response and a crash all produce
 * `undefined` — so every one of them read as "recovered", the watchdog skipped
 * its own escalation, and the run drifted to `watchdog_hard_timeout` with a
 * finished provider result sitting in storage.
 *
 * This module holds the two pure decisions that prevent a repeat: what counts
 * as an applied callback, and when a rehost may be skipped.
 */

// ═══════════════════════════════════════════════════════════════════════════
// F1 — STRICT APPLY ACKNOWLEDGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `applied`  the webhook said so, in as many words.
 * `rejected` the webhook said the opposite, in as many words.
 * `unknown`  everything else — and it is NOT progress.
 */
export type WebhookApplyState = "applied" | "rejected" | "unknown";

export interface ApplyAck {
  state: WebhookApplyState;
  /** True only for `state === "applied"`. The single progress predicate. */
  progressed: boolean;
  httpStatus: number | null;
  reason: string | null;
  /** Why this was classified `unknown`, when it was. */
  unknownCause:
    | null
    | "transport_error"
    | "non_2xx"
    | "unparsable_body"
    | "no_applied_field";
}

const trimReason = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, 200) : null;
};

/**
 * PURE — classify a webhook forward.
 *
 * `body` is whatever came back, including `null` for an unparsable or absent
 * one. `transportError` marks a throw or an abort before any response.
 *
 * HTTP 200 is deliberately NOT sufficient. The webhook answers 200 for a dozen
 * outcomes that changed nothing — `apply_unavailable`,
 * `lock_phase_io_rounds_exhausted`, `stale_run_result`,
 * `ignored_due_scene_failed` — and every one of them was previously read as
 * success. Only an explicit `applied: true` is progress.
 */
export function classifyWebhookApplyAck(input: {
  httpStatus?: number | null;
  body?: Record<string, unknown> | null;
  transportError?: boolean;
}): ApplyAck {
  const httpStatus = typeof input.httpStatus === "number" ? input.httpStatus : null;
  const body = input.body ?? null;
  const reason = body
    ? (trimReason(body.reason) ?? trimReason(body.skipped) ?? trimReason(body.verdict))
    : null;

  const unknown = (unknownCause: ApplyAck["unknownCause"]): ApplyAck => ({
    state: "unknown",
    progressed: false,
    httpStatus,
    reason,
    unknownCause,
  });

  if (input.transportError === true) return unknown("transport_error");
  if (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)) return unknown("non_2xx");
  if (body === null || typeof body !== "object") return unknown("unparsable_body");

  if (body.applied === true) {
    return { state: "applied", progressed: true, httpStatus, reason, unknownCause: null };
  }
  if (body.applied === false) {
    return { state: "rejected", progressed: false, httpStatus, reason, unknownCause: null };
  }
  return unknown("no_applied_field");
}

/** PURE — bounded diagnostics. No provider URL, no output URL, ever. */
export function buildApplyAckTelemetry(
  ack: ApplyAck,
  ids: { pipelineJobId?: string | null; passIdx?: number | null },
): Record<string, unknown> {
  return {
    webhook_apply_state: ack.state,
    webhook_http_status: ack.httpStatus,
    webhook_reason: ack.reason,
    webhook_unknown_cause: ack.unknownCause,
    pipeline_job_id: ids.pipelineJobId ?? null,
    pass_idx: typeof ids.passIdx === "number" ? ids.passIdx : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// F3 — IDEMPOTENT REHOST
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The epoch a rehosted object belongs to.
 *
 * The legacy destination key is `composer/<uid>/<scene>-lipsync-pass-<n>.mp4`
 * — scene and pass only. It is NOT run- or generation-qualified, so its mere
 * existence proves nothing about WHICH attempt produced it: a generation-11
 * object sits at the identical path as a generation-12 one.
 *
 * The key itself is deliberately left alone. It is the URL that reaches the
 * pass slot and the mux, and changing it would move production output for a
 * liveness fix. Instead the CACHE DECISION is qualified: the rehost stamps a
 * marker on the pass slot recording which run, generation and external job the
 * object at that path came from, and a later callback may skip the download
 * only when all three still match. Same path, same last-writer-wins upsert, so
 * two concurrent callbacks for the same attempt converge on one object — but a
 * different run, generation or job can never be mistaken for a cache hit.
 */
export interface RehostEpoch {
  runId: string | null;
  plateGeneration: number | null;
  externalJobId: string | null;
}

export const V511_REHOST_MARKER_KEY = "v511_rehost";

export interface RehostMarker extends RehostEpoch {
  url: string;
  at?: string;
}

export type RehostCacheState = "hit" | "miss";

export interface RehostDecision {
  cache: RehostCacheState;
  /** Present only on a hit: the stable URL to reuse without any I/O. */
  url: string | null;
  /** Why the cache was not used. */
  missCause:
    | null
    | "no_marker"
    | "malformed_marker"
    | "run_mismatch"
    | "generation_mismatch"
    | "job_mismatch"
    | "no_url"
    | "incomplete_epoch";
}

const sameStr = (a: unknown, b: unknown): boolean =>
  typeof a === "string" && typeof b === "string" && a === b;

/**
 * PURE — may this callback reuse the object already at the deterministic path?
 *
 * Fails closed in every ambiguous case. A miss costs one download; a wrong hit
 * would publish another run's face as this run's output, so there is no
 * symmetry between the two errors and none is assumed.
 */
export function decideRehost(input: {
  marker: unknown;
  epoch: RehostEpoch;
}): RehostDecision {
  const miss = (missCause: RehostDecision["missCause"]): RehostDecision => ({
    cache: "miss",
    url: null,
    missCause,
  });

  const { runId, plateGeneration, externalJobId } = input.epoch;
  // An epoch we cannot fully state is an epoch we cannot match against.
  if (!runId || !externalJobId || typeof plateGeneration !== "number") {
    return miss("incomplete_epoch");
  }

  const m = input.marker;
  if (m == null) return miss("no_marker");
  if (typeof m !== "object" || Array.isArray(m)) return miss("malformed_marker");
  const marker = m as Partial<RehostMarker>;

  if (!sameStr(marker.runId, runId)) return miss("run_mismatch");
  if (Number(marker.plateGeneration) !== plateGeneration) return miss("generation_mismatch");
  if (!sameStr(marker.externalJobId, externalJobId)) return miss("job_mismatch");
  if (typeof marker.url !== "string" || marker.url.length === 0) return miss("no_url");

  return { cache: "hit", url: marker.url, missCause: null };
}

/** PURE — the marker a completed rehost writes back onto its own pass slot. */
export function buildRehostMarker(input: { epoch: RehostEpoch; url: string; at: string }): RehostMarker {
  return {
    runId: input.epoch.runId,
    plateGeneration: input.epoch.plateGeneration,
    externalJobId: input.epoch.externalJobId,
    url: input.url,
    at: input.at,
  };
}
