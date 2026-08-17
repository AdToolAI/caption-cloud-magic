/**
 * FA-4/P1-A — Provenance-based refund resolver (caller side).
 *
 * The RPC `composer_refund_charge` stays the trust boundary and re-verifies
 * everything DB-side. This module only performs candidate discovery using the
 * SAME provenance rule, so the caller never proposes a charge the RPC would
 * reject for a different reason than "no provenance".
 */

export interface ChargeRow {
  id: string;
  user_id: string;
  type: string;
  amount_euros: number | string;
  generation_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ReservationRow {
  id: string;
  run_ids: string[] | null;
}

export type RefundOutcome = "no_charge" | "already_refunded" | "refunded";

export interface RefundResult {
  outcome: RefundOutcome;
  amount_euros: number;
  refund_transaction_id?: string | null;
}

/** Identical provenance rule as the RPC. */
export function chargeMatchesRun(
  charge: ChargeRow,
  runId: string,
  reservations: ReservationRow[] = [],
): boolean {
  if (charge.type !== "deduction") return false;
  if (charge.generation_id && charge.generation_id === runId) return true;

  const meta = charge.metadata ?? {};
  const metaRun = meta["run_id"];
  if (typeof metaRun === "string" && metaRun === runId) return true;

  const reservationId = meta["reservation_id"];
  if (typeof reservationId === "string" && reservationId) {
    return reservations.some(
      (r) => r.id === reservationId && (r.run_ids ?? []).includes(runId),
    );
  }
  return false;
}

/**
 * Exactly one run-scoped candidate → its id. None or ambiguous → null
 * (caller then reports `no_charge` and never calls the RPC).
 */
export function resolveRefundCandidate(
  charges: ChargeRow[],
  runId: string | null | undefined,
  reservations: ReservationRow[] = [],
): string | null {
  if (!runId) return null;
  const matches = charges.filter((c) => chargeMatchesRun(c, runId, reservations));
  return matches.length === 1 ? matches[0].id : null;
}

export const NO_CHARGE: RefundResult = {
  outcome: "no_charge",
  amount_euros: 0,
  refund_transaction_id: null,
};

interface MinimalClient {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}

/**
 * Watchdog entry point: resolve run → charge → single RPC call.
 * Never throws; a failure is reported as `no_charge` so scene terminalization
 * stays independent of the refund path.
 */
export async function refundRunCharge(
  sb: MinimalClient,
  userId: string,
  runId: string | null | undefined,
  reason: string,
): Promise<RefundResult> {
  if (!runId || !reason.trim()) return NO_CHARGE;

  try {
    const { data: charges } = await sb
      .from("ai_video_transactions")
      .select("id, user_id, type, amount_euros, generation_id, metadata")
      .eq("user_id", userId)
      .eq("type", "deduction")
      .order("created_at", { ascending: false })
      .limit(200);

    const rows: ChargeRow[] = Array.isArray(charges) ? charges : [];
    if (rows.length === 0) return NO_CHARGE;

    const reservationIds = rows
      .map((r) => (r.metadata ?? {})["reservation_id"])
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    let reservations: ReservationRow[] = [];
    if (reservationIds.length > 0) {
      const { data: res } = await sb
        .from("composer_run_reservations")
        .select("id, run_ids")
        .in("id", Array.from(new Set(reservationIds)));
      reservations = Array.isArray(res) ? res : [];
    }

    const chargeId = resolveRefundCandidate(rows, runId, reservations);
    if (!chargeId) return NO_CHARGE;

    const { data, error } = await sb.rpc("composer_refund_charge", {
      p_charge_id: chargeId,
      p_run_id: runId,
      p_refund_reason: reason,
    });
    if (error || !data) return NO_CHARGE;

    return {
      outcome: (data.outcome ?? "no_charge") as RefundOutcome,
      amount_euros: Number(data.amount_euros ?? 0),
      refund_transaction_id: data.refund_transaction_id ?? null,
    };
  } catch (err) {
    console.error("[refund-provenance] refundRunCharge failed", err);
    return NO_CHARGE;
  }
}
