/**
 * lipsync-closeup-contract.ts — v354
 *
 * Single source of truth for the FACE-SIZE CONTRACT of the lip-sync
 * pipeline.
 *
 * Problem this replaces:
 *   Until v353 the only *hard* face-size check lived at the very end of the
 *   pipeline, inside `pass-face-preclip.ts` (`MIN_NATIVE_CROP_PX = 144`,
 *   `FACE_SIDE_SHARE_FLOOR = 0.34`). The anchor-side check
 *   (`anchor-min-face-size.ts`) was advisory: a plate with 3 % faces still
 *   went through the (paid) video render and only blew up at T6, after the
 *   money was spent. Every fix cycle since v331 was an attempt to make the
 *   preclip tolerate geometry that should never have been produced.
 *
 * v354 inverts that: the contract is enforced where the geometry is
 * CREATED (anchor + rendered clip). The preclip keeps its thresholds, but
 * only as an assertion — a violation there now means an upstream stage let
 * a non-conforming plate through (`contract_violation_upstream`).
 *
 * Pure module: no I/O, no side effects. Safe to import everywhere.
 */

/**
 * Feature flag. Default ON. Set `LIPSYNC_CLOSEUP_ONLY=0` to fall back to
 * the pre-v354 advisory behaviour (wide plates allowed, preclip gates).
 */
export function closeupOnlyEnabled(): boolean {
  try {
    const raw = (globalThis as any).Deno?.env?.get?.("LIPSYNC_CLOSEUP_ONLY");
    if (raw === undefined || raw === null || raw === "") return true;
    return String(raw).toLowerCase() !== "0" &&
      String(raw).toLowerCase() !== "false";
  } catch (_) {
    return true;
  }
}

/**
 * Required minimum face WIDTH as a fraction of plate width, by speaker
 * count. Derived from the measured passthrough boundary of Sync.so:
 * a native crop below ~144 px is returned unchanged. With a 720p-class
 * plate these ratios keep every face's native crop safely above it.
 *
 *   N = 1 → 0.30  (true close-up)
 *   N = 2 → 0.22  (tight two-shot)
 *   N ≥ 3 → 0.16  (tight grid / compact multi-shot)
 */
export function requiredFaceWidthRatio(speakers: number): number {
  const n = Math.max(1, Math.round(speakers || 1));
  if (n <= 1) return 0.30;
  if (n === 2) return 0.22;
  return 0.16;
}

/** Error code emitted when the preclip assertion trips despite the gates. */
export const CONTRACT_VIOLATION_UPSTREAM = "contract_violation_upstream";

export interface PlateFaceContractInput {
  /** Face bboxes [x1,y1,x2,y2] in plate pixel space. */
  faces: Array<[number, number, number, number]>;
  plateWidth: number;
  /** Number of speakers the plate is expected to carry. */
  speakers: number;
  /** Override the ratio (tests / calibration). */
  minWidthRatio?: number;
}

export interface PlateFaceContractResult {
  ok: boolean;
  /** Smallest observed face width / plate width. */
  minWidthRatio: number;
  minWidthPx: number;
  requiredRatio: number;
  requiredPx: number;
  ratios: number[];
  reason?: string;
}

/**
 * Verify a plate (anchor still OR first frame of the rendered clip)
 * against the contract. `ok=false` must block, never warn.
 */
export function assertPlateFaceContract(
  input: PlateFaceContractInput,
): PlateFaceContractResult {
  const W = Math.max(1, Number(input.plateWidth) || 1);
  const required = input.minWidthRatio ?? requiredFaceWidthRatio(input.speakers);
  const requiredPx = Math.round(required * W);

  if (!Array.isArray(input.faces) || input.faces.length === 0) {
    return {
      ok: false,
      minWidthRatio: 0,
      minWidthPx: 0,
      requiredRatio: required,
      requiredPx,
      ratios: [],
      reason: "no_faces_detected",
    };
  }

  const ratios = input.faces.map(([x1, , x2]) =>
    Math.max(0, Number(x2) - Number(x1)) / W
  );
  const minR = Math.min(...ratios);
  const minPx = Math.round(minR * W);

  if (minR >= required) {
    return {
      ok: true,
      minWidthRatio: minR,
      minWidthPx: minPx,
      requiredRatio: required,
      requiredPx,
      ratios,
    };
  }

  return {
    ok: false,
    minWidthRatio: minR,
    minWidthPx: minPx,
    requiredRatio: required,
    requiredPx,
    ratios,
    reason:
      `face_width_ratio_${minR.toFixed(3)}_below_${required.toFixed(3)}`,
  };
}

/**
 * User-facing (German) failure message for a contract violation. Written
 * for the composer UI: says WHAT is wrong and WHAT to do, never leaks
 * internal thresholds as bare numbers without context.
 */
export function contractFailureMessage(
  result: PlateFaceContractResult,
  speakers: number,
): string {
  if (result.reason === "no_faces_detected") {
    return "lipsync_face_contract: Auf der Szenen-Plate wurde kein Gesicht erkannt. " +
      "Bitte die Szene mit engerer Kameraeinstellung (Nahaufnahme) neu generieren.";
  }
  return (
    `lipsync_face_contract: Die Gesichter sind für Lip-Sync zu klein ` +
    `(${(result.minWidthRatio * 100).toFixed(1)} % der Bildbreite, benötigt: ` +
    `${(result.requiredRatio * 100).toFixed(0)} % bei ${Math.max(1, speakers)} Sprecher(n)). ` +
    `Die Szene wurde vor dem Lip-Sync gestoppt, es wurden keine Credits für den Provider verbraucht. ` +
    `Bitte die Szene mit engerer Einstellung (Nahaufnahme / kompakte Gruppe) neu generieren.`
  );
}

/**
 * Prompt suffix that pushes the image model into contract-conforming
 * framing on the FIRST attempt (pre-v354 this was only used on retries).
 */
export function closeupFramingSuffix(speakers: number): string {
  const n = Math.max(1, Math.round(speakers || 1));
  if (n <= 1) {
    return (
      "\n[LIP-SYNC FRAMING] Tight close-up: the subject's head fills at least " +
      "30 % of the frame width, head-and-shoulders, mouth clearly readable. " +
      "No wide or environmental shot."
    );
  }
  if (n === 2) {
    return (
      "\n[LIP-SYNC FRAMING] Tight two-shot: both subjects chest-up and close to " +
      "camera, each head fills at least 22 % of the frame width, both mouths " +
      "clearly readable. No wide or environmental shot."
    );
  }
  return (
    `\n[LIP-SYNC FRAMING] Compact ${n}-person shot: all ${n} subjects tightly ` +
    `grouped and close to camera, chest-up, each head fills at least 16 % of ` +
    `the frame width, every mouth clearly readable. The environment is only ` +
    `suggested in the background — never make the subjects small in a large room.`
  );
}
