/**
 * V500-B1 — GOLDEN RUNTIME CORE CONTRACT (PURE)
 * ---------------------------------------------------------------------------
 * Authority is NOT the written v400 prose spec. Authority is the run that
 * demonstrably produced correct 4-speaker lip-sync:
 * `c934a823-47de-49b7-a62e-a116b49ca3b2` (see `v500-golden-contract.ts` and
 * `docs/v500-a-golden-contract.md`).
 *
 * That measurement retired two assumptions that later versions treated as
 * requirements:
 *
 *   - There was NO mouth-priority crop. Anchor = `face_center`,
 *     `mouth_offset_px = 0`, `plate_mouth = null` in all four passes.
 *   - There was NO camera path. Zero keyframes, one static square crop
 *     per pass.
 *   - "Mouth at 62 %" was never a target. The reconstructed mouth height was
 *     0.571 – 0.612, i.e. an emergent property of a face-centred crop.
 *
 * This module therefore freezes what the working path ACTUALLY required, so a
 * future change cannot "improve" the successful path until it stops working:
 *
 *   1. a static face-centre crop is ALLOWED (never a violation),
 *   2. a dynamic camera path is NOT required,
 *   3. a 0.62 mouth height is NOT required,
 *   4. face-share must stay inside the empirically observed working band,
 *   5. the T10 provider shape stays sync-3 / bbox-url-pro /
 *      bounding_boxes_url / cut_off / clip-space / preclip,
 *   6. exactly one visible target face per dispatch.
 *
 * Modern per-frame ASD registration (V464) is explicitly NOT rolled back: the
 * golden semantics (`bounding_boxes_url`, same sync-3 contract) are preserved
 * while the boxes themselves may be frame-correct. Only the SHAPE is frozen
 * here, never the number of boxes.
 *
 * PURE: no IO, no DB, no provider dispatch.
 */

import {
  goldenFaceShare,
  goldenFaceSizePx,
  V500_GOLDEN_PASSES,
} from "./v500-golden-contract.ts";

/** Face-share band actually observed on the golden run (0.252 – 0.400). */
export const V500_FACE_SHARE_OBSERVED = {
  min: Math.min(...V500_GOLDEN_PASSES.map(goldenFaceShare)),
  max: Math.max(...V500_GOLDEN_PASSES.map(goldenFaceShare)),
} as const;

/**
 * Accepted face-share band. The floor is the v400 T9 floor (0.24) which the
 * golden run satisfied with margin; the ceiling is the observed maximum plus
 * the same margin, so a much tighter crop than anything that ever worked is
 * still flagged.
 */
export const V500_FACE_SHARE_BAND = {
  min: 0.24,
  max: 0.55,
} as const;

/** Smallest face in golden preclip pixels was 182 px; v400 T9 floor is 144. */
export const V500_MIN_FACE_PX = 144;
export const V500_GOLDEN_MIN_FACE_PX = Math.min(
  ...V500_GOLDEN_PASSES.map(goldenFaceSizePx),
);

/** Frozen T10 provider shape of the golden run. */
export const V500_DISPATCH_SHAPE = {
  model: "sync-3",
  retryVariant: "bbox-url-pro",
  asdMode: "bounding_boxes_url",
  syncMode: "cut_off",
  inputSpace: "clip",
  videoKind: "preclip",
} as const;

/**
 * Explicitly NON-requirements. Kept as named constants so a future gate that
 * tries to enforce them fails the conformance test instead of silently
 * shipping.
 */
export const V500_NOT_REQUIRED = {
  /** Mouth-priority crop / 0.62 centring. */
  mouthTargetHeight: false,
  /** Dynamic (multi-keyframe) camera path. */
  dynamicCameraPath: false,
  /** A measured mouth landmark as a precondition for DISPATCH. */
  mouthLandmarkForDispatch: false,
} as const;

export interface V500CandidatePass {
  faceShareInCrop?: number | null;
  faceSizePx?: number | null;
  anchor?: string | null;
  cameraPathKeyframes?: number | null;
  mouthHeightInPreclip?: number | null;
  targetFaces?: number | null;
  dispatch?: {
    model?: string | null;
    retryVariant?: string | null;
    asdMode?: string | null;
    syncMode?: string | null;
    inputSpace?: string | null;
    videoKind?: string | null;
  } | null;
}

export interface V500CoreContractResult {
  conform: boolean;
  violations: string[];
  notes: string[];
}

/**
 * PURE — checks a pass against the empirical golden contract.
 *
 * A static face-centre crop, a missing camera path and any mouth height are
 * NEVER violations. Only the things the golden run really depended on are.
 */
export function evaluateV500CoreContract(
  pass: V500CandidatePass,
): V500CoreContractResult {
  const violations: string[] = [];
  const notes: string[] = [];

  const share = Number(pass.faceShareInCrop ?? NaN);
  if (Number.isFinite(share)) {
    if (share < V500_FACE_SHARE_BAND.min) {
      violations.push(`face_share_below_band:${share}<${V500_FACE_SHARE_BAND.min}`);
    } else if (share > V500_FACE_SHARE_BAND.max) {
      violations.push(`face_share_above_band:${share}>${V500_FACE_SHARE_BAND.max}`);
    }
  } else {
    notes.push("face_share_unknown");
  }

  const facePx = Number(pass.faceSizePx ?? NaN);
  if (Number.isFinite(facePx) && facePx < V500_MIN_FACE_PX) {
    violations.push(`face_px_below_floor:${facePx}<${V500_MIN_FACE_PX}`);
  }

  const faces = Number(pass.targetFaces ?? NaN);
  if (Number.isFinite(faces) && faces !== 1) {
    violations.push(`target_faces_not_one:${faces}`);
  }

  const d = pass.dispatch ?? null;
  if (d) {
    const check = (key: keyof typeof V500_DISPATCH_SHAPE, value: unknown) => {
      if (value == null) {
        notes.push(`dispatch_${key}_unknown`);
        return;
      }
      if (String(value) !== V500_DISPATCH_SHAPE[key]) {
        violations.push(`dispatch_${key}:${String(value)}!=${V500_DISPATCH_SHAPE[key]}`);
      }
    };
    check("model", d.model);
    check("retryVariant", d.retryVariant);
    check("asdMode", d.asdMode);
    check("syncMode", d.syncMode);
    check("inputSpace", d.inputSpace);
    check("videoKind", d.videoKind);
  } else {
    notes.push("dispatch_unknown");
  }

  // Deliberately NOT violations — the golden run had none of these.
  if ((pass.cameraPathKeyframes ?? 0) <= 1) notes.push("static_camera_path_allowed");
  if (pass.anchor === "face_center") notes.push("face_center_anchor_allowed");
  if (pass.mouthHeightInPreclip != null) {
    notes.push(`mouth_height_observed:${pass.mouthHeightInPreclip}`);
  }

  return { conform: violations.length === 0, violations, notes };
}
