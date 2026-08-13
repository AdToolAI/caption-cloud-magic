// ============================================================================
// _shared/visual-source.ts — v430 Step 3, backend mirror of
// `src/lib/composer/visualInputs/visualSource.ts`.
//
// CONTRACT:
//  - `visual_source` is a STRATEGY only. Never an asset URL, never a
//    replacement for `reference_image_url` / `continuity_source_scene_id`.
//  - `null` = legacy / unmigrated scene → pre-v430 arbitration, unchanged.
//    `null` is NOT `auto`; `auto` is an explicitly chosen automatic strategy.
//  - Strictly pure. Persists nothing. The only writer is the UI action.
//  - Invalid combinations resolve deterministically and report
//    `requested !== effective` instead of rewriting the user's choice.
//
// Kept in lockstep with the client module by a parity test.
// ============================================================================

import type { VisualInputProfile } from "./visual-inputs.ts";

export const VISUAL_SOURCE_STRATEGIES = [
  "auto",
  "character_anchor",
  "previous_final_frame",
  "uploaded_reference",
  "generated_still",
] as const;

export type VisualSourceStrategy = (typeof VISUAL_SOURCE_STRATEGIES)[number];

/** `null` = legacy/unmigrated scene. Semantically distinct from `'auto'`. */
export type PersistedVisualSource = VisualSourceStrategy | null;

export type VisualSourceOverrideReason =
  | "lipsync_continuity_disabled"
  | "provider_slot_unsupported"
  | "no_previous_scene"
  | "no_anchor_image";

export interface VisualSourceDecision {
  requested: PersistedVisualSource;
  effective: VisualSourceStrategy;
  overridden: boolean;
  reason?: VisualSourceOverrideReason;
}

export function isVisualSourceStrategy(value: unknown): value is VisualSourceStrategy {
  return typeof value === "string" &&
    (VISUAL_SOURCE_STRATEGIES as readonly string[]).includes(value);
}

export function parseVisualSource(value: unknown): PersistedVisualSource {
  return isVisualSourceStrategy(value) ? value : null;
}

export function isLegacyVisualSource(value: PersistedVisualSource): boolean {
  return value === null;
}

export interface VisualSourceContext {
  profile: VisualInputProfile;
  lipSync: boolean;
  hasAnchorImage: boolean;
  hasPreviousFrame: boolean;
  hasPreviousClip: boolean;
}

function providerCanChainPreviousScene(profile: VisualInputProfile): boolean {
  if (profile.firstFrame.supported) return true;
  const canTakeVideoReference = (profile.references.videos ?? 0) > 0 &&
    (profile.mode !== "exclusive" || (profile.modes ?? []).includes("references"));
  return canTakeVideoReference;
}

export function resolveVisualSource(
  requested: PersistedVisualSource,
  ctx: VisualSourceContext,
): VisualSourceDecision {
  if (requested === null) {
    return { requested: null, effective: "auto", overridden: false };
  }

  const keep = (): VisualSourceDecision => ({
    requested,
    effective: requested,
    overridden: false,
  });
  const override = (
    effective: VisualSourceStrategy,
    reason: VisualSourceOverrideReason,
  ): VisualSourceDecision => ({ requested, effective, overridden: true, reason });

  if (requested === "previous_final_frame") {
    if (ctx.lipSync) return override("character_anchor", "lipsync_continuity_disabled");
    if (!ctx.hasPreviousFrame && !ctx.hasPreviousClip) {
      return override(ctx.hasAnchorImage ? "character_anchor" : "auto", "no_previous_scene");
    }
    if (!providerCanChainPreviousScene(ctx.profile)) {
      return override(
        ctx.hasAnchorImage ? "character_anchor" : "auto",
        "provider_slot_unsupported",
      );
    }
    return keep();
  }

  if (
    requested === "character_anchor" ||
    requested === "uploaded_reference" ||
    requested === "generated_still"
  ) {
    if (!ctx.hasAnchorImage) return override("auto", "no_anchor_image");
    return keep();
  }

  return keep();
}

export function continuityPreferenceForSource(
  effective: VisualSourceStrategy,
): "auto" | "seamless" | "identity" {
  switch (effective) {
    case "previous_final_frame":
      return "seamless";
    case "character_anchor":
    case "uploaded_reference":
    case "generated_still":
      return "identity";
    default:
      return "auto";
  }
}
