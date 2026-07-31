/**
 * plate-identity-split.ts — v329 Identity/Geometry-Split
 *
 * ── Warum es dieses Modul gibt ────────────────────────────────────────────
 * Bis v328 lagen zwei fundamental verschiedene Informationen in EINEM Feld
 * (`composer_scenes.dialog_shots.plate_identity`):
 *
 *   • IDENTITÄT  — „Slot 1 ist Character X"   → plate-UNABHÄNGIG
 *   • GEOMETRIE  — „Slot 1 hat bbox [..]"     → gilt für GENAU EIN Plate
 *
 * v325 („Plate-Invariant") verwirft die Geometrie, sobald sich `sourceClipUrl`
 * oder `dims` ändern — richtig. Dabei verlor die Live-Neudetektion aber jede
 * `characterId` auf den Face-Objekten (`resolvedCount: 0`), während der
 * v326-`assignmentLock` weiterhin existierte. Der v277-Lock-Zweig in
 * compose-dialog-segments sucht sein Gesicht über `face.characterId` — ein
 * Feld, das nach der Eviction garantiert leer ist. Ergebnis: der Lock griff
 * nie, es lief der `v183-unlabeled-fallback`, und in Kombination mit winzigen
 * Detektor-Boxen entstanden 128-px-Crops, die das Gesicht anschnitten →
 * Sync.so gab das Video unverändert zurück („kein Lip-Sync").
 *
 * Die Lösung ist strukturell, nicht kosmetisch: Identität und Geometrie sind
 * getrennte Objekte und werden AUSSCHLIESSLICH über den Slot-Index (row-major,
 * links→rechts — die einzige Größe, die beide Detektoren teilen) verbunden.
 * `face.characterId` ist damit ein ABGELEITETER Wert, nie mehr die Quelle.
 *
 * Damit ist der Zustand „Lock vorhanden, aber kein auflösbares Gesicht"
 * strukturell ausgeschlossen — nicht nur für den einen gemeldeten Fall.
 */

export const PLATE_IDENTITY_SPLIT_VERSION = "v329";

/** Plate-unabhängige Identität: Slot-Index → Character-ID. */
export interface PlateIdentityLock {
  /** Keys sind Slot-Indizes als String ("0", "1", …). */
  bySlot: Record<string, string>;
  /** Herkunft, z. B. "v277-anchor-rekognition" | "v326-geometry-rowmajor". */
  source: string;
  /** Anzahl gelockter Slots. */
  size: number;
}

/** Plate-gebundene Geometrie. Wird von v325 verworfen, sobald das Plate wechselt. */
export interface PlateGeometrySnapshot {
  faces: unknown[];
  dims?: { width: number; height: number } | null;
  sourceClipUrl?: string | null;
  detectedAt?: string | null;
}

const stripVariantPrefix = (id?: string | null): string =>
  String(id ?? "")
    .toLowerCase()
    .trim()
    .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");

/**
 * Liest die Identität aus einem persistierten `plate_identity`-Objekt.
 *
 * Unterstützt beide Formate:
 *   • v329:   { identity: { bySlot: {...}, source } }
 *   • Legacy: { assignmentLock: {...}, assignmentLockSource }
 *
 * Der Legacy-Reader bleibt dauerhaft: Bestandsszenen aus v242–v328 tragen
 * ihren Lock weiterhin unter `assignmentLock`.
 */
export function extractIdentityLock(raw: any): PlateIdentityLock | null {
  if (!raw || typeof raw !== "object") return null;

  const candidates: Array<{ obj: any; source: string }> = [
    { obj: raw?.identity?.bySlot, source: String(raw?.identity?.source ?? "v329-identity") },
    { obj: raw?.assignmentLock, source: String(raw?.assignmentLockSource ?? "legacy-assignment-lock") },
  ];

  for (const { obj, source } of candidates) {
    if (!obj || typeof obj !== "object") continue;
    const bySlot: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const slot = Number(k);
      const cid = stripVariantPrefix(v as string);
      if (!Number.isFinite(slot) || slot < 0) continue;
      if (!cid) continue;
      bySlot[String(Math.round(slot))] = cid;
    }
    const size = Object.keys(bySlot).length;
    if (size > 0) return { bySlot, source, size };
  }
  return null;
}

/**
 * Trägt die Identität über den SLOT-INDEX auf frisch detektierte Faces nach.
 *
 * Die Faces werden dafür visuell sortiert (row-major via `face.slot`, wie in
 * v242 festgelegt) und der Lock-Slot i auf das i-te sichtbare Gesicht
 * abgebildet. Bereits gesetzte `characterId`-Werte (z. B. aus einer
 * erfolgreichen Gemini-Auflösung) bleiben unangetastet, sofern
 * `overwrite === false`.
 *
 * Gibt zurück, wie viele Slots tatsächlich gebrückt wurden — der Aufrufer
 * loggt das als `lock_applied`.
 */
export function applyIdentityLockBySlot(
  map: { faces: Array<{ slot: number; characterId?: string | null; matchConfidence?: number }>; resolvedCount?: number },
  lock: PlateIdentityLock | null,
  opts: { overwrite?: boolean; confidence?: number } = {},
): { applied: number; resolvedCount: number; bridgedSlots: number[] } {
  const bridgedSlots: number[] = [];
  if (!map || !Array.isArray(map.faces) || map.faces.length === 0 || !lock) {
    return {
      applied: 0,
      resolvedCount: Array.isArray(map?.faces) ? map.faces.filter((f) => !!f.characterId).length : 0,
      bridgedSlots,
    };
  }

  const overwrite = opts.overwrite === true;
  const confidence = Number.isFinite(Number(opts.confidence)) ? Number(opts.confidence) : 0.8;

  // Visuelle Reihenfolge = Slot-Reihenfolge. Beide Detektoren (Rekognition und
  // der Gemini-Fallback) liefern `slot` bereits links→rechts sortiert; wir
  // sortieren defensiv nach, weil die Faces unterwegs umgeordnet werden können.
  const visual = [...map.faces].sort((a, b) => Number(a.slot ?? 0) - Number(b.slot ?? 0));

  let applied = 0;
  for (let visualIdx = 0; visualIdx < visual.length; visualIdx++) {
    const cid = lock.bySlot[String(visualIdx)];
    if (!cid) continue;
    const face = visual[visualIdx];
    if (!face) continue;
    if (face.characterId && !overwrite) continue;
    face.characterId = cid;
    if (!Number.isFinite(Number(face.matchConfidence))) {
      face.matchConfidence = confidence;
    }
    applied++;
    bridgedSlots.push(Number(face.slot ?? visualIdx));
  }

  // resolvedCount ist ein abgeleiteter Wert und MUSS nach jeder Mutation neu
  // berechnet werden — genau das wurde in v222 schon einmal schmerzhaft
  // gelernt (Szene 7d45c852: 4 gebrückte Faces, resolvedCount stand auf 0,
  // Pipeline fiel auf einen Full-Plate-Job zurück).
  const resolvedCount = map.faces.filter((f) => !!f.characterId).length;
  map.resolvedCount = resolvedCount;

  return { applied, resolvedCount, bridgedSlots };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometrie-Plausibilität
// ─────────────────────────────────────────────────────────────────────────────

export interface CropGeometryAssessment {
  /** Detektor-Box ist zu klein, um daraus einen brauchbaren Crop zu bauen. */
  suspicious: boolean;
  reason: "ok" | "box_too_small" | "no_bbox";
  /** Box-Breite in Prozent der Plate-Breite (0..1). */
  boxWidthPct: number;
  /** Box-Höhe in Prozent der Plate-Höhe (0..1). */
  boxHeightPct: number;
  /**
   * Mindest-Crop-Kantenlänge in Plate-Pixeln. Bei plausibler Geometrie ein
   * kleiner Sicherheitswert, bei unplausibler Geometrie ein PLATE-PROPORTIONALES
   * Fenster (≈ 26 % der Plate-Höhe, min. 288 px), damit der Kopf garantiert
   * vollständig im Crop liegt statt am Rand abgeschnitten zu werden.
   */
  minCropSize: number;
}

/**
 * Bewertet, ob eine Detektor-Box groß genug ist, um daraus einen Preclip-Crop
 * abzuleiten.
 *
 * Hintergrund: AWS Rekognition hat auf kleinen Köpfen (Totale, Gruppenshot)
 * eine harte Auflösungsgrenze und liefert dann Boxen, die deutlich kleiner
 * sind als der tatsächliche Kopf. Ein daraus abgeleiteter Crop schneidet
 * Stirn/Kinn ab. Der frühere feste `minSize: 128` hat das nicht abgefangen,
 * sondern zementiert: bei einer 47×63-Box auf 1284×718 entstand ein 128-px-
 * Crop mit 18 % Face-Share — genau der Zustand, in dem Sync.so das Video
 * unverändert zurückgibt.
 */
export function assessCropGeometry(params: {
  bbox?: [number, number, number, number] | number[] | null;
  plateWidth: number;
  plateHeight: number;
  /** Untergrenze für plausible Box-Breite, relativ zur Plate-Breite. */
  minBoxWidthPct?: number;
}): CropGeometryAssessment {
  const W = Math.max(1, Number(params.plateWidth) || 1);
  const H = Math.max(1, Number(params.plateHeight) || 1);
  const minPct = Number.isFinite(Number(params.minBoxWidthPct))
    ? Number(params.minBoxWidthPct)
    : 0.035;

  // Plate-proportionales Rettungsfenster: 26 % der Plate-Höhe, mindestens
  // 288 px, aber nie größer als die kürzere Plate-Kante.
  const proportionalMin = Math.min(
    Math.min(W, H),
    Math.max(288, Math.round(H * 0.26)),
  );

  const bbox = params.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((n) => Number.isFinite(Number(n)))) {
    return {
      suspicious: true,
      reason: "no_bbox",
      boxWidthPct: 0,
      boxHeightPct: 0,
      minCropSize: proportionalMin,
    };
  }

  const bw = Math.max(0, Number(bbox[2]) - Number(bbox[0]));
  const bh = Math.max(0, Number(bbox[3]) - Number(bbox[1]));
  const boxWidthPct = bw / W;
  const boxHeightPct = bh / H;

  if (boxWidthPct < minPct) {
    return {
      suspicious: true,
      reason: "box_too_small",
      boxWidthPct,
      boxHeightPct,
      minCropSize: proportionalMin,
    };
  }

  return {
    suspicious: false,
    reason: "ok",
    boxWidthPct,
    boxHeightPct,
    // Plausible Geometrie: konservative Untergrenze, damit sehr enge Crops
    // trotzdem über der 480p-Empfehlung von Sync.so landen können.
    minCropSize: Math.min(Math.min(W, H), 256),
  };
}
