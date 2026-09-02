/**
 * V538 A — PLATE RESOLUTION CONTRACT FOR LIP-SYNC (v400 T4 restored)
 * ---------------------------------------------------------------------------
 * v400 T4 requires a MINIMUM of 1080p for any plate that will be cut into
 * per-speaker pre-clips, with an explicit justification: below that, faces are
 * too small for the pre-clip.
 *
 * Production evidence (scene 7aa7fc93, 4 speakers): the plate rendered at the
 * `standard` quality tier, i.e. 720p at 9:16 → stills measured 656 x 1406 px.
 * With four people in frame each face occupies a few dozen pixels, so the V461
 * floors (`face_share >= 0.24`, `face_size_provider_px >= 144`) are not merely
 * missed — they are arithmetically unreachable. The pass terminalized on
 * `dynamic_mouth_crop_infeasible` twenty seconds after fanout, before any
 * provider job existed.
 *
 * Single-speaker scenes keep working at 720p because one face fills the frame.
 * That is why this contract is scoped to `speakerCount >= 2`.
 *
 * SCOPE — this module decides ONE thing: the raster the PLATE is rendered at.
 * It does not touch the quality tier, billing, credits, refunds, the provider
 * choice, or any gate threshold. The billing tier (`clip_quality`) stays
 * exactly what the user picked; only the pixels handed to the gates grow.
 *
 * PURE. No I/O.
 */

export const V538_VERSION = "v538";

/** v400 T4 — a pre-clipped plate needs at least this many speakers to qualify. */
export const V538_MIN_SPEAKERS_FOR_HIRES = 2;

export interface V538PlateResolutionInput {
  /** True only for cinematic-sync / sync-segments plates (lip-sync). */
  isLipSyncPlate: boolean;
  /** Number of distinct speakers that will be cut out of this plate. */
  speakerCount: number;
  /** The raster the quality tier would have picked on its own. */
  tierResolution: string;
  /** The provider's token for the v400-compliant raster (e.g. "1080p"). */
  hiResToken: string;
  /**
   * Whether the provider accepts `hiResToken` for THIS request. Hailuo, for
   * example, only accepts 1080p at a 6 s duration. A provider constraint is
   * never overridden here: an impossible upgrade is reported, not forced.
   */
  hiResAllowed: boolean;
}

export interface V538PlateResolutionDecision {
  /** The raster to send to the provider. */
  resolution: string;
  /** True when this module raised the raster above the tier default. */
  upgraded: boolean;
  /**
   * True when the v400 contract applies but the provider cannot satisfy it.
   * The caller renders anyway (unchanged behaviour) but should log it: this
   * is the one case where a multi-speaker plate stays below spec.
   */
  blockedByProvider: boolean;
  reason: string;
}

/** PURE — the raster a lip-sync plate must be rendered at. */
export function v538PlateResolution(
  input: V538PlateResolutionInput,
): V538PlateResolutionDecision {
  const tier = String(input?.tierResolution ?? "");
  const hi = String(input?.hiResToken ?? "");
  const speakers = Number.isFinite(input?.speakerCount) ? Number(input.speakerCount) : 0;

  if (!input?.isLipSyncPlate) {
    return { resolution: tier, upgraded: false, blockedByProvider: false, reason: "not_a_lipsync_plate" };
  }
  if (speakers < V538_MIN_SPEAKERS_FOR_HIRES) {
    return {
      resolution: tier,
      upgraded: false,
      blockedByProvider: false,
      reason: `single_speaker_plate:${speakers}`,
    };
  }
  if (!hi) {
    return { resolution: tier, upgraded: false, blockedByProvider: false, reason: "no_hires_token" };
  }
  if (tier === hi) {
    return { resolution: tier, upgraded: false, blockedByProvider: false, reason: "already_at_contract_raster" };
  }
  if (!input.hiResAllowed) {
    return {
      resolution: tier,
      upgraded: false,
      blockedByProvider: true,
      reason: `provider_rejects_hires:${hi}`,
    };
  }
  return {
    resolution: hi,
    upgraded: true,
    blockedByProvider: false,
    reason: `v400_t4_min_raster:speakers=${speakers}`,
  };
}

/**
 * PURE — distinct speaker count for a composer scene, from the cast shots the
 * plate is composed from. Falls back to 0 when nothing is known; the caller
 * then keeps the tier raster (fail-open on the RENDER, never on a gate).
 */
export function v538SpeakerCount(
  characterShots: Array<{ characterId?: string | null } | null | undefined> | null | undefined,
  singleShot?: { characterId?: string | null } | null,
): number {
  const ids = new Set<string>();
  const push = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) ids.add(s);
  };
  if (Array.isArray(characterShots)) {
    for (const s of characterShots) push(s?.characterId);
  }
  push(singleShot?.characterId);
  return ids.size;
}
