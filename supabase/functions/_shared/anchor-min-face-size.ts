/**
 * anchor-min-face-size.ts — v262
 *
 * Enforces a minimum face-width-ratio invariant on the composed anchor
 * plate. When a face is below the threshold, downstream lip-sync will be
 * imperceptible even if Sync.so animates it perfectly: the 720×720
 * preclip is composited back at the source crop size (~40–80 px for
 * small faces), and the ~4 px mouth movement inside the preclip
 * downsamples to <1 px in the final. Users perceive "no lip-sync" even
 * though every provider succeeded.
 *
 * Root-cause data (2026-07-19 office scene, 4 speakers):
 *   Samuel  face  39 px in 652×1414 plate → lipsync invisible
 *   Matthew face 116 px                 → visible ✓
 *   Sarah   face  40 px                 → invisible
 *   Kailee  face  76 px                 → borderline
 *
 * Threshold: min face-width ≥ 12 % of plate width (≈ 78 px @ 652-wide,
 * or ≈ 130 px @ 1080-wide). Below that, ask the anchor to be re-composed
 * with a tighter framing.
 *
 * Pure function; no side effects.
 */

export interface AnchorFaceLike {
  /** Pixel bbox [x1, y1, x2, y2] within the plate. */
  bbox: [number, number, number, number];
}

export type FramingSuggestion = "medium_shot" | "tight_grid" | "closeup";

export interface MinFaceSizeInput {
  faces: AnchorFaceLike[];
  plateWidth: number;
  plateHeight: number;
  /** Number of cast speakers we expected the anchor to contain. */
  expectedSpeakers: number;
  /** Minimum face-width ratio (default 0.12 = 12 % of plate width). */
  minWidthRatio?: number;
  /**
   * v354 — when true the caller MUST treat `ok=false` as a hard block
   * (no video render). Purely informational for the caller; the pure
   * function itself has no side effects.
   */
  hard?: boolean;
}

export interface MinFaceSizeResult {
  ok: boolean;
  minWidthRatio: number;
  minWidthPx: number;
  ratios: number[];
  /** Framing hint for the next Nano Banana attempt. */
  suggestion: FramingSuggestion;
  /** Prompt-suffix ready to append to the anchor prompt. */
  framingSuffix: string;
  reason?: string;
}

import { requiredFaceWidthRatio } from "./lipsync-closeup-contract.ts";

/**
 * v354 — the flat 0.12 default was advisory and far below what Sync.so
 * needs. The contract module now owns the numbers (0.30 / 0.22 / 0.16 by
 * speaker count); this stays only as the floor for callers that pass an
 * invalid speaker count.
 */
const LEGACY_MIN_WIDTH_RATIO = 0.12;

/**
 * Build the framing suggestion prompt suffix given the speaker count.
 *
 * The suffix is composed defensively: it must not contradict earlier
 * IDENTITY/FRAMING clauses, so we only add COMPOSITION guidance about
 * how large each subject occupies the frame.
 */
export function framingSuffixFor(
  suggestion: FramingSuggestion,
  n: number,
): string {
  switch (suggestion) {
    case "closeup":
      return (
        "\n[FRAMING RETRY] Re-compose as a TIGHT CLOSE-UP: the single subject " +
        "fills at least 45 % of the frame width, head-and-shoulders framing, " +
        "chest visible, face fully readable, mouth clearly visible for lip-sync. " +
        "No wide shots, no environmental establishing views."
      );
    case "tight_grid":
      return (
        `\n[FRAMING RETRY] Re-compose as a TIGHT ${n === 4 ? "2×2 grid" : "compact multi-shot"}: ` +
        `each of the ${n} subjects occupies ≥ 30 % of the frame width in their ` +
        `own quadrant/cell. Chest-up medium shot per subject. Faces large, mouths ` +
        `clearly visible for lip-sync. No wide environmental shot. No small figures. ` +
        `The scene setting is only suggested by lighting/color, not by making the ` +
        `subjects small in a large environment.`
      );
    case "medium_shot":
    default:
      return (
        `\n[FRAMING RETRY] Re-compose as a MEDIUM SHOT: ` +
        `all ${n} subjects tightly grouped, chest-up framing, each face fills ` +
        `≥ 15 % of the frame width. Push the camera in closer. No wide shots. ` +
        `The environment stays visible in the background but the subjects dominate ` +
        `the frame. Mouths clearly readable for lip-sync.`
      );
  }
}

/**
 * Enforce the minimum-face-size invariant.
 *
 * Returns `ok=true` when every detected face has width ≥ minWidthRatio × plateWidth.
 * When it fails, provides a framing suggestion + prompt suffix the caller
 * appends to the next `compose-scene-anchor` prompt.
 */
export function enforceMinFaceSize(
  input: MinFaceSizeInput,
): MinFaceSizeResult {
  const minRatio = input.minWidthRatio ??
    Math.max(
      LEGACY_MIN_WIDTH_RATIO,
      requiredFaceWidthRatio(input.expectedSpeakers),
    );
  const W = Math.max(1, input.plateWidth);
  const n = Math.max(1, input.expectedSpeakers);

  const suggestion: FramingSuggestion =
    n <= 1 ? "closeup" : n === 4 ? "tight_grid" : "medium_shot";

  const framingSuffix = framingSuffixFor(suggestion, n);

  if (!Array.isArray(input.faces) || input.faces.length === 0) {
    return {
      ok: false,
      minWidthRatio: 0,
      minWidthPx: 0,
      ratios: [],
      suggestion,
      framingSuffix,
      reason: "no_faces_detected",
    };
  }

  const ratios = input.faces.map((f) => {
    const [x1, , x2] = f.bbox;
    const w = Math.max(0, x2 - x1);
    return w / W;
  });
  const minR = Math.min(...ratios);
  const minPx = Math.round(minR * W);

  if (minR >= minRatio) {
    return {
      ok: true,
      minWidthRatio: minR,
      minWidthPx: minPx,
      ratios,
      suggestion,
      framingSuffix,
    };
  }

  return {
    ok: false,
    minWidthRatio: minR,
    minWidthPx: minPx,
    ratios,
    suggestion,
    framingSuffix,
    reason: `min_face_ratio_${minR.toFixed(3)}_below_${minRatio.toFixed(3)}`,
  };
}
