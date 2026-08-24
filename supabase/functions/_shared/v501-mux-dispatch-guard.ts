/**
 * V501 — Audio-Mux Dispatch-Guard.
 *
 * Belegter Ausfall (Szene be60d106…, 2026-08-24): alle 6 Lip-Sync-Pässe
 * `done`, Ledger-Zeile `audio_mux` angelegt, aber `render-sync-segments-audio-mux`
 * wurde nie aufgerufen (0 Invocations). `dialog_shots.audio_mux` enthielt nur
 * `mux_dispatch_requested_at` — kein `render_id`, kein `dispatched_at`.
 *
 * Der bestehende v252-Stall-Guard greift ausschließlich bei gesetztem
 * `dispatched_at`. Genau der Zustand „reserviert, nie abgeschickt" war damit
 * unbewacht: kein Fehler, kein Refund, unbegrenztes Hängen.
 *
 * Diese Datei enthält die reine Entscheidungsfunktion, damit sie ohne DB
 * getestet werden kann.
 */

export interface MuxDispatchState {
  lipSyncStatus: string | null | undefined;
  audioMux: {
    mux_dispatch_requested_at?: string | null;
    dispatched_at?: string | null;
    render_id?: string | null;
  } | null | undefined;
  nowMs: number;
}

export type MuxDispatchVerdict =
  /** Nichts zu tun (nicht im Mux, oder Dispatch bestätigt und frisch). */
  | { action: "none"; reason: string }
  /** Reserviert, aber nie abgeschickt — genau ein Re-Dispatch. */
  | { action: "redispatch"; ageMs: number }
  /** Auch nach dem Re-Dispatch kein Render — terminal + Refund. */
  | { action: "hard_fail"; ageMs: number; reason: "audio_mux_dispatch_lost" }
  /** Abgeschickt, aber kein Webhook — bestehender v252-Pfad. */
  | { action: "v252_stall"; ageMs: number };

export const MUX_REDISPATCH_MS = 90_000;
export const MUX_DISPATCH_LOST_MS = 6 * 60_000;

export function classifyMuxDispatch(state: MuxDispatchState): MuxDispatchVerdict {
  if (state.lipSyncStatus !== "audio_muxing") {
    return { action: "none", reason: "not_muxing" };
  }
  const mux = state.audioMux ?? {};
  const dispatchedAt = mux.dispatched_at ? Date.parse(String(mux.dispatched_at)) : null;
  const hasRender = typeof mux.render_id === "string" && mux.render_id.length > 0;

  if (dispatchedAt || hasRender) {
    if (!dispatchedAt) return { action: "none", reason: "render_id_without_dispatch_ts" };
    const age = state.nowMs - dispatchedAt;
    return age >= MUX_DISPATCH_LOST_MS
      ? { action: "v252_stall", ageMs: age }
      : { action: "none", reason: "dispatched_fresh" };
  }

  const requestedAt = mux.mux_dispatch_requested_at
    ? Date.parse(String(mux.mux_dispatch_requested_at))
    : null;
  if (!requestedAt || Number.isNaN(requestedAt)) {
    return { action: "none", reason: "no_mux_claim" };
  }
  const age = state.nowMs - requestedAt;
  if (age >= MUX_DISPATCH_LOST_MS) {
    return { action: "hard_fail", ageMs: age, reason: "audio_mux_dispatch_lost" };
  }
  if (age >= MUX_REDISPATCH_MS) {
    return { action: "redispatch", ageMs: age };
  }
  return { action: "none", reason: "claim_fresh" };
}
