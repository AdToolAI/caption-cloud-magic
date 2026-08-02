/**
 * v317 — Terminal clip-failure detection.
 *
 * A master clip that was rejected by a provider content filter (Alibaba
 * "Green Net" on HappyHorse, ByteDance E005 on Seedance, …) or that already
 * burnt its render retries must NOT be silently reset to `clip_status:
 * 'pending'` by a downstream lip-sync gate. Doing so re-queues the same
 * prompt, it fails again, and the UI ping-pongs between "Szene wird gebaut"
 * and "Lip-Sync abgebrochen" forever.
 *
 * Instead we keep the scene terminally `failed` with an actionable message so
 * the user can edit the prompt and re-render deliberately.
 */

export const CONTENT_FILTER_MARKERS: readonly string[] = [
  "green_net_rejected",
  "HappyHorse-Inhaltsfilter",
  "content filter",
  "content_filter",
  "flagged as sensitive",
  "sensitive",
  "E005",
  "moderation",
  "nsfw",
];

export const MAX_CLIP_RENDER_RETRIES = 2;

export function isContentFilterError(clipError: unknown): boolean {
  if (typeof clipError !== "string" || clipError.length === 0) return false;
  const lc = clipError.toLowerCase();
  return CONTENT_FILTER_MARKERS.some((m) => lc.includes(m.toLowerCase()));
}

/**
 * True when a scene must not be re-queued for another automatic clip render.
 */
export function isTerminalClipFailure(scene: {
  clip_error?: unknown;
  retry_count?: unknown;
}): boolean {
  if (isContentFilterError(scene?.clip_error)) return true;
  const rc = Number(scene?.retry_count ?? 0);
  return Number.isFinite(rc) && rc >= MAX_CLIP_RENDER_RETRIES;
}

export const TERMINAL_CLIP_FAILURE_MESSAGE =
  "Szene wurde vom Inhaltsfilter des Video-Anbieters blockiert bzw. hat die maximale Anzahl an Render-Versuchen erreicht. " +
  "Lip-Sync wurde nicht gestartet und es wurden keine Credits verbraucht. " +
  "Bitte den Szenentext anpassen und die Szene erneut rendern.";

/**
 * v385 — Zielzustand für ein Lip-Sync-Gate, das den Clip neu rendern will.
 * `failed` wenn die Szene ihre Versuche verbraucht hat, sonst `idle`
 * (bereit für einen frischen, vom Benutzer ausgelösten Lauf).
 */
export function clipRerenderTargetState(
  scene: { clip_error?: unknown; retry_count?: unknown } | null | undefined,
): "failed" | "idle" {
  return scene && isTerminalClipFailure(scene) ? "failed" : "idle";
}

/**
 * Build the DB patch for a lip-sync gate that wants the clip re-rendered.
 *
 * v385: enthält KEINE Legacy-Statusspalten mehr (`clip_status`,
 * `twoshot_stage`, `lip_sync_status`) — der Zustand wird über
 * `pipeline_state` gesetzt und vom Bridge-Trigger gespiegelt.
 */
export function buildClipRerenderPatch(
  scene: { clip_error?: unknown; retry_count?: unknown } | null | undefined,
  friendlyMessage: string,
): Record<string, unknown> {
  if (scene && isTerminalClipFailure(scene)) {
    return {
      pipeline_state: "failed",
      clip_url: null,
      lip_sync_source_clip_url: null,
      clip_error: `${TERMINAL_CLIP_FAILURE_MESSAGE} (Grund: ${String(scene.clip_error ?? friendlyMessage).slice(0, 200)})`,
    };
  }
  return {
    pipeline_state: "idle",
    clip_url: null,
    lip_sync_source_clip_url: null,
    clip_error: friendlyMessage,
  };
}

