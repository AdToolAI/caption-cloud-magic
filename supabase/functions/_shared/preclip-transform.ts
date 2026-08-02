/**
 * preclip-transform.ts — v396 Schritt 7: EIN gemeinsamer Geometrievertrag
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Bisher implementierten Planner, Remotion-Renderer, das Pre-Dispatch-Gate
 * und die Reprojektion (T15) dieselbe Mathematik viermal unabhängig. Genau
 * dort entstehen die Abweichungen, die als "Passthrough" enden.
 *
 * Ab v396 gibt es genau eine Implementierung. Sie wird pro Frame persistiert
 * (`forward_matrix` / `inverse_matrix`) und von allen Stellen konsumiert.
 *
 * Zwei Tests, nicht einer:
 *
 *   1. Roundtrip  P → M → M⁻¹ → P   (Toleranz < 0,5 px)
 *      NOTWENDIG, aber NICHT HINREICHEND: eine völlig falsche, sauber
 *      invertierte Matrix besteht ihn ebenfalls. Er beweist nur, dass
 *      Matrix und Inverse algebraisch zusammenpassen.
 *
 *   2. Renderer-Conformance
 *      Bekannte Kontrollmarker auf der Plate werden nach dem Crop im
 *      echten Preclip gemessen und gegen die durch M vorhergesagten
 *      Positionen geprüft. Erst das beweist, dass Remotion und
 *      Matrixvertrag dieselbe Rasterisierung verwenden.
 */

export type Point = readonly [number, number];

export interface PlateCropRect {
  /** Linke obere Ecke des quadratischen Crops in Plate-Pixeln. */
  x: number;
  y: number;
  /** Kantenlänge des Crops in Plate-Pixeln. */
  size: number;
  /** Quadratische Ausgabekantenlänge des Preclips in Pixeln (z. B. 720). */
  outputSize: number;
}

/**
 * Affine 2x3-Matrix, row-major: [a, b, tx, c, d, ty]
 *
 *   u = a*x + b*y + tx
 *   v = c*x + d*y + ty
 */
export type AffineMatrix = readonly [number, number, number, number, number, number];

export interface PreclipTransform {
  forward: AffineMatrix;
  inverse: AffineMatrix;
  crop: PlateCropRect;
  /** Skalierungsfaktoren Plate → Preclip. */
  scaleX: number;
  scaleY: number;
}

export class TransformContractError extends Error {
  readonly code = "transform_contract_failed" as const;
  readonly detail: Record<string, unknown>;
  constructor(message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "TransformContractError";
    this.detail = detail;
  }
}

/** Maximal zulässiger Roundtrip-Fehler in Plate-Pixeln. */
export const ROUNDTRIP_TOLERANCE_PX = 0.5;
/** Maximal zulässige Abweichung im Renderer-Conformance-Test, Preclip-Pixel. */
export const CONFORMANCE_TOLERANCE_PX = 1.5;

export function buildPreclipTransform(crop: PlateCropRect): PreclipTransform {
  const size = Number(crop.size);
  const outputSize = Number(crop.outputSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw new TransformContractError(`crop.size must be > 0, got ${String(crop.size)}`, { crop });
  }
  if (!Number.isFinite(outputSize) || outputSize <= 0) {
    throw new TransformContractError(`crop.outputSize must be > 0, got ${String(crop.outputSize)}`, { crop });
  }
  const x = Number(crop.x);
  const y = Number(crop.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TransformContractError("crop.x / crop.y must be finite", { crop });
  }

  // Quadratischer Crop auf quadratisches Ziel: kein Letterboxing, kein
  // Padding, ein einziger Skalierungsfaktor für beide Achsen.
  const s = outputSize / size;
  const forward: AffineMatrix = [s, 0, -x * s, 0, s, -y * s];
  const inverse: AffineMatrix = [1 / s, 0, x, 0, 1 / s, y];

  return {
    forward,
    inverse,
    crop: { x, y, size, outputSize },
    scaleX: s,
    scaleY: s,
  };
}

export function applyMatrix(m: AffineMatrix, p: Point): [number, number] {
  return [m[0] * p[0] + m[1] * p[1] + m[2], m[3] * p[0] + m[4] * p[1] + m[5]];
}

/** Plate-Pixel → Preclip-Pixel. */
export function plateToPreclip(t: PreclipTransform, p: Point): [number, number] {
  return applyMatrix(t.forward, p);
}

/** Preclip-Pixel → Plate-Pixel. */
export function preclipToPlate(t: PreclipTransform, p: Point): [number, number] {
  return applyMatrix(t.inverse, p);
}

export function plateRectToPreclip(
  t: PreclipTransform,
  rect: readonly [number, number, number, number],
): [number, number, number, number] {
  const a = plateToPreclip(t, [rect[0], rect[1]]);
  const b = plateToPreclip(t, [rect[2], rect[3]]);
  return [a[0], a[1], b[0], b[1]];
}

export interface RoundtripResult {
  ok: boolean;
  maxErrorPx: number;
  samples: Array<{ plate: [number, number]; preclip: [number, number]; back: [number, number]; errorPx: number }>;
}

/**
 * Test 1 — Roundtrip-Assertion. Notwendig, nicht hinreichend.
 */
export function assertRoundtrip(
  t: PreclipTransform,
  points: readonly Point[],
  tolerancePx = ROUNDTRIP_TOLERANCE_PX,
): RoundtripResult {
  const samples = points.map((p) => {
    const preclip = plateToPreclip(t, p);
    const back = preclipToPlate(t, preclip);
    return {
      plate: [p[0], p[1]] as [number, number],
      preclip,
      back,
      errorPx: Math.hypot(back[0] - p[0], back[1] - p[1]),
    };
  });
  const maxErrorPx = samples.reduce((m, s) => Math.max(m, s.errorPx), 0);
  return { ok: maxErrorPx < tolerancePx, maxErrorPx, samples };
}

export interface ConformanceMarker {
  /** Bekannte Position auf der Plate, in Plate-Pixeln. */
  plate: Point;
  /** Tatsächlich im gerenderten Preclip gemessene Position, in Preclip-Pixeln. */
  measuredPreclip: Point;
  label?: string;
}

export interface ConformanceResult {
  ok: boolean;
  maxErrorPx: number;
  /** Systematischer Versatz — deutet auf Padding/Origin-Fehler im Renderer. */
  meanOffset: [number, number];
  markers: Array<{ label: string; expected: [number, number]; measured: [number, number]; errorPx: number }>;
}

/**
 * Test 2 — Renderer-Conformance. Beweist, dass der tatsächlich gerenderte
 * Pixelraum der durch M vorhergesagten Projektion entspricht. Fängt genau
 * die Klasse von Fehlern, die der Roundtrip nicht sehen kann: object-fit
 * cover, zusätzliches Padding, falscher transform-origin, vertauschte
 * translate/scale-Reihenfolge, abweichende Rundung vor dem Resize.
 */
export function checkRendererConformance(
  t: PreclipTransform,
  markers: readonly ConformanceMarker[],
  tolerancePx = CONFORMANCE_TOLERANCE_PX,
): ConformanceResult {
  if (markers.length === 0) {
    return { ok: false, maxErrorPx: Infinity, meanOffset: [0, 0], markers: [] };
  }
  let sx = 0;
  let sy = 0;
  const rows = markers.map((m, i) => {
    const expected = plateToPreclip(t, m.plate);
    const measured: [number, number] = [m.measuredPreclip[0], m.measuredPreclip[1]];
    sx += measured[0] - expected[0];
    sy += measured[1] - expected[1];
    return {
      label: m.label ?? `marker_${i}`,
      expected,
      measured,
      errorPx: Math.hypot(measured[0] - expected[0], measured[1] - expected[1]),
    };
  });
  const maxErrorPx = rows.reduce((m, r) => Math.max(m, r.errorPx), 0);
  return {
    ok: maxErrorPx <= tolerancePx,
    maxErrorPx,
    meanOffset: [sx / markers.length, sy / markers.length],
    markers: rows,
  };
}

export interface PersistedTransform {
  crop_rect: { x: number; y: number; size: number; output_size: number };
  forward_matrix: number[];
  inverse_matrix: number[];
  /** Stabiler Fingerprint — T15 prüft damit, dass es dieselbe Geometrie reprojiziert. */
  geometry_fingerprint: string;
}

export function geometryFingerprint(t: PreclipTransform): string {
  const c = t.crop;
  return `v396:${Math.round(c.x)}:${Math.round(c.y)}:${Math.round(c.size)}:${Math.round(c.outputSize)}`;
}

export function persistTransform(t: PreclipTransform): PersistedTransform {
  return {
    crop_rect: { x: t.crop.x, y: t.crop.y, size: t.crop.size, output_size: t.crop.outputSize },
    forward_matrix: [...t.forward],
    inverse_matrix: [...t.inverse],
    geometry_fingerprint: geometryFingerprint(t),
  };
}
