/**
 * V450 — NOOP-Retry vs. V445 geometry-coherence guard.
 *
 * Two existing contracts collided:
 *
 *  - v404/v407 (NOOP retry): a NOOP escalation MUST reuse the EXACT same
 *    preclip, audio and Contract-E bounding box. Re-rendering a preclip is
 *    therefore forbidden while `noop_auto_escalation` is true.
 *  - V445 (geometry coherence): a cached preclip whose crop signature does not
 *    match the FINAL dispatch face box is dropped so it gets re-rendered.
 *
 * On a NOOP retry V445 dropped the preclip and the re-render was blocked in
 * the same run → deterministic `v204_preclip_required` hard fail for every
 * multi-speaker scene that ever escalates.
 *
 * Rule (V450):
 *   fresh dispatch  → current V445 geometry is the authority.
 *   NOOP retry      → the frozen wire snapshot is the authority; a geometry
 *                     drift is telemetry only.
 *
 * Everything here is PURE — no IO, no DB, no provider calls.
 */

export interface V450DropDecision {
  /** True when the cached preclip must be dropped (fresh-dispatch behaviour). */
  drop: boolean;
  /** Stable telemetry tag for the log line. */
  tag: "v445_cached_crop_geometry_mismatch" | "v450_noop_retry_geometry_drift_ignored" | "coherent";
}

/**
 * PURE. Decides what to do with a cached preclip whose crop signature differs
 * from the final dispatch box signature.
 */
export function decideCachedPreclipDrop(input: {
  hasCachedPreclip: boolean;
  cachedBoxSig: string | null;
  finalBoxSig: string | null;
  noopAutoEscalation: boolean;
}): V450DropDecision {
  if (!input.hasCachedPreclip || !input.finalBoxSig) return { drop: false, tag: "coherent" };
  if (input.cachedBoxSig === input.finalBoxSig) return { drop: false, tag: "coherent" };
  // V450 §1 — never invalidate the frozen wire of a NOOP retry.
  if (input.noopAutoEscalation === true) {
    return { drop: false, tag: "v450_noop_retry_geometry_drift_ignored" };
  }
  return { drop: true, tag: "v445_cached_crop_geometry_mismatch" };
}

/** Parses `<uid>/v434/<scene>/run-<run>/gen-<n>/pass-<n>/<kind>-a<n>.<ext>`. */
export function parseImmutableArtifactKey(key: unknown): {
  sceneId: string;
  runId: string;
  generation: number;
  passIdx: number;
  kind: string;
} | null {
  const m = /\/v434\/([^/]+)\/run-([^/]+)\/gen-(\d+)\/pass-(\d+)\/([a-z0-9-]+)-a\d+\.[a-z0-9]+$/.exec(
    String(key ?? ""),
  );
  if (!m) return null;
  return {
    sceneId: m[1],
    runId: m[2],
    generation: Number(m[3]),
    passIdx: Number(m[4]),
    kind: m[5],
  };
}

export interface V450RecoveryInput {
  noopAutoEscalation: boolean;
  sceneId: string;
  runId: string | null | undefined;
  generation: number | null | undefined;
  passIdx: number;
  /** `_v434_preclip_pin` of the pass, if any. */
  pin: { key?: unknown; url?: unknown } | null | undefined;
  /** Frozen crop snapshot written when the preclip was produced. */
  frozenCrop: unknown;
}

export type V450RecoveryResult =
  | { ok: true; url: string; crop: unknown; source: "v434_pin" }
  | { ok: false; reason: string };

/**
 * PURE. V450 §2 — recovery of a lost preclip is only allowed when the frozen
 * snapshot is fully provable: same run, same plate generation, same pass AND a
 * reconstructible crop geometry. A bare MP4 URL without its crop is NOT
 * sufficient — the caller must then stay fail-closed (`v204_preclip_required`).
 */
export function recoverFrozenPreclip(input: V450RecoveryInput): V450RecoveryResult {
  if (input.noopAutoEscalation !== true) return { ok: false, reason: "not_a_noop_retry" };

  const url = typeof input.pin?.url === "string" ? input.pin.url : "";
  const parsed = parseImmutableArtifactKey(input.pin?.key);
  if (!url || !parsed) return { ok: false, reason: "no_immutable_pin" };
  if (parsed.kind !== "preclip") return { ok: false, reason: "pin_kind_mismatch" };
  if (parsed.sceneId !== input.sceneId) return { ok: false, reason: "scene_mismatch" };

  const runId = String(input.runId ?? "");
  if (!runId || parsed.runId !== runId) return { ok: false, reason: "run_id_mismatch" };

  const generation = Number(input.generation ?? Number.NaN);
  if (!Number.isFinite(generation) || parsed.generation !== generation) {
    return { ok: false, reason: "plate_generation_mismatch" };
  }
  if (parsed.passIdx !== input.passIdx) return { ok: false, reason: "pass_mismatch" };

  const crop = input.frozenCrop;
  if (!crop || typeof crop !== "object") return { ok: false, reason: "crop_not_reconstructible" };

  return { ok: true, url, crop, source: "v434_pin" };
}
