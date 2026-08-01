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
 * ════════════════════════════════════════════════════════════════════
 * v355 — THE CONTRACT IS MEASURED IN PIXELS, NOT IN RATIOS.
 *
 * v354 gated on face width / plate width. That was wrong and it showed
 * immediately: a 4-person conference table was blocked at 5.8 % against a
 * required 16 %, a threshold four faces can never reach together (4 × 16 %
 * = 64 % of the frame width is no longer a conference shot).
 *
 * The evidence from scene 7c11bc27 was always about ABSOLUTE pixels:
 *
 *   native crop 181 px → verdict "moved"        ✅
 *   native crop 116 px → passthrough            ❌
 *   native crop 102 px → passthrough            ❌
 *
 * Sync.so does not care what fraction of the frame a head occupies. It
 * cares how many real pixels sit on the mouth. A ratio is only a proxy
 * for that, and a bad one, because it silently depends on plate
 * resolution: the SAME framing at 1080p carries 1.5× the mouth detail of
 * 720p and crosses the boundary without any change to the composition.
 *
 * Consequence for the pipeline:
 *   - Rendered plates are gated on `MIN_FACE_WIDTH_PX` (hard).
 *   - Ratios stay, but only as ANCHOR-stage framing guidance: they steer
 *     the prompt/retry loop toward tighter shots. They never fail a scene.
 *   - Lip-sync scenes render their plate at the model's highest available
 *     resolution, because that is real detail — the one lever that moves
 *     the pixel count without changing the director's framing.
 *
 * NOT a lever: upscaling the plate after the fact. The preclip already
 * Lanczos-upscales its crop to 720p before dispatch, so a pre-upscaled
 * plate produces a byte-for-byte comparable input for the provider — it
 * would only inflate our own measurement while adding zero detail.
 * ════════════════════════════════════════════════════════════════════
 */

/**
 * HARD floor: minimum face width in NATIVE plate pixels for a speaker to
 * be dispatched to the lip-sync provider. 120 px face width yields a
 * ~180 px native crop with the standard preclip margin — the smallest
 * size measured to survive without passthrough (181 px worked, 116 px
 * did not), with the margin sitting on the safe side of that boundary.
 */
export const MIN_FACE_WIDTH_PX = 120;

/**
 * Advisory ONLY (anchor stage / prompt steering). Never fails a scene.
 * Used to decide whether another framing retry is worth attempting.
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
  /** Override the pixel floor (tests / calibration). */
  minWidthPxFloor?: number;
  /**
   * v355 — measurement mode.
   *   "pixels" (default) → HARD gate on native face width in px.
   *   "ratio"            → ADVISORY framing check for the anchor stage.
   */
  mode?: "pixels" | "ratio";
}

export interface PlateFaceContractResult {
  ok: boolean;
  /** Smallest observed face width / plate width. */
  minWidthRatio: number;
  minWidthPx: number;
  requiredRatio: number;
  requiredPx: number;
  ratios: number[];
  mode: "pixels" | "ratio";
  reason?: string;
}

/**
 * Verify a plate against the contract.
 *
 * `mode: "pixels"` (rendered clip) is the HARD gate — `ok=false` must
 * block. `mode: "ratio"` (anchor still, where absolute pixels say nothing
 * about the final render) is ADVISORY — callers use it to decide whether
 * another framing retry is worthwhile, never to fail a scene.
 */
export function assertPlateFaceContract(
  input: PlateFaceContractInput,
): PlateFaceContractResult {
  const W = Math.max(1, Number(input.plateWidth) || 1);
  const mode = input.mode ?? "pixels";
  const requiredRatio = input.minWidthRatio ??
    requiredFaceWidthRatio(input.speakers);
  const requiredPx = mode === "pixels"
    ? (input.minWidthPxFloor ?? MIN_FACE_WIDTH_PX)
    : Math.round(requiredRatio * W);

  if (!Array.isArray(input.faces) || input.faces.length === 0) {
    return {
      ok: false,
      minWidthRatio: 0,
      minWidthPx: 0,
      requiredRatio,
      requiredPx,
      ratios: [],
      mode,
      reason: "no_faces_detected",
    };
  }

  const widths = input.faces.map(([x1, , x2]) =>
    Math.max(0, Number(x2) - Number(x1))
  );
  const ratios = widths.map((w) => w / W);
  const minPx = Math.round(Math.min(...widths));
  const minR = Math.min(...ratios);

  const ok = mode === "pixels" ? minPx >= requiredPx : minR >= requiredRatio;

  return {
    ok,
    minWidthRatio: minR,
    minWidthPx: minPx,
    requiredRatio,
    requiredPx,
    ratios,
    mode,
    reason: ok
      ? undefined
      : mode === "pixels"
      ? `face_width_${minPx}px_below_${requiredPx}px`
      : `face_width_ratio_${minR.toFixed(3)}_below_${requiredRatio.toFixed(3)}`,
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
  if (result.mode === "ratio") {
    return (
      `lipsync_face_contract: Die Gesichter nehmen nur ` +
      `${(result.minWidthRatio * 100).toFixed(1)} % der Bildbreite ein ` +
      `(Richtwert bei ${Math.max(1, speakers)} Sprecher(n): ` +
      `${(result.requiredRatio * 100).toFixed(0)} %).`
    );
  }
  return (
    `lipsync_face_contract: Das kleinste Gesicht auf der Plate ist nur ` +
    `${result.minWidthPx} px breit — für Lip-Sync werden mindestens ` +
    `${result.requiredPx} px echte Bildpunkte benötigt, sonst gibt der Provider ` +
    `das Video unverändert zurück. Die Szene wurde vor dem Lip-Sync gestoppt, ` +
    `es wurden keine Credits für den Provider verbraucht. ` +
    `Abhilfe: Szene mit engerer Einstellung (Nahaufnahme / kompakte Gruppe) ` +
    `oder mit weniger Sprechern pro Bild neu generieren.`
  );
}

/**
 * v355 — Lip-sync scenes always render their plate at the model's highest
 * available resolution. This is the only honest lever on the pixel
 * contract: it adds REAL mouth detail without touching the director's
 * framing. At identical framing, 1080p carries 1.5× the face pixels of
 * 720p — enough to move a 74 px face to ~111 px.
 *
 * Returns the resolution string a model should be asked for when the
 * scene carries dialog, or `null` when the scene has no lip-sync.
 */
export function lipsyncPlateResolution(
  hasLipSync: boolean,
  supported: readonly string[],
  fallback: string,
): string {
  if (!hasLipSync) return fallback;
  const ranked = ["4k", "2160p", "1440p", "1080p", "768p", "720p"];
  for (const r of ranked) {
    if (supported.includes(r)) return r;
  }
  return fallback;
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
