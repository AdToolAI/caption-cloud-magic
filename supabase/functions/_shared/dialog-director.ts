/**
 * dialog-director.ts (v357) — Regie-Entscheidung statt Blocker.
 * ============================================================
 * v344–v355 haben versucht, schlechte Lip-Sync-Ergebnisse durch immer neue
 * Geometrie-Sperren zu verhindern. Das Ergebnis waren abgebrochene Szenen
 * bei Konstellationen, die am 27.07.2026 nachweislich funktioniert haben.
 *
 * Dieses Modul dreht die Logik um: Gesichtsgröße auf dem Anchor entscheidet
 * NICHT über "läuft / läuft nicht", sondern über die BILDREGIE:
 *
 *   Modus A  group_shot  — alle Gesichter groß genug → wie bisher
 *   Modus B  punch_in    — grenzwertig → während des Turns näher heran
 *   Modus C  coverage    — zu klein → Totale + engere Einstellungen
 *
 * Es gibt bewusst KEINEN Ausgang "Szene fehlgeschlagen". Der einzige harte
 * Guard bleibt das Bewegungs-Verdikt NACH dem Lauf (mouth-motion-verdict).
 */

export const DIALOG_DIRECTOR_TAG = "v357-dialog-director";

export type DialogMode = "group_shot" | "punch_in" | "coverage";

/** Zielgröße, ab der Sync.so zuverlässig Mundbewegung erzeugt (native px). */
export const TARGET_FACE_WIDTH_PX = 220;
/** Darunter reicht das Bildmaterial für einen reinen Gruppenshot nicht mehr. */
export const COMFORT_FACE_WIDTH_PX = 150;
/**
 * Maximaler digitaler Zoom, der auf einer nativen Plate noch echte
 * Munddetails liefert. Darüber vergrößern wir nur Interpolationsmatsch —
 * genau der Fall, an dem Szene 89c5e01c (Kailee, 94px) gescheitert ist.
 */
export const PUNCH_IN_MAX_ZOOM = 2.0;
/** Darunter hilft auch ein digitaler Punch-in nicht mehr → Coverage. */
export const PUNCH_IN_FLOOR_PX = Math.ceil(TARGET_FACE_WIDTH_PX / PUNCH_IN_MAX_ZOOM);

export interface DirectorFace {
  bbox: [number, number, number, number];
}

export interface DirectorInput {
  faces: DirectorFace[];
  /** Pixelraum der übergebenen Boxen. */
  plateWidth: number;
  plateHeight: number;
  /** Native Breite der später gerenderten Plate (z. B. 1920). */
  nativePlateWidth: number;
  expectedSpeakers: number;
}

export interface DirectorDecision {
  mode: DialogMode;
  /** Kleinste Gesichtsbreite, hochgerechnet auf die native Plate. */
  minFaceWidthPx: number;
  /** Nötiger digitaler Zoom, damit das kleinste Gesicht das Ziel erreicht. */
  punchInZoom: number;
  reason: string;
  /** Prompt-Zusatz für den nächsten Anchor-Versuch (leer bei Modus A). */
  framingSuffix: string;
  /** Menschlich lesbare Begründung fürs Log / die Telemetrie. */
  note: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function decideDialogMode(input: DirectorInput): DirectorDecision {
  const n = Math.max(1, Math.round(input.expectedSpeakers || input.faces.length || 1));
  const plateW = Math.max(1, input.plateWidth);
  const nativeW = Math.max(1, input.nativePlateWidth || plateW);
  const scale = nativeW / plateW;

  const widths = input.faces
    .map((f) => Math.max(0, f.bbox[2] - f.bbox[0]) * scale)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);

  if (widths.length === 0) {
    return {
      mode: "coverage",
      minFaceWidthPx: 0,
      punchInZoom: 1,
      reason: "no_faces_detected",
      framingSuffix: coverageSuffix(n),
      note: "Auf dem Anchor wurde kein Gesicht erkannt — Dialog wird in engeren Einstellungen produziert.",
    };
  }

  const minFaceWidthPx = Math.round(widths[0]);
  const punchInZoom = round2(Math.min(PUNCH_IN_MAX_ZOOM, TARGET_FACE_WIDTH_PX / Math.max(1, minFaceWidthPx)));

  if (minFaceWidthPx >= COMFORT_FACE_WIDTH_PX) {
    return {
      mode: "group_shot",
      minFaceWidthPx,
      punchInZoom: 1,
      reason: "faces_large_enough",
      framingSuffix: "",
      note: `Gruppen-Dialogshot: kleinstes Gesicht ${minFaceWidthPx}px.`,
    };
  }

  if (minFaceWidthPx >= PUNCH_IN_FLOOR_PX) {
    return {
      mode: "punch_in",
      minFaceWidthPx,
      punchInZoom,
      reason: "borderline_face_size",
      framingSuffix: punchInSuffix(n),
      note: `Punch-in auf den Sprecher (Faktor ${punchInZoom}×): kleinstes Gesicht ${minFaceWidthPx}px.`,
    };
  }

  return {
    mode: "coverage",
    minFaceWidthPx,
    punchInZoom,
    reason: "faces_too_small_for_punch_in",
    framingSuffix: coverageSuffix(n),
    note: `Coverage-Modus: kleinstes Gesicht nur ${minFaceWidthPx}px — Dialog wird in engeren Einstellungen produziert.`,
  };
}

function punchInSuffix(n: number): string {
  return (
    "\n[FRAMING] Compose as a MEDIUM DIALOGUE SHOT: bring the camera closer so " +
    `each of the ${n} subjects is framed chest-up and clearly readable. ` +
    "Faces must be large and unobstructed, mouths fully visible. " +
    "No wide establishing framing, no full-body shots, no distant camera."
  );
}

function coverageSuffix(n: number): string {
  return (
    "\n[FRAMING] Compose as a CLOSE DIALOGUE SHOT: at most two subjects share the " +
    "frame, framed head-and-shoulders, each face occupying a large part of the " +
    "frame height with the mouth clearly visible. " +
    `Do not fit all ${n} subjects into one wide frame. ` +
    "No establishing shot, no distant camera, no full-body framing."
  );
}

/** Kurztext für die Oberfläche — nie technisch, nie als Fehler formuliert. */
export function directorLabel(mode: DialogMode): string {
  switch (mode) {
    case "group_shot": return "Gruppen-Dialogshot";
    case "punch_in": return "Automatischer Punch-in";
    case "coverage": return "Coverage – engere Einstellungen";
  }
}
