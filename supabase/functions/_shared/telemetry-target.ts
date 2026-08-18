/**
 * FA-4 v404 P1-B — PURE telemetry target resolution.
 *
 * `report-lipsync-motion-probe` may only ever write telemetry to ONE exact
 * dispatch row. This helper decides which row that is, fail-closed:
 *
 *   - the caller must already have validated scene_id + job_id + pass_idx
 *     and matched the reported job_id against the immutable pass slot
 *   - exactly one candidate  → that row
 *   - several candidates     → narrow by the persisted pass identity
 *                              (`turn_idx`); still not unique → NO write
 *   - zero candidates        → NO write
 *
 * There is deliberately no "update by scene_id" fallback: a bulk update is
 * treated as a contract violation, not as a best-effort convenience.
 */

export interface DispatchLogCandidate {
  id: string;
  turn_idx?: number | null;
}

export type TelemetryTarget =
  | { ok: true; id: string }
  | { ok: false; reason: "no_candidate" | "ambiguous" };

export function resolveTelemetryTarget(
  candidates: DispatchLogCandidate[] | null | undefined,
  passIdx: number,
): TelemetryTarget {
  const rows = Array.isArray(candidates) ? candidates.filter((r) => !!r && !!r.id) : [];
  if (rows.length === 0) return { ok: false, reason: "no_candidate" };
  if (rows.length === 1) return { ok: true, id: rows[0].id };
  const narrowed = rows.filter((r) => Number(r.turn_idx) === Number(passIdx));
  if (narrowed.length === 1) return { ok: true, id: narrowed[0].id };
  return { ok: false, reason: "ambiguous" };
}
