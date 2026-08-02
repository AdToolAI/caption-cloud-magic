/**
 * compute-mouth-centered-crop.ts (Deno port, v247)
 *
 * 1:1 mirror of src/lib/composer/computeMouthCenteredCrop.ts kept as a
 * separate file so the edge-function bundler doesn't need to reach into
 * the React `src/` tree. Any change to the Node util MUST be mirrored
 * here and vice versa. Unit tests live next to the Node source; Deno
 * sanity tests live next to this file.
 *
 * Purpose: compute a square preclip crop centered on the mouth landmark
 * (falls back to face-bbox center) that guarantees face-share ≥ ~42%
 * of the preclip area so Sync.so doesn't silently no-op on tiny faces.
 */

export interface FaceGeometry {
  bbox: [number, number, number, number];
  center: [number, number];
  mouth?: [number, number];
}

export interface MouthCenteredCropInput {
  face: FaceGeometry;
  plateWidth: number;
  plateHeight: number;
  targetFaceShare?: number;
  minSize?: number;
  outputSize?: number;
}

export interface MouthCenteredCropResult {
  crop: { x: number; y: number; size: number; outputSize: number };
  anchor: "mouth" | "face_center";
  /** Area ratio (faceW*faceH / size²) — telemetry only. */
  faceShareInCrop: number;
  /**
   * v344.1 — LINEAR share: max(faceW, faceH) / cropSize. This is the metric
   * that correlates with Sync.so actually animating the mouth; the area
   * ratio penalises non-square faces and small `minSize`-widened crops.
   */
  faceSideShare: number;
  /** Longest face side in plate pixels. */
  faceSidePx: number;
  /** True when `minSize` (not the target share) determined the crop size. */
  minSizeWidened: boolean;
  mouthOffsetPx: number;
  clamped: boolean;
  /**
   * v360 — true when the requested anchor lay outside the face bbox and was
   * replaced by the bbox-derived mouth point (lower third). Belegter Fall:
   * Matthew (Szene 89c5e01c) — der Anker lag 18 px UNTER dem Kinn, der
   * 145-px-Crop begann dadurch auf Mundhöhe und schnitt Augen und Stirn ab.
   * Sync.so bekam ein halbes Gesicht und reichte den Clip unverändert durch.
   */
  anchorRepaired: boolean;
  /** v360 — true when the crop was grown/moved so the whole head fits in. */
  headContained: boolean;
  /** v393 — vertical mouth position inside the crop (0 = top, 1 = bottom). */
  mouthBandY: number;
  /** v393 — pixels between the mouth anchor and the lower crop edge. */
  mouthMarginBelowPx: number;
  /** v393 — mouth anchor lies inside the crop with usable margin. */
  mouthInsideCrop: boolean;
}


export function computeMouthCenteredCrop(
  input: MouthCenteredCropInput,
): MouthCenteredCropResult {
  const {
    face,
    plateWidth,
    plateHeight,
    targetFaceShare = 0.42,
    minSize = 96,
    outputSize = 720,
  } = input;

  if (plateWidth <= 0 || plateHeight <= 0) {
    throw new Error("computeMouthCenteredCrop: plate dimensions must be > 0");
  }
  if (targetFaceShare <= 0 || targetFaceShare >= 1) {
    throw new Error("computeMouthCenteredCrop: targetFaceShare must be in (0, 1)");
  }

  const [x1, y1, x2, y2] = face.bbox;
  const faceW = Math.max(1, x2 - x1);
  const faceH = Math.max(1, y2 - y1);
  const faceSide = Math.max(faceW, faceH);

  const idealSide = faceSide / Math.sqrt(targetFaceShare);
  const maxSide = Math.min(plateWidth, plateHeight);
  let size = Math.round(Math.min(maxSide, Math.max(minSize, idealSide)));

  // v360 — Anker-Plausibilität. Der übergebene Punkt (Detektor-Mund oder
  // Router-Koordinate) muss im Gesicht liegen. Liegt er darunter/daneben,
  // ist er unbrauchbar: der quadratische Crop wandert nach unten und
  // schneidet Augen und Stirn ab. Dann nehmen wir den aus der Bbox
  // abgeleiteten Mundpunkt (unteres Drittel).
  const derivedMouth: [number, number] = [
    Math.round((x1 + x2) / 2),
    Math.round(y1 + faceH * 0.72),
  ];
  const rawAnchor: [number, number] | null =
    Array.isArray(face.mouth) &&
      Number.isFinite(face.mouth[0]) &&
      Number.isFinite(face.mouth[1])
      ? [Number(face.mouth[0]), Number(face.mouth[1])]
      : Array.isArray(face.center) &&
          Number.isFinite(face.center[0]) &&
          Number.isFinite(face.center[1])
        ? [Number(face.center[0]), Number(face.center[1])]
        : null;
  const anchorInsideFace =
    rawAnchor !== null &&
    rawAnchor[0] >= x1 - faceW * 0.15 &&
    rawAnchor[0] <= x2 + faceW * 0.15 &&
    rawAnchor[1] >= y1 &&
    rawAnchor[1] <= y2 + faceH * 0.1;
  const anchorRepaired = !anchorInsideFace;
  const usingMouth =
    Array.isArray(face.mouth) &&
    Number.isFinite(face.mouth[0]) &&
    Number.isFinite(face.mouth[1]);
  const anchor: "mouth" | "face_center" = usingMouth ? "mouth" : "face_center";
  const [ax, ay] = anchorInsideFace ? (rawAnchor as [number, number]) : derivedMouth;

  let x = Math.round(ax - size / 2);
  let y = Math.round(ay - size / 2);

  const rawX = x;
  const rawY = y;
  x = Math.max(0, Math.min(plateWidth - size, x));
  y = Math.max(0, Math.min(plateHeight - size, y));

  const maxRoomAround = Math.min(
    ax * 2,
    (plateWidth - ax) * 2,
    ay * 2,
    (plateHeight - ay) * 2,
  );
  if (size > maxRoomAround && maxRoomAround >= minSize) {
    size = Math.round(maxRoomAround);
    x = Math.max(0, Math.min(plateWidth - size, Math.round(ax - size / 2)));
    y = Math.max(0, Math.min(plateHeight - size, Math.round(ay - size / 2)));
  }

  // ══════════════════════════════════════════════════════════════════
  // v393 — MUND-VORRANG-FRAMING (ersetzt das kopf-zentrierte Containment)
  //
  // Belegter Fehler (Szene 9eded574, Plate 1928x1076): das v360-Containment
  // setzte `y = needY1` (30 % über dem Scheitel). Dadurch lag der Mund am
  // UNTEREN Rand des Crops bzw. bei einer leicht zu hohen Bbox komplett
  // ausserhalb. Sync.so bekam Stirn + Augen ohne Mund und reichte den Clip
  // unveraendert durch ("Passthrough").
  //
  // Neue Regel, in dieser Reihenfolge:
  //   1. Groesse waechst, bis Kopf UND Mundrand hineinpassen (nie schieben).
  //   2. Position wird so gesetzt, dass der Mund bei ~58 % der Crop-Hoehe
  //      liegt — mit garantiertem Rand unter dem Mund.
  //   3. Wenn beides nicht gleichzeitig geht, gewinnt der MUND. Eine
  //      angeschnittene Stirn kostet nichts, ein fehlender Mund kostet
  //      den ganzen Lip-Sync.
  // ══════════════════════════════════════════════════════════════════
  const MOUTH_BAND = 0.62; // Ziel-Position des Mundes in der Crop-Hoehe
  const MOUTH_BAND_MAX = 0.72; // tiefste zulaessige Mundposition
  const MOUTH_MARGIN_BELOW = 0.18; // Mindestrand unter dem Mund (Anteil size)

  const needX1 = Math.max(0, x1 - faceW * 0.1);
  const needX2 = Math.min(plateWidth, x2 + faceW * 0.1);
  const needY1 = Math.max(0, y1 - faceH * 0.3);
  const needY2 = Math.min(plateHeight, y2 + faceH * 0.1);
  // Der Crop waechst nur so weit, dass Kopf UND Mundrand hineinpassen —
  // groesser waere unnoetiger Aufloesungsverlust auf dem Gesicht.
  const needSide = Math.ceil(
    Math.max(needX2 - needX1, needY2 - needY1, (ay - needY1) / MOUTH_BAND_MAX),
  );
  size = Math.round(Math.min(maxSide, Math.max(size, needSide)));

  // Position: Mund horizontal mittig, vertikal auf MOUTH_BAND.
  const framedCx = (needX1 + needX2) / 2;
  x = Math.max(0, Math.min(plateWidth - size, Math.round(framedCx - size / 2)));
  y = Math.max(0, Math.min(plateHeight - size, Math.round(ay - size * MOUTH_BAND)));

  // Stirn mitnehmen, solange der Mund dabei nicht unter MOUTH_BAND_MAX rutscht.
  if (y > needY1) {
    const lifted = Math.max(0, Math.round(needY1));
    if ((ay - lifted) / size <= MOUTH_BAND_MAX) y = lifted;
  }

  // Harte Mund-Garantie nach dem Clamping: der Mund darf nie naeher als
  // MOUTH_MARGIN_BELOW an den unteren Rand und nie ueber die Crop-Mitte.
  const minBottom = Math.ceil(ay + size * MOUTH_MARGIN_BELOW);
  if (y + size < minBottom) {
    y = Math.max(0, Math.min(plateHeight - size, minBottom - size));
  }
  if (y > ay - size * 0.4) {
    y = Math.max(0, Math.min(plateHeight - size, Math.round(ay - size * 0.4)));
  }


  const headContained =
    x <= needX1 + 1 && y <= needY1 + 1 && x + size >= needX2 - 1 && y + size >= needY2 - 1;

  const clamped = x !== rawX || y !== rawY;


  const cropArea = size * size;
  const faceArea = faceW * faceH;
  const faceShareInCrop = Math.min(1, faceArea / cropArea);
  const faceSideShare = Math.min(1, faceSide / Math.max(1, size));
  const minSizeWidened = minSize > idealSide && size >= minSize;
  const cropCx = x + size / 2;
  const cropCy = y + size / 2;
  const mouthOffsetPx = Math.round(Math.hypot(ax - cropCx, ay - cropCy));
  const mouthBandY = (ay - y) / Math.max(1, size);
  const mouthMarginBelowPx = Math.round(y + size - ay);
  const mouthInsideCrop =
    ax >= x && ax <= x + size && mouthBandY > 0.2 && mouthBandY < 0.9;

  return {
    crop: { x, y, size, outputSize },
    anchor,
    faceShareInCrop,
    faceSideShare,
    faceSidePx: faceSide,
    minSizeWidened,
    mouthOffsetPx,
    clamped,
    anchorRepaired,
    headContained,
    mouthBandY,
    mouthMarginBelowPx,
    mouthInsideCrop,
  };


}
