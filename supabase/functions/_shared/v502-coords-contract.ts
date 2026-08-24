/**
 * V502 — Coords ↔ Crop Contract.
 *
 * Beleg (Szene be60d106, S01): `pass.coords` ist ein LEGACY-Plate-Punkt aus der
 * Sprecher-Zuordnung. Die tatsächlich dispatchte Geometrie stammt seit V456/V457
 * aus `preclip_crop` (+ `preclip_mouth_offset_xy`). Beide Räume sind seither
 * nicht mehr gekoppelt: Pass 0 trug `coords=[177,272]` bei `crop={203,157,187}`
 * — 26 px ausserhalb des eigenen Crops.
 *
 * Für `bbox-url-pro` (Regelpfad) ist das reine Telemetrie: die ASD reist als
 * per-Frame `bounding_boxes_url`. Für die Coords-Varianten (`coords-pro`,
 * `sync3-coords`, `coords-pro-lp2pro`) wandert der Punkt jedoch tatsächlich in
 * den Provider-Payload — und dann muss er im Raum des DISPATCHTEN Videos
 * liegen, nicht im Plate-Raum.
 *
 * Dieses Modul liefert genau eine Projektion und genau eine Klassifikation.
 * Es verändert weder Crop-Geometrie noch Gates noch Schwellenwerte.
 */

export type V502Crop = {
  x: number;
  y: number;
  size: number;
  outputSize?: number | null;
};

export type V502Point = [number, number];

export type V502CoordsContract = {
  /** Plate-Punkt, der die Crop-Geometrie tatsächlich trägt. */
  anchorPlate: V502Point | null;
  /** Derselbe Punkt im Clip-Raum des Preclips (0..outputSize). */
  anchorClip: V502Point | null;
  /** Liegt der persistierte `pass.coords` in seinem eigenen Crop? */
  legacyInsideCrop: boolean;
  /** Abstand des Legacy-Punkts zur Crop-Box in Plate-Pixeln (0 = innen). */
  legacyOutsidePx: number;
  /** Woraus der Anker abgeleitet wurde. */
  source: "mouth_offset" | "crop_center" | "legacy_coords" | "none";
  /** Kurzcode für Telemetrie/Logs. */
  reason: string;
};

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isValidCrop(crop: unknown): crop is V502Crop {
  const c = crop as V502Crop | null;
  if (!c || typeof c !== "object") return false;
  return (
    finite(c.x) !== null &&
    finite(c.y) !== null &&
    finite(c.size) !== null &&
    Number(c.size) > 0
  );
}

/** Distanz eines Punktes zur Crop-Box in Plate-Pixeln (0 = innerhalb). */
export function distanceOutsideCrop(point: V502Point, crop: V502Crop): number {
  const x0 = Number(crop.x);
  const y0 = Number(crop.y);
  const x1 = x0 + Number(crop.size);
  const y1 = y0 + Number(crop.size);
  const dx = Math.max(x0 - point[0], 0, point[0] - x1);
  const dy = Math.max(y0 - point[1], 0, point[1] - y1);
  return Math.round(Math.hypot(dx, dy));
}

/**
 * Projiziert einen Plate-Punkt in den Clip-Raum des Preclips:
 *   x_clip = (x_plate - crop.x) * outputSize / crop.size
 * Gibt `null` zurück, wenn der Punkt ausserhalb des Crops liegt — es wird
 * NICHT geklemmt, weil ein geklemmter Punkt eine falsche Sicherheit vortäuscht.
 */
export function projectPlatePointToClip(
  point: V502Point,
  crop: V502Crop,
): V502Point | null {
  if (!isValidCrop(crop)) return null;
  const px = finite(point?.[0]);
  const py = finite(point?.[1]);
  if (px === null || py === null) return null;
  if (distanceOutsideCrop([px, py], crop) > 0) return null;
  const out = Number(crop.outputSize ?? 720) || 720;
  const k = out / Number(crop.size);
  return [
    Math.max(1, Math.round((px - Number(crop.x)) * k)),
    Math.max(1, Math.round((py - Number(crop.y)) * k)),
  ];
}

/**
 * Leitet den dispatchfähigen Anker aus DEMSELBEN Crop-Transform ab, aus dem der
 * Preclip gerendert wurde. Priorität:
 *   1. Crop-Mitte + signierter Mund-Offset (V458, Plate-Pixel)
 *   2. Crop-Mitte
 *   3. Legacy-`coords`, aber nur wenn sie im Crop liegen
 */
export function resolveCoordsContract(input: {
  crop: unknown;
  legacyCoords?: [number, number] | null;
  mouthOffsetXy?: { dx: number; dy: number } | null;
}): V502CoordsContract {
  const crop = input.crop;
  if (!isValidCrop(crop)) {
    return {
      anchorPlate: null,
      anchorClip: null,
      legacyInsideCrop: false,
      legacyOutsidePx: 0,
      source: "none",
      reason: "no_crop",
    };
  }

  const legacyX = finite(input.legacyCoords?.[0]);
  const legacyY = finite(input.legacyCoords?.[1]);
  const legacy: V502Point | null =
    legacyX !== null && legacyY !== null ? [legacyX, legacyY] : null;
  const legacyOutsidePx = legacy ? distanceOutsideCrop(legacy, crop) : 0;
  const legacyInsideCrop = !!legacy && legacyOutsidePx === 0;

  const cx = Number(crop.x) + Number(crop.size) / 2;
  const cy = Number(crop.y) + Number(crop.size) / 2;

  const dx = finite(input.mouthOffsetXy?.dx);
  const dy = finite(input.mouthOffsetXy?.dy);

  let anchorPlate: V502Point;
  let source: V502CoordsContract["source"];
  if (dx !== null && dy !== null) {
    anchorPlate = [Math.round(cx + dx), Math.round(cy + dy)];
    source = "mouth_offset";
  } else {
    anchorPlate = [Math.round(cx), Math.round(cy)];
    source = "crop_center";
  }

  // Ein Mund-Offset, der aus dem eigenen Crop herausführt, ist unbrauchbar —
  // dann gilt die Crop-Mitte, die per Konstruktion immer innen liegt.
  if (distanceOutsideCrop(anchorPlate, crop) > 0) {
    anchorPlate = [Math.round(cx), Math.round(cy)];
    source = "crop_center";
  }

  return {
    anchorPlate,
    anchorClip: projectPlatePointToClip(anchorPlate, crop),
    legacyInsideCrop,
    legacyOutsidePx,
    source,
    reason: legacyInsideCrop ? "legacy_consistent" : "legacy_out_of_crop",
  };
}
