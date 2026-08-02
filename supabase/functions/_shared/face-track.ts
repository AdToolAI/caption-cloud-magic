/**
 * face-track.ts (v357) — Echtes Per-Frame-Gesichts-Tracking für Sync.so ASD.
 * ==========================================================================
 * WARUM DIESES MODUL EXISTIERT
 *
 * Bis v356 haben wir zwar eine `bounding_boxes_url` an Sync.so geschickt,
 * aber die enthielt für JEDEN Frame exakt dieselbe Box — nur an-/ausgeschaltet
 * nach Voiced-Window. Das ist KEIN Tracking. Bewegt sich die Figur im Clip
 * (Kopfdrehung, Schritt zur Seite, Kamerabewegung), zeigt die Box ins Leere,
 * Sync 3 findet keinen Mund und liefert das Eingangsvideo unverändert zurück.
 * Genau das haben wir wochenlang als "Passthrough" gemessen.
 *
 * Dieses Modul erzeugt eine echte Bewegungsspur:
 *   1) Stills an mehreren Zeitpunkten des Sprecher-Turns via AWS Remotion
 *      Lambda (HARTE PROJEKTREGEL: Frame-Extraktion NUR über AWS, nie
 *      Replicate — siehe aws-frame-probe.ts).
 *   2) AWS Rekognition DetectFaces auf jedem Still.
 *   3) Pro Still die Box wählen, die dem Anchor/Vorgänger am nächsten liegt
 *      (Tracking-Kontinuität, verhindert Sprung auf ein Nachbargesicht).
 *   4) Zwischen den Stützstellen linear interpolieren + glätten.
 *   5) Kontextrahmen aufschlagen — Sync 3 arbeitet mit Umfeld (Kinn, Wangen,
 *      etwas Hals) nachweislich besser als mit einem engen Mundausschnitt.
 *
 * Schlägt das Tracking fehl, degradieren wir bewusst auf die Anchor-Box —
 * aber nie stillschweigend: `source` sagt immer, was passiert ist.
 */

import { awsFrameProbeAvailable, renderAwsStill } from "./aws-frame-probe.ts";
import { detectFacesMediaPipe } from "./face-detect-mediapipe.ts";

export const FACE_TRACK_TAG = "v357-per-frame-face-track";

export type Box = [number, number, number, number];

/** Kontextaufschlag auf die reine Gesichtsbox (Anteil der Boxbreite/-höhe). */
export const CONTEXT_PAD_X = 0.25;
export const CONTEXT_PAD_TOP = 0.25;
export const CONTEXT_PAD_BOTTOM = 0.30;

/** Max. Anzahl Stützstellen pro Turn — jede kostet einen Lambda-Still. */
export const MAX_TRACK_SAMPLES = 6;
/** Unter dieser Turn-Dauer lohnt Tracking nicht (kaum Bewegung möglich). */
export const MIN_TRACK_DURATION_SEC = 0.6;

/**
 * v359 — Zusätzliche Stützstellen für risikobasierte Verdichtung.
 *
 * Ein echter dichter Tracker (optischer Fluss, KLT, CSRT) ist im Edge-Runtime
 * nicht lauffähig: es gibt kein OpenCV, und die Frame-Extraktion läuft per
 * harter Projektregel (v347) ausschließlich über AWS-Stills mit je einem
 * Lambda-Roundtrip. Statt gleichmäßig mehr Stills zu ziehen, verdichten wir
 * gezielt DORT, wo der Track zwischen zwei Ankern stark wandert — dort ist
 * die Interpolation unsicher und dort schneidet der Crop an.
 */
export const MAX_EXTRA_SAMPLES = 4;

/** Ab dieser Wanderung zwischen zwei Ankern (Anteil der Boxseite) wird
 *  zwischen ihnen nachverdichtet. */
export const DENSIFY_MOTION_RATIO = 0.6;

export interface TrackSample {
  timestamp: number;
  box: Box | null;
  error?: string;
  /** v359 — true, wenn dieser Sample aus der Nachverdichtung stammt. */
  extra?: boolean;
}

export type FaceTrackSource = "tracked" | "anchor_fallback";

export interface FaceTrackResult {
  ok: boolean;
  /** Bewegungsspur als Keyframes (Zeit in Sekunden der Clip-Zeitbasis). */
  keyframes: Array<{ t: number; box: Box }>;
  samples: TrackSample[];
  source: FaceTrackSource;
  error: string | null;
  ms: number;
  /** v359 — Anteil Stützstellen mit erkanntem Gesicht. Telemetrie. */
  detectionRatio?: number;
  /** v359 — größte gemessene Wanderung zwischen zwei Ankern, in Pixeln. */
  peakMotionPx?: number;
  /** v359 — Anzahl nachverdichteter Stützstellen. */
  extraSamples?: number;
}


const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Fläche einer Box (0 bei degenerierten Boxen). */
export function boxArea(b: Box): number {
  return Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
}

export function boxCenter(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

/** Intersection-over-Union zweier Boxen. */
export function boxIou(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = boxArea(a) + boxArea(b) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Wählt aus mehreren erkannten Boxen die, die am wahrscheinlichsten dieselbe
 * Person ist wie `reference`: zuerst über IoU, bei 0-Overlap über die
 * Mittelpunkt-Distanz (Figur kann sich zwischen Stützstellen weit bewegen).
 */
export function pickTrackedBox(candidates: Box[], reference: Box): Box | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const [rx, ry] = boxCenter(reference);
  let best: Box | null = null;
  let bestIou = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const iou = boxIou(c, reference);
    if (iou > bestIou + 1e-6) {
      bestIou = iou;
      best = c;
      const [cx, cy] = boxCenter(c);
      bestDist = Math.hypot(cx - rx, cy - ry);
      continue;
    }
    if (Math.abs(iou - bestIou) <= 1e-6) {
      const [cx, cy] = boxCenter(c);
      const d = Math.hypot(cx - rx, cy - ry);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
  }
  return best;
}

/** Schlägt Kontext auf eine reine Gesichtsbox auf und clamped ins Bild. */
export function withContextPadding(box: Box, width: number, height: number): Box {
  const w = Math.max(1, box[2] - box[0]);
  const h = Math.max(1, box[3] - box[1]);
  return [
    Math.round(clamp(box[0] - w * CONTEXT_PAD_X, 0, width - 2)),
    Math.round(clamp(box[1] - h * CONTEXT_PAD_TOP, 0, height - 2)),
    Math.round(clamp(box[2] + w * CONTEXT_PAD_X, 2, width)),
    Math.round(clamp(box[3] + h * CONTEXT_PAD_BOTTOM, 2, height)),
  ];
}

/**
 * v372 — Obergrenze für die Fläche der Ziel-Bounding-Box.
 *
 * Empirie aus Szene 6bf4e815: die drei animierten Sprecher lagen bei 38–41 %
 * der Preclip-Fläche, der einzige Passthrough bei 84.86 %. Eine Box, die
 * praktisch das ganze Bild umfasst, sagt dem Provider nichts über die
 * Zielperson. Die Grenze liegt bewusst deutlich über dem gemessenen
 * Arbeitsbereich — sie soll nur Entartungen abfangen, nicht Qualität bewerten.
 */
export const MAX_DISPATCH_BOX_AREA_FRAC = 0.55;

/**
 * Schneidet eine zu große Box zum Mittelpunkt hin zurück, statt sie zu
 * verwerfen. Ein Abbruch würde Credits vernichten, obwohl eine korrigierbare
 * Geometrie vorliegt.
 */
export function clampBoxArea(
  box: Box,
  width: number,
  height: number,
  maxFrac: number = MAX_DISPATCH_BOX_AREA_FRAC,
): { box: Box; clamped: boolean; areaFrac: number } {
  const frame = Math.max(1, width * height);
  const w = Math.max(1, box[2] - box[0]);
  const h = Math.max(1, box[3] - box[1]);
  const areaFrac = (w * h) / frame;
  if (!(areaFrac > maxFrac)) {
    return { box: [...box] as Box, clamped: false, areaFrac: Number(areaFrac.toFixed(4)) };
  }
  const scale = Math.sqrt(maxFrac / areaFrac);
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  const halfW = (w * scale) / 2;
  const halfH = (h * scale) / 2;
  const out: Box = [
    Math.round(clamp(cx - halfW, 0, width - 2)),
    Math.round(clamp(cy - halfH, 0, height - 2)),
    Math.round(clamp(cx + halfW, 2, width)),
    Math.round(clamp(cy + halfH, 2, height)),
  ];
  return { box: out, clamped: true, areaFrac: Number(areaFrac.toFixed(4)) };
}


/** Gleichmäßige Stützstellen über das Turn-Fenster (inkl. Rändern). */
export function sampleTimestamps(startSec: number, endSec: number, maxSamples: number): number[] {
  const dur = Math.max(0, endSec - startSec);
  if (dur <= 0) return [Math.max(0.01, startSec)];
  const n = clamp(Math.round(dur / 0.8) + 1, 2, Math.max(2, maxSamples));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = startSec + (dur * i) / (n - 1);
    // Randframes leicht nach innen ziehen — exakt am Clipende liefert der
    // Still-Renderer gerne einen leeren/schwarzen Frame.
    out.push(Number(clamp(t, startSec + 0.02, Math.max(startSec + 0.02, endSec - 0.02)).toFixed(3)));
  }
  return Array.from(new Set(out));
}

/**
 * Linear interpolierte + geglättete Per-Frame-Boxen aus Keyframes.
 * Ausgabe hat exakt `frameCount` Einträge; außerhalb der Voiced-Windows
 * steht `null` (Sync.so: "null where no box is present").
 */
export function interpolateBoxes(params: {
  keyframes: Array<{ t: number; box: Box }>;
  frameCount: number;
  fps: number;
  voicedWindowsSec: Array<[number, number]>;
  padFrames?: number;
  smoothWindow?: number;
}): Array<Box | null> {
  const frameCount = Math.max(1, Math.floor(params.frameCount));
  const fps = params.fps > 0 ? params.fps : 25;
  const kf = [...params.keyframes].sort((a, b) => a.t - b.t);
  const out: Array<Box | null> = new Array(frameCount).fill(null);
  if (kf.length === 0) return out;

  // 1) Dichte Spur über ALLE Frames (auch außerhalb der Windows) — nötig,
  //    damit die Glättung an den Fenstergrenzen nicht abknickt.
  const dense: Box[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    if (t <= kf[0].t) {
      dense[i] = kf[0].box;
      continue;
    }
    if (t >= kf[kf.length - 1].t) {
      dense[i] = kf[kf.length - 1].box;
      continue;
    }
    let j = 0;
    while (j < kf.length - 2 && kf[j + 1].t < t) j++;
    const a = kf[j];
    const b = kf[j + 1];
    const span = Math.max(1e-6, b.t - a.t);
    const f = clamp((t - a.t) / span, 0, 1);
    dense[i] = [
      a.box[0] + (b.box[0] - a.box[0]) * f,
      a.box[1] + (b.box[1] - a.box[1]) * f,
      a.box[2] + (b.box[2] - a.box[2]) * f,
      a.box[3] + (b.box[3] - a.box[3]) * f,
    ];
  }

  // 2) Gleitender Mittelwert gegen Detektor-Jitter.
  const half = Math.max(0, Math.floor((params.smoothWindow ?? 3) / 2));
  const smoothed: Box[] = dense.map((_, i) => {
    let n = 0;
    const acc: [number, number, number, number] = [0, 0, 0, 0];
    for (let k = i - half; k <= i + half; k++) {
      if (k < 0 || k >= frameCount) continue;
      const s = dense[k];
      acc[0] += s[0]; acc[1] += s[1]; acc[2] += s[2]; acc[3] += s[3];
      n++;
    }
    return [
      Math.round(acc[0] / n), Math.round(acc[1] / n),
      Math.round(acc[2] / n), Math.round(acc[3] / n),
    ] as Box;
  });

  // 3) Nur innerhalb der Voiced-Windows ausgeben.
  const pad = Math.max(0, Math.floor(params.padFrames ?? 2));
  const windows = (params.voicedWindowsSec ?? [])
    .map(([s, e]) => [
      Math.max(0, Math.floor(s * fps) - pad),
      Math.min(frameCount - 1, Math.ceil(e * fps) + pad),
    ] as [number, number])
    .filter(([fs, fe]) => Number.isFinite(fs) && Number.isFinite(fe) && fe >= fs);

  // v357 — KEIN "alle Frames dieselbe Box"-Notpfad mehr. Fehlen die Windows,
  // gilt der gesamte Clip explizit als ein Sprech-Fenster; die Spur bleibt
  // dabei eine echte Bewegungsspur statt einer Standbox.
  const effective = windows.length > 0 ? windows : [[0, frameCount - 1] as [number, number]];
  for (const [fs, fe] of effective) {
    for (let i = fs; i <= fe; i++) out[i] = smoothed[i];
  }
  return out;
}

/**
 * v359 — Wählt zusätzliche Stützstellen für die risikobasierte Verdichtung.
 *
 * Verdichtet wird nur zwischen Ankerpaaren, zwischen denen das Gesicht weit
 * gewandert ist. Dort ist die lineare Interpolation unsicher — sie kann durch
 * eine Position laufen, an der das Gesicht nie war (Richtungswechsel, kurze
 * Verdeckung). Ruhige Abschnitte kosten keine zusätzlichen Lambda-Stills.
 */
export function planDensifyTimestamps(
  samples: TrackSample[],
  maxExtra: number = MAX_EXTRA_SAMPLES,
): number[] {
  const hits = samples.filter((s) => s.box).sort((a, b) => a.timestamp - b.timestamp);
  if (hits.length < 2 || maxExtra <= 0) return [];

  const gaps: Array<{ t: number; motion: number }> = [];
  for (let i = 1; i < hits.length; i++) {
    const a = hits[i - 1].box as Box;
    const b = hits[i].box as Box;
    const [ax, ay] = boxCenter(a);
    const [bx, by] = boxCenter(b);
    const motion = Math.hypot(bx - ax, by - ay);
    const side = Math.max(a[2] - a[0], a[3] - a[1], 1);
    if (motion / side >= DENSIFY_MOTION_RATIO) {
      gaps.push({
        t: Number(((hits[i - 1].timestamp + hits[i].timestamp) / 2).toFixed(3)),
        motion,
      });
    }
  }

  gaps.sort((a, b) => b.motion - a.motion);
  const existing = new Set(samples.map((s) => s.timestamp));
  const out: number[] = [];
  for (const g of gaps) {
    if (out.length >= maxExtra) break;
    if (existing.has(g.t)) continue;
    out.push(g.t);
    existing.add(g.t);
  }
  return out.sort((a, b) => a - b);
}

/**
 * v359 — Dichte Per-Frame-Spur für den Kamerapfad.
 *
 * Anders als `interpolateBoxes` wird hier NICHT nach Voiced-Windows genullt:
 * der Kamerapfad braucht auch in Lead-in und Tail Geometrie, sonst springt
 * der Ausschnitt an den Fenstergrenzen.
 *
 * Über zeitliche Lücken, die länger als `maxGapSec` sind, wird bewusst nicht
 * interpoliert. Bei einer langen Lücke kann sich die Person gedreht haben
 * oder aus dem Bild gelaufen sein — eine geratene Box führt die Kamera dann
 * zuverlässig an die falsche Stelle.
 */
export function buildDenseTrack(params: {
  keyframes: Array<{ t: number; box: Box }>;
  frameCount: number;
  fps: number;
  maxGapSec?: number;
}): Array<Box | null> {
  const frameCount = Math.max(1, Math.floor(params.frameCount));
  const fps = params.fps > 0 ? params.fps : 30;
  const maxGap = params.maxGapSec ?? 1.2;
  const kf = [...params.keyframes].sort((a, b) => a.t - b.t);
  const out: Array<Box | null> = new Array(frameCount).fill(null);
  if (kf.length === 0) return out;

  for (let i = 0; i < frameCount; i++) {
    const t = i / fps;
    if (t <= kf[0].t) {
      out[i] = kf[0].box;
      continue;
    }
    if (t >= kf[kf.length - 1].t) {
      out[i] = kf[kf.length - 1].box;
      continue;
    }
    let j = 0;
    while (j < kf.length - 2 && kf[j + 1].t < t) j++;
    const a = kf[j];
    const b = kf[j + 1];
    if (b.t - a.t > maxGap) {
      out[i] = null;
      continue;
    }
    const span = Math.max(1e-6, b.t - a.t);
    const f = clamp((t - a.t) / span, 0, 1);
    out[i] = [
      a.box[0] + (b.box[0] - a.box[0]) * f,
      a.box[1] + (b.box[1] - a.box[1]) * f,
      a.box[2] + (b.box[2] - a.box[2]) * f,
      a.box[3] + (b.box[3] - a.box[3]) * f,
    ];
  }
  return out;
}


/** True, wenn die Spur sich tatsächlich bewegt (Diagnose / Regressionstest). */
export function trackMovementPx(boxes: Array<Box | null>): number {
  const pts = boxes.filter((b): b is Box => !!b).map(boxCenter);
  if (pts.length < 2) return 0;
  let maxD = 0;
  for (const [x, y] of pts) {
    for (const [x2, y2] of pts) maxD = Math.max(maxD, Math.hypot(x - x2, y - y2));
  }
  return Math.round(maxD);
}

export interface TrackFaceRequest {
  /** Das Video, das an Sync.so geht (Preclip oder Plate). */
  videoUrl: string;
  /** Pixelmaße des dispatchten Videos. */
  width: number;
  height: number;
  /** Turn-Fenster in der Zeitbasis des dispatchten Videos. */
  startSec: number;
  endSec: number;
  /** Anchor-Box (Ausgangslage) im selben Pixelraum. */
  anchorBox: Box;
  /** Absolute Deadline (ms epoch) für das gesamte Tracking. */
  deadline: number;
  maxSamples?: number;
  logTag?: string;
}

/**
 * Rendert Stills, erkennt Gesichter und liefert eine Keyframe-Spur.
 * Wirft nie — jede Störung endet in `source: "anchor_fallback"`.
 */
export async function trackFaceAcrossTurn(req: TrackFaceRequest): Promise<FaceTrackResult> {
  const t0 = Date.now();
  const tag = req.logTag ?? "face-track";
  const anchor = req.anchorBox;
  const fallback = (error: string | null): FaceTrackResult => ({
    ok: false,
    keyframes: [{ t: Math.max(0, req.startSec), box: anchor }],
    samples: [],
    source: "anchor_fallback",
    error,
    ms: Date.now() - t0,
  });

  const dur = Math.max(0, req.endSec - req.startSec);
  if (dur < MIN_TRACK_DURATION_SEC) return fallback("turn_too_short");
  if (!awsFrameProbeAvailable()) return fallback("aws_frame_probe_unavailable");
  if (Date.now() > req.deadline - 5_000) return fallback("budget_exhausted");

  const timestamps = sampleTimestamps(req.startSec, req.endSec, req.maxSamples ?? MAX_TRACK_SAMPLES);
  const frameSize = Math.max(req.width, req.height);

  /**
   * Rendert Stills und erkennt darauf Gesichter — Reihenfolge bleibt stabil.
   *
   * v364 — STRIKT SEQUENZIELL. Das parallele `Promise.all` hielt alle Stills
   * gleichzeitig im Speicher (Download + base64 für Rekognition) und hat den
   * Edge-Worker mit `Memory limit exceeded` abgeschossen, bevor der Preclip
   * überhaupt gerendert wurde. Ein Still nach dem anderen, Referenz sofort
   * wieder freigeben.
   */
  const probe = async (ts: number[], extra: boolean): Promise<TrackSample[]> => {
    const out: TrackSample[] = [];
    for (const timestamp of ts) {
      if (Date.now() > req.deadline - 4_000) {
        out.push({ timestamp, box: null, error: "budget_exhausted", extra });
        continue;
      }
      const still = await renderAwsStill({
        videoUrl: req.videoUrl,
        timestamp,
        frameSize,
        deadline: req.deadline,
      });
      if (!still.url) {
        out.push({ timestamp, box: null, error: still.error ?? "still_missing", extra });
        continue;
      }
      const det = await detectFacesMediaPipe({
        videoUrl: req.videoUrl,
        plateWidth: req.width,
        plateHeight: req.height,
        durationSec: dur,
        prebuiltFrameUrls: [still.url],
      });
      const candidates = (det.faces ?? [])
        .map((f) => f.bbox as Box)
        .filter((b) => Array.isArray(b) && boxArea(b) > 16);
      const picked = pickTrackedBox(candidates, reference);
      if (picked) reference = picked;
      out.push({
        timestamp,
        box: picked,
        error: picked ? undefined : (det.error ?? "no_face_in_still"),
        extra,
      });
    }
    return out;
  };

  let reference: Box = anchor;
  const samples: TrackSample[] = await probe(timestamps, false);

  // ── v359 — Risikobasierte Verdichtung ───────────────────────────────
  // Nur dort nachmessen, wo die Spur zwischen zwei Ankern weit gewandert
  // ist. Ruhige Abschnitte kosten keine zusätzlichen Lambda-Stills.
  // v364: höchstens EIN Zusatz-Still, und nur bei klarem Zeitbudget.
  let extraSamples = 0;
  const budgetLeft = req.deadline - Date.now() > 15_000;
  if (budgetLeft) {
    const densify = planDensifyTimestamps(samples).slice(0, 1);
    if (densify.length > 0) {
      const more = await probe(densify, true);
      samples.push(...more);
      samples.sort((a, b) => a.timestamp - b.timestamp);
      extraSamples = more.length;
    }
  }


  const hits = samples.filter((s) => s.box);
  if (hits.length === 0) return fallback("no_face_tracked");

  // v372 — RAW boxes. Der Kontextaufschlag ist NICHT mehr Aufgabe des
  // Trackers. Er wird ausschließlich an der Aufrufstelle angewendet, die die
  // Dispatch-Box baut. Vorher paddete der Tracker seine Keyframes selbst,
  // während der Fallback-Pfad die bereits kontextualisierte Anchor-Box ein
  // ZWEITES Mal aufweitete — belegt bei Samuel (Szene 6bf4e815): aus einer
  // gültigen 40%-Gesichtsbox wurde eine 84.86%-Fast-Vollbildbox und Sync.so
  // lieferte Passthrough.
  const keyframes = hits.map((s) => ({
    t: s.timestamp,
    box: [...(s.box as Box)] as Box,
  }));


  let peakMotionPx = 0;
  for (let i = 1; i < keyframes.length; i++) {
    const [ax, ay] = boxCenter(keyframes[i - 1].box);
    const [bx, by] = boxCenter(keyframes[i].box);
    peakMotionPx = Math.max(peakMotionPx, Math.round(Math.hypot(bx - ax, by - ay)));
  }
  const detectionRatio = samples.length > 0 ? hits.length / samples.length : 0;

  console.log(
    `[${tag}] ${FACE_TRACK_TAG} samples=${samples.length} hits=${hits.length} ` +
    `extra=${extraSamples} detection_ratio=${detectionRatio.toFixed(2)} peak_motion_px=${peakMotionPx} ` +
    `span=${req.startSec.toFixed(2)}-${req.endSec.toFixed(2)}s ms=${Date.now() - t0}`,
  );


  return {
    ok: true,
    keyframes,
    samples,
    source: "tracked",
    error: null,
    ms: Date.now() - t0,
    detectionRatio,
    peakMotionPx,
    extraSamples,
  };

}
