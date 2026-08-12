/**
 * v427B — Money contract (upper-bound reservation → exact settlement).
 *
 * Rule from the run contract: "Kein bezahlter Auftrag ohne Reservierung."
 * Before a single provider job is dispatched we reserve the MAXIMUM the run
 * could ever cost (the provider window ceiling, because a voiceover may still
 * extend a scene). After dispatch we reduce the reservation to the amount
 * actually owed; the difference flows straight back to the wallet.
 *
 * Everything here is flag-gated by `v427.credit_reservations`. With the flag
 * off the caller keeps its legacy post-hoc `deduct_ai_video_credits` path and
 * this module is never entered. It touches no lip-sync state whatsoever.
 */

import { getProviderWindow } from "./v427-duration-contract.ts";
import { CLIP_COSTS } from "./clip-costs.ts";

export type BillableScene = {
  id: string;
  clipSource: string;
  clipQuality?: string | null;
  durationSeconds: number;
};

export function costPerSecond(source: string, quality?: string | null): number {
  const q = quality === "pro" ? "pro" : "standard";
  return CLIP_COSTS[source]?.[q] ?? 0.15;
}

/**
 * Ceiling seconds a scene can still grow to: the provider's window maximum,
 * never below what the user already requested. Unknown providers cannot grow.
 */
export function ceilingSeconds(scene: BillableScene): number {
  const win = getProviderWindow(scene.clipSource);
  const requested = Math.max(0, Number(scene.durationSeconds) || 0);
  if (!win) return requested;
  return Math.max(requested, win.maxMs / 1000);
}

/** Upper bound for the whole run — what we reserve up front. */
export function maxRunCostEuros(scenes: BillableScene[]): number {
  let total = 0;
  for (const s of scenes) {
    if (!s.clipSource?.startsWith("ai-")) continue;
    total += ceilingSeconds(s) * costPerSecond(s.clipSource, s.clipQuality);
  }
  return Math.round(total * 100) / 100;
}

export type ReservationHandle = { reservationId: string; reservedEuros: number };

export class InsufficientCreditsError extends Error {
  readonly required: number;
  constructor(required: number) {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
    this.required = required;
  }
}

/** Atomic wallet debit + reservation row. Throws when the wallet cannot cover it. */
export async function reserveRunCredits(
  admin: any,
  params: {
    userId: string;
    projectId?: string | null;
    sceneIds: string[];
    runIds?: string[];
    amountEuros: number;
    metadata?: Record<string, unknown>;
  },
): Promise<ReservationHandle | null> {
  const amount = Math.round(Math.max(0, params.amountEuros) * 100) / 100;
  if (amount <= 0) return null;

  const { data, error } = await admin.rpc("composer_reserve_run_credits", {
    p_user_id: params.userId,
    p_amount: amount,
    p_project_id: params.projectId ?? null,
    p_scene_ids: params.sceneIds,
    p_run_ids: params.runIds ?? [],
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    const msg = String((error as any)?.message ?? error);
    if (msg.includes("insufficient_credits")) throw new InsufficientCreditsError(amount);
    throw new Error(`reservation_failed: ${msg.slice(0, 200)}`);
  }
  const reservationId = typeof data === "string" ? data : (data as any)?.id;
  if (!reservationId) throw new Error("reservation_failed: no id returned");
  return { reservationId, reservedEuros: amount };
}

/** Reduce to the amount actually owed; the rest is refunded. Idempotent. */
export async function settleRunReservation(
  admin: any,
  reservationId: string,
  actualEuros: number,
): Promise<void> {
  const actual = Math.round(Math.max(0, actualEuros) * 100) / 100;
  const { error } = await admin.rpc("composer_settle_run_reservation", {
    p_reservation_id: reservationId,
    p_actual: actual,
  });
  if (error) {
    console.error("[v427] settle reservation failed:", (error as any)?.message ?? error);
  }
}

/** Nothing was dispatched — give everything back. Idempotent. */
export async function releaseRunReservation(
  admin: any,
  reservationId: string,
  reason?: string,
): Promise<void> {
  const { error } = await admin.rpc("composer_release_run_reservation", {
    p_reservation_id: reservationId,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error("[v427] release reservation failed:", (error as any)?.message ?? error);
  }
}

/**
 * Mirror the run's money + duration contract into `composer_scene_runs`.
 * Best-effort telemetry: a failure here must never affect a running job.
 */
export async function recordSceneRunContracts(
  admin: any,
  rows: Array<{
    sceneId: string;
    runId: string;
    requestedDurationMs: number;
    quotedCostEuros: number;
    reservationId?: string | null;
    metadata?: Record<string, unknown>;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await admin.from("composer_scene_runs").upsert(
      rows.map((r) => ({
        run_id: r.runId,
        scene_id: r.sceneId,
        status: "dispatched",
        requested_duration_ms: r.requestedDurationMs,
        quoted_cost_euros: r.quotedCostEuros,
        reservation_id: r.reservationId ?? null,
        duration_policy_version: "v427",
        metadata: r.metadata ?? {},
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "run_id" },
    );
  } catch (e) {
    console.warn("[v427] recordSceneRunContracts failed (non-fatal):", e);
  }
}
