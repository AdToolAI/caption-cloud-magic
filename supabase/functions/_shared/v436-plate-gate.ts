/**
 * v436 — Pure decision logic for the v117 plate-quality gate plus the
 * explicit reason taxonomy for "identity map unavailable".
 *
 * Kept dependency-free on purpose so both the Deno edge function and the
 * Vitest regression suite can import it unchanged.
 *
 * Proven contract (restored in v436):
 *   Physical face coverage is authoritative for BLOCKING.
 *   Identity-resolution failure alone falls back to slot-order coords.
 */

export type PlateIdentityNullReason =
  | "no_anchor"
  | "provider_empty"
  | "provider_error"
  | "expected_count_mismatch"
  | "invalid_result"
  | "detector_zero_faces"
  | "unknown";

/**
 * Classify why `resolvePlateFaceIdentities` produced no usable identity map.
 * Never returns an empty string — every null path is attributable.
 */
export function classifyIdentityNullReason(input: {
  detectReason?: string | null;
  plateMapPresent: boolean;
  faceCount: number;
  anchorPresent?: boolean;
}): string {
  const raw = String(input.detectReason ?? "").trim();
  if (raw) return raw;
  if (input.plateMapPresent && input.faceCount === 0) return "detector_zero_faces";
  if (input.anchorPresent === false) return "no_anchor";
  return "unknown";
}

export type V117GateDecision = {
  /** true → hard block + refund */
  block: boolean;
  /** machine reason for logs / dispatch telemetry */
  reason: string;
  /** true → gate passes but the run relies on the slot-order fallback */
  softPass: boolean;
  /** which message branch the user-facing copy must render */
  messageBranch: "split_screen" | "faces_missing" | "none";
  /** face count to quote in the user-facing message (never fabricated) */
  detectedForMessage: number;
};

/**
 * v117 decision table (v436):
 *  - split-screen detector positive                          → BLOCK
 *  - hydrated boxes < speakers                               → BLOCK (physical coverage)
 *  - identity map present but detectedFaces < speakers       → BLOCK (pre-existing blocker)
 *  - identity map null but boxes == speakers                 → SOFT PASS (slot-order fallback)
 *  - identity map present, resolved < speakers, boxes == n   → SOFT PASS (slot-order fallback)
 *  - otherwise                                               → PASS
 */
export function evaluateV117Gate(input: {
  speakers: number;
  detectedFaces: number;
  resolvedFaces: number;
  hydratedBoxes: number;
  identityMapPresent: boolean;
  splitScreenReason?: string | null;
  identityNullReason?: string | null;
}): V117GateDecision {
  const speakers = input.speakers;
  const split = (input.splitScreenReason ?? "").trim();

  if (split) {
    return {
      block: true,
      reason: split,
      softPass: false,
      messageBranch: "split_screen",
      detectedForMessage: input.detectedFaces,
    };
  }

  if (input.hydratedBoxes < speakers) {
    const detected = input.identityMapPresent
      ? Math.min(input.detectedFaces, input.hydratedBoxes)
      : input.hydratedBoxes;
    return {
      block: true,
      reason: `plate_faces_missing(detected=${detected}, expected=${speakers})`,
      softPass: false,
      messageBranch: "faces_missing",
      detectedForMessage: detected,
    };
  }

  if (input.identityMapPresent && input.detectedFaces < speakers) {
    return {
      block: true,
      reason: `plate_faces_missing(detected=${input.detectedFaces}, expected=${speakers})`,
      softPass: false,
      messageBranch: "faces_missing",
      detectedForMessage: input.detectedFaces,
    };
  }

  if (!input.identityMapPresent) {
    return {
      block: false,
      reason: `v117_soft_pass_identity_unavailable(${(input.identityNullReason ?? "unknown") || "unknown"})`,
      softPass: true,
      messageBranch: "none",
      detectedForMessage: input.hydratedBoxes,
    };
  }

  if (input.resolvedFaces < speakers) {
    return {
      block: false,
      reason: `v117_soft_pass_identity_partial(resolved=${input.resolvedFaces}/${speakers})`,
      softPass: true,
      messageBranch: "none",
      detectedForMessage: input.detectedFaces,
    };
  }

  return {
    block: false,
    reason: "ok",
    softPass: false,
    messageBranch: "none",
    detectedForMessage: input.detectedFaces,
  };
}
