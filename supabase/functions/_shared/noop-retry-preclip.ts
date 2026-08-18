/**
 * FA-4 v404 §9 — v148 / v204 Preclip-Konflikt.
 *
 * PURE predicate. The frozen v404 NOOP-retry wire is:
 *
 *   sync-3 + EXACT same single-face preclip + EXACT same audio
 *   + EXACT same transformed Contract-E bounding box
 *   + ASD transport: inline `bounding_boxes` (instead of `bounding_boxes_url`)
 *
 * The historical v148 bypass dropped `preclip_url` / `preclip_crop` on
 * `noop_auto_escalation`, which (a) changed more than the ASD transport and
 * (b) collided with the v204 multi-speaker preclip requirement (fail-closed).
 *
 * The preclip is therefore ALWAYS preserved on a NOOP escalation. This helper
 * exists so the invariant is unit-testable without booting the edge function.
 */
export interface NoopRetryPreclipInput {
  noopAutoEscalation: boolean;
  requestedRetryVariant: string | null | undefined;
  hasPreclipUrl: boolean;
}

/** True when this dispatch is a NOOP escalation that must keep its preclip. */
export function shouldPreserveNoopRetryPreclip(input: NoopRetryPreclipInput): boolean {
  return input.noopAutoEscalation === true &&
    (input.requestedRetryVariant === "coords-pro-box" ||
      input.requestedRetryVariant === "bbox-url-pro") &&
    input.hasPreclipUrl === true;
}

/**
 * v404 invariant: a NOOP escalation must NEVER clear preclip state.
 * Returns the pass preclip fields unchanged — kept as an explicit,
 * testable identity so a future regression has to delete this function.
 */
export function applyNoopRetryPreclipPolicy<
  T extends { preclip_url?: unknown; preclip_render_id?: unknown; preclip_crop?: unknown },
>(pass: T, _input: NoopRetryPreclipInput): T {
  return pass;
}
