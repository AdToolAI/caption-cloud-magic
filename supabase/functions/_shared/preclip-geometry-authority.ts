/**
 * V510-P1 — CONTRACT-E GEOMETRY AUTHORITY
 * ---------------------------------------------------------------------------
 * One box, named once, used by everything downstream.
 *
 * The architecture contract is IDENTITY = STATIC, GEOMETRY = DYNAMIC. The
 * preclip planner already honours it: when a turn was actually measured,
 * `pass-face-preclip` builds its containment target from the track union
 * (`v461ContainSource === "turn_track"`) and proves the final integer crop
 * contains THAT box. Contract E then re-derived a target of its own from the
 * static assignment bbox and tested the same crop against it.
 *
 * Two correct answers about two different boxes:
 *
 *   Generation 10, Matthew, pass 4
 *     planner target   [474,528,541,602]   inside crop [446,528,550,632]  ✓
 *     static target    [465,522,517,588]   top 522 < 528                  ✗
 *
 *   Generation 11, Sarah, pass 0
 *     planner target   [230,103,387,321]   inside crop [201,103,473,375]  ✓
 *     static target    [227, 99,368,293]   top  99 < 103                  ✗
 *
 * Both runs terminalized on `preclip_identity_geometry_mismatch` while the
 * rendered crop did contain the tracked face. The gate arithmetic was right;
 * its referent was not — the fourth time this pipeline has produced a correct
 * verdict about the wrong object.
 *
 * This module removes the second derivation. It does not loosen anything: no
 * tolerance, no padding, no threshold. The gate simply judges the box the
 * planner proved, and when there is no track it judges exactly what it judged
 * before.
 */

export type Box = [number, number, number, number];

/** Which measurement the planner actually used for its containment target. */
export type PlannerContainSource = "turn_track" | "anchor";

/** Which measurement Contract E ends up judging. Telemetry-visible. */
export type ContractEGeometrySource = "track_planner" | "static_anchor";

export interface ContainmentAuthority {
  /** The box Contract E must test, and the box V464 must anchor on. */
  targetBox: Box;
  source: ContractEGeometrySource;
  /** The planner's own target, for the equality assertion. Null if absent. */
  plannerContainBox: Box | null;
  /** The static assignment-derived dispatch box, always retained. */
  staticDispatchBox: Box;
  /**
   * True when the box Contract E tests IS the box the planner proved. False
   * only in the static regime, where the planner had no track to prove.
   */
  authorityMatch: boolean;
  /** Why the static box was kept, when it was. */
  fallbackReason:
    | null
    | "planner_used_anchor"
    | "no_planner_contain_box"
    | "planner_contain_box_invalid";
}

const isBox = (b: unknown): b is Box =>
  Array.isArray(b) && b.length === 4 &&
  b.every((n) => Number.isFinite(Number(n))) &&
  Number(b[2]) > Number(b[0]) && Number(b[3]) > Number(b[1]);

const asBox = (b: Box): Box => [Number(b[0]), Number(b[1]), Number(b[2]), Number(b[3])];

/**
 * PURE — resolve the single containment authority for this pass.
 *
 * Authority follows the planner's ACTUAL selected source, never the mere
 * existence of a track array. A pass where a track was measured but the
 * planner still targeted the anchor stays on the anchor: the planner is the
 * one that proved containment, so it is the one that decides what was proved.
 */
export function resolvePreclipContainmentAuthority(input: {
  plannerContainBox: Box | null | undefined;
  plannerContainSource: PlannerContainSource | null | undefined;
  staticDispatchBox: Box;
}): ContainmentAuthority {
  const staticDispatchBox = asBox(input.staticDispatchBox);
  const planner = isBox(input.plannerContainBox) ? asBox(input.plannerContainBox) : null;

  const stat = (
    fallbackReason: ContainmentAuthority["fallbackReason"],
  ): ContainmentAuthority => ({
    targetBox: staticDispatchBox,
    source: "static_anchor",
    plannerContainBox: planner,
    staticDispatchBox,
    authorityMatch: false,
    fallbackReason,
  });

  if (input.plannerContainSource !== "turn_track") return stat("planner_used_anchor");
  if (input.plannerContainBox == null) return stat("no_planner_contain_box");
  if (!planner) return stat("planner_contain_box_invalid");

  return {
    targetBox: planner,
    source: "track_planner",
    plannerContainBox: planner,
    staticDispatchBox,
    authorityMatch: true,
    fallbackReason: null,
  };
}

/**
 * PURE — bounded telemetry for the pass record.
 *
 * Deliberately small and URL-free: the boxes, the source, and the one
 * invariant that matters — that the box the planner proved contained is the
 * box Contract E tested.
 */
export function buildGeometryAuthorityTelemetry(a: ContainmentAuthority): Record<string, unknown> {
  return {
    contract_e_geometry_source: a.source,
    contract_e_target_box: a.targetBox,
    planner_contain_box: a.plannerContainBox,
    static_dispatch_box: a.staticDispatchBox,
    authority_match: a.authorityMatch,
    fallback_reason: a.fallbackReason,
    /**
     * In the static regime the planner's own target is normally the padded
     * static bbox, i.e. identical to the static dispatch box. It is not
     * asserted — the two are built from the same helper but by different
     * callers — so a divergence is reported rather than assumed away.
     */
    static_regime_boxes_agree: a.source === "static_anchor" && a.plannerContainBox
      ? a.plannerContainBox.every((v, i) => v === a.staticDispatchBox[i])
      : null,
  };
}
