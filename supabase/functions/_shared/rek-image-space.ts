/**
 * rek-image-space.ts (v361) — Koordinatenvertrag für AWS-Rekognition-Boxen.
 * ==========================================================================
 *
 * ## Warum es das gibt
 *
 * Rekognition liefert `BoundingBox` IMMER normalisiert (0..1) relativ zu dem
 * Bild, dessen Bytes gesendet wurden. Bis v360 haben zwei Call-Sites
 * (`identifyFacesInFrame` in `rekognition-face-collection.ts` und
 * `routePlateFacesToAnchor` in `plateFaceSlotRouter.ts`) die Bytes des
 * **Anchor-Stills** geschickt, die normalisierten Werte aber mit den
 * **Plate-Video-Dimensionen** multipliziert:
 *
 * ```
 * identifyFacesInFrame({ frameUrl: anchorUrl,          // 1024x1024 (Beispiel)
 *                        frameWidth: plateDims.width,  // 1928
 *                        frameHeight: plateDims.height })  // 1076
 * ```
 *
 * Ergebnis: jede Box landete systematisch verschoben und in der Höhe
 * gestaucht auf der Plate. Forensisch belegt an Szene 89c5e01c (01.08.2026):
 * keine einzige gespeicherte Box lag auf einem Gesicht, die Preclips zeigten
 * Drucker, Fensterrahmen und Schultern — Sync.so konnte nichts animieren und
 * gab das Video unverändert zurück ("Passthrough").
 *
 * ## Der Vertrag
 *
 * 1. Detektiert wird immer im Raum des tatsächlich gesendeten Bildes.
 *    Die Dimensionen kommen aus den Bytes (`probeImageDims`), nicht vom
 *    Aufrufer.
 * 2. Boxen werden zusätzlich normalisiert transportiert (`normBbox`).
 * 3. Eine Projektion in einen anderen Raum ist eine EXPLIZITE Operation
 *    (`projectNormBox`) und protokolliert Seitenverhältnis-Abweichungen.
 */

export interface ImageDims {
  width: number;
  height: number;
}

/** Normalisierte Box [left, top, right, bottom] in 0..1. */
export type NormBox = [number, number, number, number];
/** Pixel-Box [x1, y1, x2, y2]. */
export type PixelBox = [number, number, number, number];

/**
 * Liest die Bilddimensionen direkt aus den Bytes.
 * Unterstützt PNG, JPEG, GIF und WebP (VP8/VP8L/VP8X) — alles, was
 * Rekognition bzw. unsere Storage-Buckets liefern.
 */
export function probeImageDims(bytes: Uint8Array): ImageDims | null {
  try {
    if (bytes.length < 16) return null;

    // PNG — IHDR width/height als big-endian uint32 an Offset 16/20.
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const w = dv.getUint32(16);
      const h = dv.getUint32(20);
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }

    // GIF — little-endian uint16 an Offset 6/8.
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      const w = bytes[6] | (bytes[7] << 8);
      const h = bytes[8] | (bytes[9] << 8);
      return w > 0 && h > 0 ? { width: w, height: h } : null;
    }

    // WebP — RIFF....WEBP
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (fourcc === "VP8 ") {
        const w = ((bytes[26] | (bytes[27] << 8)) & 0x3fff);
        const h = ((bytes[28] | (bytes[29] << 8)) & 0x3fff);
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
      if (fourcc === "VP8L") {
        const b = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
        const w = (b & 0x3fff) + 1;
        const h = ((b >>> 14) & 0x3fff) + 1;
        return { width: w, height: h };
      }
      if (fourcc === "VP8X") {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width: w, height: h };
      }
      return null;
    }

    // JPEG — erster SOF0..SOF3-Marker.
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i < bytes.length - 9) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        // Standalone-Marker ohne Länge.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const h = (bytes[i + 5] << 8) | bytes[i + 6];
          const w = (bytes[i + 7] << 8) | bytes[i + 8];
          return w > 0 && h > 0 ? { width: w, height: h } : null;
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) return null;
        i += 2 + segLen;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Rekognition-Rohbox → normalisierte [l, t, r, b]. */
export function rekBoxToNorm(bb: { Left?: number; Top?: number; Width?: number; Height?: number }): NormBox | null {
  const l = Number(bb?.Left ?? NaN);
  const t = Number(bb?.Top ?? NaN);
  const w = Number(bb?.Width ?? NaN);
  const h = Number(bb?.Height ?? NaN);
  if (![l, t, w, h].every((n) => Number.isFinite(n))) return null;
  if (!(w > 0 && h > 0)) return null;
  return [l, t, l + w, t + h];
}

/** Normalisierte Box → Pixel im angegebenen Raum (mit Clamping). */
export function normToPixels(box: NormBox, dims: ImageDims): PixelBox {
  const W = Math.max(1, Math.round(dims.width));
  const H = Math.max(1, Math.round(dims.height));
  const clampX = (v: number) => Math.max(0, Math.min(W, Math.round(v * W)));
  const clampY = (v: number) => Math.max(0, Math.min(H, Math.round(v * H)));
  return [clampX(box[0]), clampY(box[1]), clampX(box[2]), clampY(box[3])];
}

export interface ProjectionReport {
  /** True, wenn Quell- und Zielraum dasselbe Seitenverhältnis haben (±2 %). */
  aspectMatch: boolean;
  sourceAspect: number;
  targetAspect: number;
}

export function compareAspect(source: ImageDims, target: ImageDims): ProjectionReport {
  const sa = source.width / Math.max(1, source.height);
  const ta = target.width / Math.max(1, target.height);
  const rel = Math.abs(sa - ta) / Math.max(sa, ta);
  return { aspectMatch: rel <= 0.02, sourceAspect: sa, targetAspect: ta };
}

/**
 * Projiziert eine im Quellbild detektierte Box in einen Zielraum.
 *
 * Bei gleichem Seitenverhältnis ist das eine reine Skalierung. Bei
 * abweichendem Seitenverhältnis wird `contain`-Semantik angenommen (das
 * Quellbild wurde vollständig sichtbar in den Zielrahmen eingepasst) — das
 * ist die Annahme, die Bild-zu-Video-Modelle beim Referenzbild treffen. Der
 * Aufrufer bekommt über `ProjectionReport` mitgeteilt, dass eine Annahme im
 * Spiel war, und kann die Projektion ablehnen.
 */
export function projectNormBox(
  box: NormBox,
  source: ImageDims,
  target: ImageDims,
): { pixels: PixelBox; report: ProjectionReport } {
  const report = compareAspect(source, target);
  if (report.aspectMatch) {
    return { pixels: normToPixels(box, target), report };
  }
  // contain: Quellbild vollständig eingepasst, Rest ist Rand.
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const drawnW = source.width * scale;
  const drawnH = source.height * scale;
  const offX = (target.width - drawnW) / 2;
  const offY = (target.height - drawnH) / 2;
  const px = (v: number) => Math.max(0, Math.min(target.width, Math.round(offX + v * drawnW)));
  const py = (v: number) => Math.max(0, Math.min(target.height, Math.round(offY + v * drawnH)));
  return { pixels: [px(box[0]), py(box[1]), px(box[2]), py(box[3])], report };
}

/**
 * Plausibilitätsprüfung für eine Gesichtsbox (v361, Schritt 3 des Plans).
 * Ersetzt KEINE Mindestgrößen-Gates für Lip-Sync (v356 bleibt gültig) —
 * sie verwirft nur physikalisch unmögliche Boxen, wie sie aus einer
 * kaputten Rücktransformation entstehen.
 */
export function isPlausibleFaceBox(box: PixelBox, dims: ImageDims): boolean {
  const w = box[2] - box[0];
  const h = box[3] - box[1];
  if (!(w > 0 && h > 0)) return false;
  const relW = w / Math.max(1, dims.width);
  if (relW < 0.01 || relW > 0.6) return false;
  const ratio = w / h;
  if (ratio < 0.4 || ratio > 1.8) return false;
  return true;
}
