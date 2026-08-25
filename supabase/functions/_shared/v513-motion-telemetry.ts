/**
 * V513-T0 — BEWEGUNGS-TELEMETRIE AUS DER BESTEHENDEN N=6-SPUR (PURE)
 * ---------------------------------------------------------------------------
 * SHADOW ONLY. Reine Telemetrie mit NULL Verhaltenskonsumenten.
 *
 * Dieses Modul entscheidet nichts. Es gated kein Sampling, aendert weder
 * Kamerapfad noch Crop noch ASD noch Sync.so-Payload noch ROI/Verdict, loest
 * keine Retries aus und beruehrt weder NOOP-Verhalten noch Refund, Recovery
 * oder Watchdog. Es aendert weder Anzahl noch Zeitpunkt eines Provider-Calls.
 *
 * ── Warum es existiert ─────────────────────────────────────────────────────
 *
 * Die Materialitaetsfrage — ab wann lohnen zusaetzliche Track-Messungen —
 * laesst sich nicht aus zwei handverlesenen Referenzszenen beantworten. Es
 * braucht die Verteilung ueber echte Produktions-Turns.
 *
 * Diese Information wird bereits gemessen: `v477PreTrack` entsteht fuer jeden
 * Pass mit Plate-Box, VOR dem Preclip, und wird von `buildCameraPath` nur
 * wiederverwendet ("No second Rekognition pass"). Bisher wurde sie fuer viele
 * Passes verworfen, weil `preclip_face_track` ausschliesslich INNERHALB des
 * Fresh-Dispatch-Callbacks persistiert wird.
 *
 * ── Kosten ─────────────────────────────────────────────────────────────────
 *
 * NULL zusaetzliche Lambda- oder Rekognition-Calls. Eine reine Funktion ueber
 * bereits gemessene Punkte. Kein zusaetzlicher DB-Write: das Ergebnis haengt am
 * `pass`-Objekt und faehrt auf der bestehenden `update_dialog_pass_slot`-RPC
 * mit, die den gesamten Pass spreizt.
 *
 * ── Ausdrueckliche Nicht-Ziele ─────────────────────────────────────────────
 *
 * Kein Score. Keine Klassifikation. Kein Schwellenwert. Kein `moving: true`.
 * Die zweite Differenz ist DIAGNOSTIK, kein Materialitaetssignal: zwei reale
 * bewegungsarme Screens zeigten sie gross im Verhaeltnis zur gemessenen
 * Gesamtbahn (Matthew 14.2 px auf ~20 px Bahn; dd776 7.4 px auf 11.6 px).
 *
 * Die Telemetrie darf NIE Autoritaet fuer Identitaet oder Geometrie werden.
 *
 * ── Definitionsgleichheit ──────────────────────────────────────────────────
 *
 * Dies ist die EINE Definition der Bewegungsmerkmale. Die Offline-Werkzeuge
 * (S0/S1) importieren sie von hier, damit Laufzeit und Analyse nicht
 * auseinanderlaufen. Es gibt keine Abhaengigkeit von `supabase/functions/` nach
 * `tools/`.
 */

export const V513_MOTION_TELEMETRY_VERSION = "v513-t0";

/**
 * Minimale Stuetzstellenform. Entspricht dem produktiven `TrackSample` aus
 * `dynamic-camera-path.ts`; Analysewerkzeuge adaptieren auf diese Form.
 */
export interface V513MotionSample {
  t: number;
  box?: [number, number, number, number] | number[] | null;
  mouth?: [number, number] | number[] | null;
}

/** Ab wie vielen akzeptierten Stuetzstellen sind Kennzahlen ueberhaupt sinnvoll. */
export const V513_MIN_TELEMETRY_SAMPLES = 3;

/**
 * Obergrenze fuer den persistierten Diagnose-Grund.
 *
 * Der Track baut seinen Grund teilweise aus einer beliebigen Fehlermeldung
 * (`track_init_failed:${e.message}`), die formal unbegrenzt ist. Telemetrie
 * faehrt auf der bestehenden Pass-Persistenz mit; ein unbegrenztes Feld
 * waere ein unbegrenzter jsonb-Anbau an jedem Pass.
 */
export const V513_MAX_REASON_CHARS = 200;

/**
 * Normiert den Diagnose-Grund — deterministisch, verlustfrei bis 200
 * Zeichen, danach hart abgeschnitten.
 *
 * `null` und `undefined` werden beide zu `null`: `undefined` wuerde von
 * `JSON.stringify` lautlos entfernt und die Feldmenge instabil machen.
 *
 * Liest nur; ein uebergebenes Error-Objekt wird nicht veraendert.
 * Der Wert ist REINE DIAGNOSE — kein Zweig liest ihn.
 */
export function normalizeV513Reason(reason: unknown): string | null {
  if (reason === null || reason === undefined) return null;
  const s = typeof reason === "string" ? reason : String(reason);
  return s.length <= V513_MAX_REASON_CHARS ? s : s.slice(0, V513_MAX_REASON_CHARS);
}

export type V513MotionStatus =
  | "ok"
  | "no_plate_box"
  | "track_failed"
  | "insufficient_samples";

export interface V513MotionTelemetry {
  version: string;
  status: V513MotionStatus;
  /** Grund aus dem Track, wenn vorhanden. Nur Diagnose. */
  reason: string | null;
  sample_count: number;
  median_side_px: number | null;

  center_x_range_norm: number | null;
  center_y_range_norm: number | null;
  center_range_norm: number | null;
  net_displacement_norm: number | null;
  path_length_norm: number | null;
  max_step_norm: number | null;
  mean_step_norm: number | null;

  side_range_norm: number | null;
  side_change_pct: number | null;

  heading_changes_gt_90: number | null;
  max_heading_change_deg: number | null;

  /**
   * DIAGNOSTIK, kein Materialitaetssignal. Zweite Differenzen verstaerken
   * Messrauschen; zwei reale bewegungsarme Screens zeigten hohe Werte bei
   * faktisch stillstehendem Gesicht.
   */
  second_difference_norm_diagnostic: number | null;
}

const box4 = (b: V513MotionSample["box"]): [number, number, number, number] | null =>
  Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(Number(v)))
    ? [Number(b[0]), Number(b[1]), Number(b[2]), Number(b[3])]
    : null;

const centerOf = (b: [number, number, number, number]): [number, number] =>
  [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

const sideOf = (b: [number, number, number, number]): number =>
  Math.max(b[2] - b[0], b[3] - b[1]);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const round = (v: number, d = 4): number =>
  Number.isFinite(v) ? Number(v.toFixed(d)) : 0;

function unavailable(status: V513MotionStatus, reason: string | null, n: number): V513MotionTelemetry {
  return {
    version: V513_MOTION_TELEMETRY_VERSION,
    status,
    reason,
    sample_count: n,
    median_side_px: null,
    center_x_range_norm: null,
    center_y_range_norm: null,
    center_range_norm: null,
    net_displacement_norm: null,
    path_length_norm: null,
    max_step_norm: null,
    mean_step_norm: null,
    side_range_norm: null,
    side_change_pct: null,
    heading_changes_gt_90: null,
    max_heading_change_deg: null,
    second_difference_norm_diagnostic: null,
  };
}

/**
 * PURE — Bewegungskennzahlen aus einer bereits gemessenen Spur.
 *
 * Alle Translationsgroessen teilen DENSELBEN Nenner: die mediane
 * Gesichtsseitenlaenge der akzeptierten Stuetzstellen. Damit sind Werte ueber
 * Szenen mit unterschiedlicher Gesichtsgroesse vergleichbar, und dieselbe
 * Bewegung in doppelter Pixelgroesse ergibt dieselben normierten Werte.
 *
 * Kein Score, keine Klassifikation, kein Schwellenwert.
 */
export function computeV513MotionTelemetry(
  input: {
    /** `null`, wenn fuer diesen Pass keine Plate-Box vorlag. */
    samples: V513MotionSample[] | null;
    /** `false`, wenn der Track selbst gescheitert ist. */
    trackOk?: boolean;
    reason?: string | null;
  },
): V513MotionTelemetry {
  const { samples, trackOk } = input;
  // Genau EINE Stelle normiert den Grund — jeder Rueckgabepfad unten
  // benutzt diese Variable, nie `input.reason`.
  const reason = normalizeV513Reason(input.reason);
  if (samples === null) return unavailable("no_plate_box", reason, 0);
  if (trackOk === false) {
    return unavailable("track_failed", reason, samples.filter((s) => box4(s.box)).length);
  }

  const acc = samples
    .filter((s) => Number.isFinite(Number(s.t)) && box4(s.box))
    .map((s) => ({ t: Number(s.t), box: box4(s.box)! }))
    .sort((a, b) => a.t - b.t);

  if (acc.length < V513_MIN_TELEMETRY_SAMPLES) {
    return unavailable("insufficient_samples", reason, acc.length);
  }

  const cs = acc.map((s) => centerOf(s.box));
  const sides = acc.map((s) => sideOf(s.box));
  const ms = median(sides);
  if (!(ms > 0)) return unavailable("insufficient_samples", reason, acc.length);

  const xs = cs.map((c) => c[0]);
  const ys = cs.map((c) => c[1]);

  const steps: number[] = [];
  const headings: number[] = [];
  for (let i = 1; i < cs.length; i++) {
    const dx = cs[i][0] - cs[i - 1][0];
    const dy = cs[i][1] - cs[i - 1][1];
    steps.push(Math.hypot(dx, dy));
    headings.push(Math.atan2(dy, dx));
  }
  const path = steps.reduce((a, b) => a + b, 0);

  // Richtungswechsel nur zwischen Schritten mit echter Richtung zaehlen —
  // sonst misst man den Winkel von Rauschen.
  const MIN_STEP = 1e-6;
  let headingChanges = 0;
  let maxHeadingDeg = 0;
  for (let i = 1; i < headings.length; i++) {
    if (steps[i] < MIN_STEP || steps[i - 1] < MIN_STEP) continue;
    let d = Math.abs(headings[i] - headings[i - 1]);
    if (d > Math.PI) d = 2 * Math.PI - d;
    const deg = (d * 180) / Math.PI;
    if (deg > maxHeadingDeg) maxHeadingDeg = deg;
    if (deg > 90) headingChanges++;
  }

  let secondDiff = 0;
  for (let i = 1; i < cs.length - 1; i++) {
    const ex = 2 * cs[i][0] - cs[i - 1][0];
    const ey = 2 * cs[i][1] - cs[i - 1][1];
    const d = Math.hypot(cs[i + 1][0] - ex, cs[i + 1][1] - ey);
    if (d > secondDiff) secondDiff = d;
  }

  const sMin = Math.min(...sides);
  const sMax = Math.max(...sides);
  const xr = Math.max(...xs) - Math.min(...xs);
  const yr = Math.max(...ys) - Math.min(...ys);

  return {
    version: V513_MOTION_TELEMETRY_VERSION,
    status: "ok",
    reason,
    sample_count: acc.length,
    median_side_px: round(ms, 2),
    center_x_range_norm: round(xr / ms),
    center_y_range_norm: round(yr / ms),
    center_range_norm: round(Math.hypot(xr, yr) / ms),
    net_displacement_norm: round(
      Math.hypot(cs[cs.length - 1][0] - cs[0][0], cs[cs.length - 1][1] - cs[0][1]) / ms,
    ),
    path_length_norm: round(path / ms),
    max_step_norm: round(Math.max(...steps) / ms),
    mean_step_norm: round(path / steps.length / ms),
    side_range_norm: round((sMax - sMin) / ms),
    side_change_pct: round(sMin > 0 ? ((sMax - sMin) / sMin) * 100 : 0, 2),
    heading_changes_gt_90: headingChanges,
    max_heading_change_deg: round(maxHeadingDeg, 2),
    second_difference_norm_diagnostic: round(secondDiff / ms),
  };
}
