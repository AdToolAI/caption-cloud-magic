/**
 * preclip-safe-region.ts — v396 Schritte 8 und 9
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Zwei getrennte Aufgaben, die bisher vermischt waren:
 *
 * 8) DRIFT-MESSUNG über STABILE Merkmale.
 *    Der Mund bewegt sich beim Sprechen naturgemäss, und Landmark-Detektoren
 *    schwanken bei Pose, Mimik und Teilverdeckung. Ein variierender
 *    Mundfehlervektor beweist deshalb KEINEN Frame-Mapping-Fehler.
 *    Gemessen wird über Augenmittelpunkt, Nasenrücken und Bbox-Zentrum:
 *
 *      Geometriefehler = beobachtetes Face-Zentrum − projiziertes Face-Zentrum
 *
 *    Robust (Median) über mehrere Frames gemittelt. Der Mund darf sich
 *    relativ dazu bewegen und wird ausschliesslich für die Safe-Region
 *    verwendet.
 *
 * 9) MINIMALER, CONSTRAINT-BASIERTER RECROP.
 *    Kein Verschieben des Mundes auf einen festen Zielpunkt — das schiebt
 *    stärker als nötig und schneidet Stirn, Hinterkopf oder Kinn ab.
 *    Stattdessen wird nur so weit verschoben, bis alle Bedingungen
 *    erfüllt sind. Reicht Translation nicht, wird der Crop VERGRÖSSERT.
 *    Erst wenn auch das scheitert, gilt `crop_not_viable`.
 */

import { buildPreclipTransform, plateToPreclip, type PlateCropRect } from "./preclip-transform.ts";

export type Rect = readonly [number, number, number, number];

/** Anteil der Preclip-Kante, der ringsum als unsicher gilt. */
export const SAFE_REGION_INSET_RATIO = 0.06;

export interface SafeRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function safeRegionFor(outputSize: number, insetRatio = SAFE_REGION_INSET_RATIO): SafeRegion {
  const inset = Math.round(outputSize * insetRatio);
  return { left: inset, top: inset, right: outputSize - inset, bottom: outputSize - inset };
}

// ── 8) Drift über stabile Merkmale ────────────────────────────────────

export interface StableFeatures {
  bboxCenter: readonly [number, number];
  leftEye?: readonly [number, number];
  rightEye?: readonly [number, number];
  nose?: readonly [number, number];
}

/**
 * Ein stabiler Referenzpunkt aus den nicht-sprechenden Merkmalen. Augen und
 * Nasenrücken werden bevorzugt; das Bbox-Zentrum ist der Rückfall.
 */
export function stableAnchor(f: StableFeatures): [number, number] {
  const pts: Array<readonly [number, number]> = [];
  if (f.leftEye && f.rightEye) {
    pts.push([(f.leftEye[0] + f.rightEye[0]) / 2, (f.leftEye[1] + f.rightEye[1]) / 2]);
  }
  if (f.nose) pts.push(f.nose);
  pts.push(f.bboxCenter);
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface DriftSample {
  preclipFrame: number;
  projected: readonly [number, number];
  observed: readonly [number, number];
}

export interface DriftMeasurement {
  /** Robuster Fehlervektor in Preclip-Pixeln (Median über die Frames). */
  vector: [number, number];
  magnitudePx: number;
  /** Streuung des Fehlervektors — hoch heisst: nicht blind recroppen. */
  spreadPx: number;
  consistent: boolean;
  sampleCount: number;
}

/** Ab dieser Streuung gilt der Fehlervektor als nicht konstant. */
export const DRIFT_SPREAD_TOLERANCE_PX = 18;
/** Ab dieser Länge ist es echter Drift und kein Detektorrauschen. */
export const DRIFT_SIGNIFICANT_PX = 12;

export function measureGeometryDrift(
  samples: readonly DriftSample[],
  spreadTolerancePx = DRIFT_SPREAD_TOLERANCE_PX,
): DriftMeasurement {
  if (samples.length === 0) {
    return { vector: [0, 0], magnitudePx: 0, spreadPx: 0, consistent: false, sampleCount: 0 };
  }
  const dxs = samples.map((s) => s.observed[0] - s.projected[0]);
  const dys = samples.map((s) => s.observed[1] - s.projected[1]);
  const vector: [number, number] = [median(dxs), median(dys)];
  const spreadPx = median(
    samples.map((_, i) => Math.hypot(dxs[i] - vector[0], dys[i] - vector[1])),
  );
  return {
    vector,
    magnitudePx: Math.hypot(vector[0], vector[1]),
    spreadPx,
    consistent: samples.length >= 2 ? spreadPx <= spreadTolerancePx : true,
    sampleCount: samples.length,
  };
}

// ── 9) Minimaler Recrop ───────────────────────────────────────────────

export type RecropCode = "already_viable" | "recropped" | "crop_not_viable";

export interface RecropInput {
  crop: PlateCropRect;
  plateWidth: number;
  plateHeight: number;
  /** Ziel-Gesichtsbox in PLATE-Pixeln (aus der Preclip-Messung zurückgerechnet). */
  faceBoxPlate: Rect;
  /** Mundfenster in PLATE-Pixeln. */
  mouthRectPlate: Rect;
  /** Nachbargesichter in Plate-Pixeln, die nicht in den Crop geraten dürfen. */
  neighbourFacesPlate?: readonly Rect[];
  insetRatio?: number;
  /** Maximale Vergrösserung des Crops, Faktor. */
  maxGrowth?: number;
}

export interface RecropResult {
  ok: boolean;
  code: RecropCode;
  reason?: string;
  crop: PlateCropRect;
  /** Verschiebung in Plate-Pixeln gegenüber dem Eingangs-Crop. */
  shiftPx: [number, number];
  grewBy: number;
  violations: string[];
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);
}

function evaluate(crop: PlateCropRect, input: RecropInput): string[] {
  const insetRatio = input.insetRatio ?? SAFE_REGION_INSET_RATIO;
  const inset = crop.size * insetRatio;
  const cropRect: Rect = [crop.x, crop.y, crop.x + crop.size, crop.y + crop.size];
  const safeRect: Rect = [
    crop.x + inset,
    crop.y + inset,
    crop.x + crop.size - inset,
    crop.y + crop.size - inset,
  ];
  const v: string[] = [];
  if (!rectInside(input.mouthRectPlate, safeRect)) v.push("mouth_outside_safe_region");
  if (!rectInside(input.faceBoxPlate, cropRect)) v.push("face_box_clipped");
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.size > input.plateWidth || crop.y + crop.size > input.plateHeight) {
    v.push("crop_outside_plate");
  }
  for (const n of input.neighbourFacesPlate ?? []) {
    if (rectsOverlap(n, safeRect)) {
      v.push("neighbour_face_in_provider_region");
      break;
    }
  }
  return v;
}

/** Verschiebt den Crop minimal, sodass `target` vollständig in `[lo, hi]` liegt. */
function minimalShift1D(targetLo: number, targetHi: number, lo: number, hi: number): number {
  if (targetLo < lo) return targetLo - lo;
  if (targetHi > hi) return targetHi - hi;
  return 0;
}

function placeCrop(input: RecropInput, size: number, base: PlateCropRect): PlateCropRect {
  const insetRatio = input.insetRatio ?? SAFE_REGION_INSET_RATIO;
  const inset = size * insetRatio;
  // Ausgangslage: Zentrum beibehalten, nur Grösse angepasst.
  let x = base.x + base.size / 2 - size / 2;
  let y = base.y + base.size / 2 - size / 2;

  // Nur so weit verschieben, wie Mundfenster und Face-Box es erzwingen.
  for (let i = 0; i < 4; i++) {
    const safeLoX = x + inset;
    const safeHiX = x + size - inset;
    const safeLoY = y + inset;
    const safeHiY = y + size - inset;
    const dxMouth = minimalShift1D(input.mouthRectPlate[0], input.mouthRectPlate[2], safeLoX, safeHiX);
    const dyMouth = minimalShift1D(input.mouthRectPlate[1], input.mouthRectPlate[3], safeLoY, safeHiY);
    const dxFace = minimalShift1D(input.faceBoxPlate[0], input.faceBoxPlate[2], x, x + size);
    const dyFace = minimalShift1D(input.faceBoxPlate[1], input.faceBoxPlate[3], y, y + size);
    const dx = Math.abs(dxMouth) >= Math.abs(dxFace) ? dxMouth : dxFace;
    const dy = Math.abs(dyMouth) >= Math.abs(dyFace) ? dyMouth : dyFace;
    if (dx === 0 && dy === 0) break;
    x += dx;
    y += dy;
  }

  x = Math.max(0, Math.min(input.plateWidth - size, x));
  y = Math.max(0, Math.min(input.plateHeight - size, y));
  return { x: Math.round(x), y: Math.round(y), size: Math.round(size), outputSize: base.outputSize };
}

/**
 * Genau EIN deterministischer Korrekturversuch. Erst Translation, dann —
 * falls nötig — Vergrösserung in kleinen Schritten.
 */
export function recropToSafeRegion(input: RecropInput): RecropResult {
  const base = input.crop;
  const initial = evaluate(base, input);
  if (initial.length === 0) {
    return { ok: true, code: "already_viable", crop: base, shiftPx: [0, 0], grewBy: 1, violations: [] };
  }

  const maxSide = Math.min(input.plateWidth, input.plateHeight);
  const maxGrowth = input.maxGrowth ?? 1.8;
  const steps = [1, 1.12, 1.25, 1.4, 1.6, 1.8].filter((g) => g <= maxGrowth);

  for (const g of steps) {
    const size = Math.min(maxSide, Math.round(base.size * g));
    const candidate = placeCrop(input, size, base);
    const violations = evaluate(candidate, input);
    if (violations.length === 0) {
      return {
        ok: true,
        code: "recropped",
        crop: candidate,
        shiftPx: [candidate.x - base.x, candidate.y - base.y],
        grewBy: candidate.size / base.size,
        violations: [],
      };
    }
  }

  const finalSize = Math.min(maxSide, Math.round(base.size * (steps[steps.length - 1] ?? 1)));
  const finalCrop = placeCrop(input, finalSize, base);
  return {
    ok: false,
    code: "crop_not_viable",
    reason:
      `no translation and no growth up to ${maxGrowth}x satisfies the safe-region constraints ` +
      `(${evaluate(finalCrop, input).join(", ")})`,
    crop: finalCrop,
    shiftPx: [finalCrop.x - base.x, finalCrop.y - base.y],
    grewBy: finalCrop.size / base.size,
    violations: evaluate(finalCrop, input),
  };
}

/** Bequemlichkeit: Preclip-Messung nach Plate zurückrechnen. */
export function preclipRectToPlate(crop: PlateCropRect, rect: Rect): Rect {
  const t = buildPreclipTransform(crop);
  const inv = t.inverse;
  const a: [number, number] = [inv[0] * rect[0] + inv[1] * rect[1] + inv[2], inv[3] * rect[0] + inv[4] * rect[1] + inv[5]];
  const b: [number, number] = [inv[0] * rect[2] + inv[1] * rect[3] + inv[2], inv[3] * rect[2] + inv[4] * rect[3] + inv[5]];
  return [a[0], a[1], b[0], b[1]];
}

/** Bequemlichkeit für Forensik-Overlays: Plate-Punkt im Preclip. */
export function projectPlatePoint(crop: PlateCropRect, p: readonly [number, number]): [number, number] {
  return plateToPreclip(buildPreclipTransform(crop), p);
}
