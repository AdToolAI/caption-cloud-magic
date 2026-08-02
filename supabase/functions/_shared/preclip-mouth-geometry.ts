/**
 * preclip-mouth-geometry.ts — v393
 *
 * Warum es das gibt
 * ─────────────────────────────────────────────────────────────────────────
 * Belegter Fehlerfall (Szene 9eded574, Overlay-Beweis vom aktuellen Run):
 * Die Preclips enthielten Stirn und Augen, aber KEINEN Mund. Sync.so kann
 * darauf nichts animieren und gibt das Eingangsvideo unveraendert zurueck
 * ("Passthrough"). Der Fehler wurde erst NACH dem Provider-Lauf sichtbar —
 * also nachdem Zeit und Credits verbraucht waren.
 *
 * Dieses Modul misst die Mundgeometrie auf genau dem Bild, das dispatcht
 * wird, und liefert zwei Dinge:
 *
 *   1. ein Urteil VOR dem Dispatch (Mund vorhanden? weit genug vom Rand?)
 *   2. `mouthCenter` / `mouthRect` in Pixeln des dispatchten Clips —
 *      die Messfenster, mit denen die spaetere Passthrough-Bewertung
 *      arbeitet, statt eines generischen Grossbereichs.
 *
 * Reine Geometrie, keine Netzwerkaufrufe: der Aufrufer liefert die bereits
 * erkannten Gesichter (AWS Rekognition Landmarks) und die Bildgroesse.
 */

export type PreclipMouthCode =
  | "ok"
  | "mouth_missing"
  | "mouth_at_edge"
  | "no_face";

export interface PreclipFaceLandmarks {
  bbox: [number, number, number, number];
  center: [number, number];
  landmarks?: {
    mouth?: [number, number];
    mouthLeft?: [number, number];
    mouthRight?: [number, number];
    mouthUp?: [number, number];
    mouthDown?: [number, number];
  };
}

export interface PreclipMouthGeometry {
  ok: boolean;
  code: PreclipMouthCode;
  reason?: string;
  /** Mundmittelpunkt in Clip-Pixeln. */
  mouthCenter?: [number, number];
  /** Messfenster um den Mund [x1, y1, x2, y2] in Clip-Pixeln. */
  mouthRect?: [number, number, number, number];
  /** Kontrollfenster (Stirn) fuer die Rausch-Normalisierung. */
  controlRect?: [number, number, number, number];
  /** Vertikale Mundposition im Bild (0 = oben, 1 = unten). */
  bandY?: number;
  /** Kleinster Abstand des Mundfensters zu einer Bildkante, in Pixeln. */
  edgeMarginPx?: number;
  /** true, wenn der Mundpunkt aus der Bbox abgeleitet wurde. */
  derived?: boolean;
}

/** Der Mund muss mindestens so weit (Anteil der kurzen Bildkante) vom Rand weg sein. */
export const MIN_EDGE_MARGIN_RATIO = 0.04;
/** Halbe Kantenlaenge des Messfensters, relativ zur Gesichtsbreite. */
export const MOUTH_RECT_RATIO = 0.28;

function clampRect(
  r: [number, number, number, number],
  w: number,
  h: number,
): [number, number, number, number] {
  return [
    Math.max(0, Math.round(r[0])),
    Math.max(0, Math.round(r[1])),
    Math.min(w, Math.round(r[2])),
    Math.min(h, Math.round(r[3])),
  ];
}

/**
 * Groesstes Gesicht auswaehlen und dessen Mundgeometrie bewerten.
 */
export function measurePreclipMouth(params: {
  faces: PreclipFaceLandmarks[];
  width: number;
  height: number;
}): PreclipMouthGeometry {
  const { faces, width, height } = params;
  if (!Array.isArray(faces) || faces.length === 0) {
    return { ok: false, code: "no_face", reason: "no face detected on the dispatched frame" };
  }
  if (!(width > 0) || !(height > 0)) {
    return { ok: false, code: "no_face", reason: "invalid frame dimensions" };
  }

  // Groesstes Gesicht = das Ziel des Preclips.
  const face = [...faces].sort(
    (a, b) =>
      (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) -
      (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]),
  )[0];

  const [x1, y1, x2, y2] = face.bbox;
  const faceW = Math.max(1, x2 - x1);
  const faceH = Math.max(1, y2 - y1);

  const lm = face.landmarks ?? {};
  const corners =
    lm.mouthLeft && lm.mouthRight
      ? ([
          (lm.mouthLeft[0] + lm.mouthRight[0]) / 2,
          (lm.mouthLeft[1] + lm.mouthRight[1]) / 2,
        ] as [number, number])
      : null;
  const detected = corners ?? (lm.mouth ? ([lm.mouth[0], lm.mouth[1]] as [number, number]) : null);
  const derived = detected === null;
  const mouth: [number, number] = detected ?? [
    Math.round((x1 + x2) / 2),
    Math.round(y1 + faceH * 0.72),
  ];

  const half = Math.max(8, Math.round(faceW * MOUTH_RECT_RATIO));
  const rawRect: [number, number, number, number] = [
    mouth[0] - half,
    mouth[1] - half * 0.7,
    mouth[0] + half,
    mouth[1] + half * 0.7,
  ];
  const mouthRect = clampRect(rawRect, width, height);

  // Kontrollband: Stirn — gleiche Breite, oberhalb der Augenpartie. Es misst
  // ausschliesslich Encoder-Rauschen und globale Bewegung, nie Sprechbewegung.
  const controlRect = clampRect(
    [x1 + faceW * 0.2, y1 + faceH * 0.05, x2 - faceW * 0.2, y1 + faceH * 0.22],
    width,
    height,
  );

  const bandY = mouth[1] / height;
  const edgeMarginPx = Math.round(
    Math.min(rawRect[0], rawRect[1], width - rawRect[2], height - rawRect[3]),
  );
  const minMargin = Math.round(Math.min(width, height) * MIN_EDGE_MARGIN_RATIO);

  // Mund komplett ausserhalb des Bildes → Sync.so hat nichts zu animieren.
  if (mouth[0] < 0 || mouth[0] > width || mouth[1] < 0 || mouth[1] > height) {
    return {
      ok: false,
      code: "mouth_missing",
      reason: `mouth at [${Math.round(mouth[0])},${Math.round(mouth[1])}] lies outside the ${width}x${height} clip`,
      mouthCenter: mouth,
      bandY,
      edgeMarginPx,
      derived,
    };
  }

  if (edgeMarginPx < minMargin) {
    return {
      ok: false,
      code: "mouth_at_edge",
      reason: `mouth window is only ${edgeMarginPx}px from the clip edge (needs ${minMargin}px) — the provider loses the lips as soon as the head moves`,
      mouthCenter: mouth,
      mouthRect,
      controlRect,
      bandY,
      edgeMarginPx,
      derived,
    };
  }

  return {
    ok: true,
    code: "ok",
    mouthCenter: mouth,
    mouthRect,
    controlRect,
    bandY,
    edgeMarginPx,
    derived,
  };
}
