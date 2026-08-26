/**
 * V510-P0 — MONOTONIC TERMINALIZATION (PURE)
 * ---------------------------------------------------------------------------
 * Production incident, scene 67b392b1, generation 10, run 58a103cc:
 *
 *   passes 0/2/3 dispatched (HTTP 201) and wrote their job ids per slot;
 *   pass 4 failed pre-dispatch and wrote its stale local `passes[]` snapshot
 *   back wholesale, erasing passes[2].job_id (cf76aa2c) and passes[3].job_id
 *   (0fba3717); pass 1 — long past the early fanout fence — then dispatched
 *   and reset the root to `running` with `clip_error: null`, resurrecting a
 *   run that had already terminalized AND refunded.
 *
 * This module holds the PURE decision logic that mirrors the two new RPCs
 * (`composer_terminalize_dialog_run`, `composer_touch_dialog_run_progress`).
 * The authoritative decision is taken inside the row lock in SQL — a
 * caller-side SELECT followed by UPDATE would reintroduce the very race this
 * closes. What lives here is the same rule in testable form, plus the patch
 * builders that make it impossible to hand a whole `passes` array to a write.
 */

export const V510_VERSION = "v510";

/** Where the run-scoped terminal marker lives inside `dialog_shots`. */
export const V510_TERMINAL_KEY = "v510_terminal";

export interface V510TerminalMarker {
  run_id?: string | null;
  reason?: string | null;
  pass_idx?: number | null;
  at?: string | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** PURE — the run-scoped terminal marker, when present and well-formed. */
export function readTerminalMarker(
  dialogShots: unknown,
): V510TerminalMarker | null {
  if (!dialogShots || typeof dialogShots !== "object") return null;
  const m = (dialogShots as Record<string, unknown>)[V510_TERMINAL_KEY];
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  return m as V510TerminalMarker;
}

/**
 * PURE — is THIS run terminal?
 *
 * Run-scoped on purpose. A genuinely new run carries a new id and is never
 * blocked by a previous run's marker, so a user-authorized fresh attempt
 * needs no separate unblock path. An empty/unknown run id never blocks —
 * failing open here is right: the alternative would wedge every scene whose
 * run identity is missing.
 */
export function isRunTerminal(dialogShots: unknown, runId: string | null | undefined): boolean {
  const marker = readTerminalMarker(dialogShots);
  if (!marker) return false;
  const mine = str(runId);
  if (!mine) return false;
  return str(marker.run_id) === mine;
}

/**
 * PURE — may this invocation still call the provider?
 *
 * Used by the LATE fence, immediately before the provider request. The early
 * V459 fence stays where it is; it saves work. This one prevents payment: in
 * generation 10 the two were ~3800 lines and many awaits apart, and a sibling
 * terminalized in between.
 */
export function mayDispatchProvider(input: {
  dialogShots: unknown;
  runId: string | null | undefined;
  fanoutClosed?: boolean;
}): { ok: boolean; reason: string | null } {
  if (input?.fanoutClosed === true) return { ok: false, reason: "v459_fanout_closed" };
  if (isRunTerminal(input?.dialogShots, input?.runId)) {
    return { ok: false, reason: "v510_run_terminal" };
  }
  return { ok: true, reason: null };
}

/**
 * PURE — the patch for the FAILING pass's own slot.
 *
 * Deliberately narrow. It carries failure state and diagnostics and nothing
 * else; it can never contain another slot, and `job_id` / `pipeline_job_id` /
 * `output_url` are absent so a failure cannot erase transport pointers the
 * slot may already hold (the RPC merges, it does not replace).
 */
export function buildTerminalPassPatch(input: {
  reason: string;
  errorClass: string;
  finishedAt?: string | null;
  diagnostics?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: "failed",
    error: input.reason,
    last_error: input.reason,
    last_error_class: input.errorClass,
    sync_error_bucket: input.errorClass,
    finished_at: input.finishedAt ?? new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(input.diagnostics ?? {})) {
    if (k === "passes" || k === V510_TERMINAL_KEY) continue;
    patch[k] = v;
  }
  return patch;
}

/**
 * PURE — guard for every root-level patch that leaves this function.
 *
 * `passes` in a root patch is the whole defect in one key. The SQL strips it
 * defensively too; this makes the mistake visible at the call site instead of
 * silently succeeding.
 */
export function assertRootPatchSafe(patch: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k === "passes") {
      throw new Error("v510_root_patch_must_not_contain_passes");
    }
    if (k === V510_TERMINAL_KEY) continue; // the RPC owns the marker
    out[k] = v;
  }
  return out;
}

/**
 * PURE — mirror of the RPC's own-slot merge, for tests.
 *
 * Proves the property the incident violated: applying a terminal patch to one
 * slot leaves every sibling slot byte-identical.
 */
export function applyTerminalSlot(
  passes: Array<Record<string, unknown>>,
  passIdx: number,
  passPatch: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const arr = Array.isArray(passes) ? passes.map((p) => ({ ...p })) : [];
  while (arr.length <= passIdx) arr.push({ idx: arr.length, status: "pending", slot_padded: true });
  const slot = { ...(arr[passIdx] ?? {}), ...passPatch, idx: passIdx };
  delete (slot as Record<string, unknown>).slot_padded;
  arr[passIdx] = slot;
  return arr;
}
