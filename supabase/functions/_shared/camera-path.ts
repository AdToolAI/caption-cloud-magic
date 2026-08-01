/**
 * camera-path.ts (v359) — Offline-Kamerapfad für den bewegten Preclip.
 * ====================================================================
 * WARUM DIESES MODUL EXISTIERT
 *
 * Bis v358 hat die Pipeline einen zeitabhängigen Face-Track auf ein zeitlich
 * KONSTANTES Rechteck reduziert. Bewegt sich die Figur während ihres Turns,
 * verlässt ihr Gesicht diesen festen Ausschnitt — der gerenderte Preclip
 * zeigt dann Haare und Schulter statt Mund, und Sync.so gibt das Video
 * unverändert zurück ("Passthrough"). Genau dieser Fall ist für Kailee
 * (Szene 89c5e01c) per Kontaktbogen bewiesen: erste Hälfte kein Gesicht.
 *
 * Eine Bounding Box kann kein Gesicht zurückholen, das der Crop
 * weggeschnitten hat. Also muss der Crop dem Gesicht folgen.
 *
 * WARUM OFFLINE (nicht kausal)
 *
 * Wir rendern nicht live. Der komplette Track liegt vor der ersten
 * gerenderten Frame vor. Ein rein kausaler Filter (EMA) läuft bei schneller
 * Bewegung hinterher und schneidet genau die Frames an, die er retten soll.
 * Deshalb: Vorwärts- UND Rückwärtsglättung plus Look-ahead — die virtuelle
 * Kamera zieht bereits mit, bevor das Gesicht den Rand erreicht.
 *
 * WAS DIESES MODUL BEWUSST NICHT TUT
 *
 * Es zentriert das Gesicht NICHT permanent exakt. Das sähe aus wie ein
 * festgenagelter Kopf vor gleitendem Hintergrund. Innerhalb der Dead Zone
 * steht die Kamera still; erst beim Verlassen folgt sie, begrenzt in
 * Geschwindigkeit und Beschleunigung.
 */

export type Box = [number, number, number, number];

/** Ein Crop-Fenster für genau einen Frame, in Plate-Pixelkoordinaten. */
export interface CropWindow {
  x: number;
  y: number;
  size: number;
}

// ── Regieparameter ────────────────────────────────────────────────────────

/** Anteil der Gesichtshöhe, um den der Bildmittelpunkt unter die Gesichtsmitte
 *  rutscht. Gibt oberhalb des Kopfes Luft und hält Kiefer/Schulter im Bild. */
export const VERTICAL_BIAS = 0.15;

/** Dead Zone: sicherer Bereich des Crops, in dem sich die Box bewegen darf,
 *  ohne dass die Kamera reagiert (Anteil der Crop-Kantenlänge, je Seite). */
export const DEAD_ZONE_X = 0.15;
export const DEAD_ZONE_Y = 0.20;

/** Bewegungsgrenzen der virtuellen Kamera (Anteil der Crop-Kantenlänge). */
export const MAX_PAN_PER_FRAME = 0.035;
export const MAX_ACCEL_PER_FRAME = 0.012;

/** Look-ahead-Fenster in Frames — so weit blickt die Kamera voraus. */
export const LOOK_AHEAD_FRAMES = 8;

/** Sicherheitsrand um die Gesichtsbox innerhalb des Crops (Anteil Boxseite). */
export const SAFETY_PAD = 0.35;

/** Längste Track-Lücke, über die noch interpoliert werden darf. Darüber
 *  hinaus wird NICHT geraten — die Frames bleiben ungedeckt. */
export const MAX_INTERP_GAP_FRAMES = 4;

/** Grenze, ab der ein Positionssprung zwischen zwei Frames als harter
 *  Schnitt gilt (Anteil der Crop-Kantenlänge). Abnahmekriterium 5. */
export const MAX_ALLOWED_JUMP = 0.08;

/** Gewicht von Frames außerhalb des Sprachkerns (Lead-in / Tail). Ein Frame
 *  ohne Ton darf abweichen, ein Frame mit Silbenbeginn nicht. */
export const HANDLE_WEIGHT = 0.25;
export const SILENCE_WEIGHT = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function boxCenter(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

export function boxWidth(b: Box): number {
  return Math.max(0, b[2] - b[0]);
}

export function boxHeight(b: Box): number {
  return Math.max(0, b[3] - b[1]);
}

// ── Schritt 1: Lücken schließen, aber nur kurze ───────────────────────────

export interface GapFillResult {
  boxes: Array<Box | null>;
  /** Längste zusammenhängende Lücke NACH dem Füllen. */
  maxGapFrames: number;
  /** Frames, die durch Interpolation entstanden sind. */
  interpolatedFrames: number;
  /** Frame-Indizes, an denen der Track nach einer Lücke wieder greift. */
  reacquisitionFrames: number[];
}

/**
 * Füllt kurze Lücken linear. Über `MAX_INTERP_GAP_FRAMES` hinaus wird
 * bewusst NICHT interpoliert: bei einer langen Lücke kann sich die Person
 * gedreht, verdeckt oder das Bild verlassen haben. Eine geratene Box führt
 * die Kamera dann an die falsche Stelle — schlimmer als eine ehrliche Lücke.
 */
export function fillShortGaps(
  boxes: Array<Box | null>,
  maxGap: number = MAX_INTERP_GAP_FRAMES,
): GapFillResult {
  const out: Array<Box | null> = [...boxes];
  const n = out.length;
  let interpolatedFrames = 0;
  const reacquisitionFrames: number[] = [];

  let i = 0;
  while (i < n) {
    if (out[i]) {
      i++;
      continue;
    }
    // Lücke [i, j)
    let j = i;
    while (j < n && !out[j]) j++;
    const before = i > 0 ? out[i - 1] : null;
    const after = j < n ? out[j] : null;
    const gapLen = j - i;

    if (before && after && gapLen <= maxGap) {
      for (let k = i; k < j; k++) {
        const f = (k - i + 1) / (gapLen + 1);
        out[k] = [
          before[0] + (after[0] - before[0]) * f,
          before[1] + (after[1] - before[1]) * f,
          before[2] + (after[2] - before[2]) * f,
          before[3] + (after[3] - before[3]) * f,
        ];
        interpolatedFrames++;
      }
    } else if (before && after) {
      // Zu lange Lücke: nicht raten. Der Wiedereinstieg ist eine
      // Reacquisition — die Kamera muss dorthin weich fahren.
      reacquisitionFrames.push(j);
    } else if (after && !before) {
      // Vorlauf vor dem ersten Treffer: Position der ersten Messung halten.
      for (let k = i; k < j; k++) out[k] = after;
    } else if (before && !after) {
      // Nachlauf nach dem letzten Treffer: letzte Position halten.
      for (let k = i; k < j; k++) out[k] = before;
    }
    i = j;
  }

  let maxGapFrames = 0;
  let run = 0;
  for (const b of out) {
    if (b) {
      run = 0;
    } else {
      run++;
      if (run > maxGapFrames) maxGapFrames = run;
    }
  }

  return { boxes: out, maxGapFrames, interpolatedFrames, reacquisitionFrames };
}

// ── Schritt 2: Konstanter, sprachgewichteter Zoom ─────────────────────────

/**
 * Bestimmt EINE Crop-Kantenlänge für den gesamten Turn.
 *
 * Kein Zoom pro Frame: eine pro Frame atmende Ausschnittsgröße erzeugt
 * Zoom-Pumping und wechselnden Hintergrund. Die Größe wird stattdessen so
 * gewählt, dass die Gesichtsbox samt Sicherheitsrand in möglichst allen
 * Frames hineinpasst — Frames mit tatsächlicher Sprachaktivität zählen dabei
 * am stärksten. Ein Frame im Lead-in darf abweichen, ein Frame mit
 * Silbenbeginn nicht.
 */
export function planConstantZoom(params: {
  boxes: Array<Box | null>;
  weights: number[];
  plateWidth: number;
  plateHeight: number;
  minSize: number;
  /** Anteil der (gewichteten) Frames, die sicher enthalten sein müssen. */
  coverage?: number;
}): { size: number; requiredSizes: number[] } {
  const coverage = clamp(params.coverage ?? 0.95, 0.5, 1);
  const maxSize = Math.min(params.plateWidth, params.plateHeight);

  const entries: Array<{ required: number; weight: number }> = [];
  const requiredSizes: number[] = [];
  for (let i = 0; i < params.boxes.length; i++) {
    const b = params.boxes[i];
    if (!b) {
      requiredSizes.push(0);
      continue;
    }
    const side = Math.max(boxWidth(b), boxHeight(b));
    const required = side * (1 + 2 * SAFETY_PAD);
    requiredSizes.push(required);
    entries.push({ required, weight: Math.max(0, params.weights[i] ?? 1) });
  }

  if (entries.length === 0) {
    return { size: clamp(params.minSize, 2, maxSize), requiredSizes };
  }

  entries.sort((a, b) => a.required - b.required);
  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  let acc = 0;
  let picked = entries[entries.length - 1].required;
  for (const e of entries) {
    acc += e.weight;
    if (totalWeight > 0 && acc / totalWeight >= coverage) {
      picked = e.required;
      break;
    }
  }

  const size = clamp(Math.round(picked), Math.min(params.minSize, maxSize), maxSize);
  return { size: size % 2 === 0 ? size : size - 1, requiredSizes };
}

// ── Schritt 3: Zielmittelpunkte, Ausreißerfilter, bidirektionale Glättung ─

/** Median-Filter gegen Einzelframe-Ausreißer des Detektors. */
export function medianFilter(values: number[], window = 5): number[] {
  const half = Math.max(0, Math.floor(window / 2));
  return values.map((_, i) => {
    const slice: number[] = [];
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < values.length) slice.push(values[k]);
    }
    slice.sort((a, b) => a - b);
    return slice[Math.floor(slice.length / 2)];
  });
}

/**
 * Vorwärts-/Rückwärtsglättung. Ein reiner EMA hinkt der Bewegung hinterher;
 * der Rückwärtslauf hebt diese Phasenverschiebung wieder auf.
 */
export function forwardBackwardSmooth(values: number[], alpha = 0.35): number[] {
  const n = values.length;
  if (n === 0) return [];
  const fwd = new Array<number>(n);
  fwd[0] = values[0];
  for (let i = 1; i < n; i++) fwd[i] = alpha * values[i] + (1 - alpha) * fwd[i - 1];

  const bwd = new Array<number>(n);
  bwd[n - 1] = values[n - 1];
  for (let i = n - 2; i >= 0; i--) bwd[i] = alpha * values[i] + (1 - alpha) * bwd[i + 1];

  return values.map((_, i) => (fwd[i] + bwd[i]) / 2);
}

// ── Schritt 4: Kompletter Pfadplaner ──────────────────────────────────────

export interface CameraPathInput {
  /** Per-Frame-Gesichtsboxen in Plate-Pixelkoordinaten; null = unbekannt. */
  boxes: Array<Box | null>;
  plateWidth: number;
  plateHeight: number;
  /** Gewicht je Frame (1 = Sprachkern). Fehlt es, zählt jeder Frame gleich. */
  weights?: number[];
  /** Untergrenze der Crop-Kantenlänge in Plate-Pixeln. */
  minSize?: number;
  /** Anteil gewichteter Frames, die der Zoom sicher abdecken muss. */
  coverage?: number;
}

export interface CameraPathResult {
  /** Ein Crop-Fenster pro Frame. Länge === boxes.length. */
  path: CropWindow[];
  /** Konstante Kantenlänge über den gesamten Turn. */
  size: number;
  /** Anteil Frames, in denen die Gesichtsbox vollständig im Crop liegt. */
  containedRatio: number;
  /** Dasselbe, aber sprachgewichtet — die entscheidende Zahl. */
  weightedContainedRatio: number;
  /** Größter Positionssprung zwischen zwei Frames, in Crop-Anteilen. */
  maxJump: number;
  /** Höchste Kamerageschwindigkeit, in Crop-Anteilen pro Frame. */
  maxVelocity: number;
  /** Höchste Kamerabeschleunigung, in Crop-Anteilen pro Frame². */
  maxAcceleration: number;
  /** Längste Lücke im Track nach dem Füllen kurzer Lücken. */
  maxGapFrames: number;
  interpolatedFrames: number;
  reacquisitionFrames: number[];
  /** true, wenn sich der Ausschnitt überhaupt bewegt. */
  moving: boolean;
}

/**
 * Baut aus einem Per-Frame-Track einen ruhigen, vorausschauenden Crop-Pfad.
 */
export function planCameraPath(input: CameraPathInput): CameraPathResult {
  const n = input.boxes.length;
  const weights = input.weights && input.weights.length === n
    ? input.weights
    : new Array<number>(n).fill(1);

  const filled = fillShortGaps(input.boxes);
  const boxes = filled.boxes;

  const zoom = planConstantZoom({
    boxes,
    weights,
    plateWidth: input.plateWidth,
    plateHeight: input.plateHeight,
    minSize: input.minSize ?? 128,
    coverage: input.coverage,
  });

  // ── Zoom an die Bewegungsgeschwindigkeit anpassen ───────────────────
  // Die Kamera darf pro Frame nur `size * MAX_PAN_PER_FRAME` wandern, sonst
  // entstehen unnatürliche Mini-Pans. Bewegt sich das Gesicht schneller,
  // wäre die Kamera konstruktionsbedingt zu langsam und würde anschneiden.
  //
  // Ein echter Kameramann löst das nicht mit einem Peitschenschwenk, sondern
  // indem er WEITER geht. Genau das tun wir: ein größerer Ausschnitt erhöht
  // sowohl das erlaubte Pan in Pixeln als auch die Sicherheitsmarge.
  let peakSpeed = 0;
  for (let i = 1; i < n; i++) {
    const a = boxes[i - 1];
    const b = boxes[i];
    if (!a || !b) continue;
    const [ax, ay] = boxCenter(a);
    const [bx, by] = boxCenter(b);
    peakSpeed = Math.max(peakSpeed, Math.hypot(bx - ax, by - ay));
  }
  const speedRequiredSize = peakSpeed / MAX_PAN_PER_FRAME;
  const plateMax = Math.min(input.plateWidth, input.plateHeight);
  let size = Math.round(clamp(Math.max(zoom.size, speedRequiredSize), 2, plateMax));
  if (size % 2 !== 0) size -= 1;

  const maxX = Math.max(0, input.plateWidth - size);
  const maxY = Math.max(0, input.plateHeight - size);


  // Zielmittelpunkte: Gesichtsmitte, leicht nach unten versetzt.
  const rawCx: number[] = new Array(n);
  const rawCy: number[] = new Array(n);
  let lastCx = size / 2;
  let lastCy = size / 2;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (b) {
      const [cx, cy] = boxCenter(b);
      lastCx = cx;
      lastCy = cy + boxHeight(b) * VERTICAL_BIAS;
    }
    rawCx[i] = lastCx;
    rawCy[i] = lastCy;
  }

  // Ausreißer entfernen, dann phasenfrei glätten.
  let cx = forwardBackwardSmooth(medianFilter(rawCx));
  let cy = forwardBackwardSmooth(medianFilter(rawCy));

  // ── Look-ahead-Sicherung ────────────────────────────────────────────
  // Ein geglätteter Pfad kann trotzdem anschneiden. Für jeden Frame prüfen
  // wir die nächsten LOOK_AHEAD_FRAMES: droht dort ein Randkontakt, ziehen
  // wir den Mittelpunkt schon jetzt anteilig mit. Dadurch beginnt die
  // Kamerabewegung, bevor das Gesicht den Rand erreicht.
  const half = size / 2;
  const deadX = size * DEAD_ZONE_X;
  const deadY = size * DEAD_ZONE_Y;
  for (let i = 0; i < n; i++) {
    let needX = cx[i];
    let needY = cy[i];
    for (let k = 0; k <= LOOK_AHEAD_FRAMES && i + k < n; k++) {
      const b = boxes[i + k];
      if (!b) continue;
      const pad = Math.max(boxWidth(b), boxHeight(b)) * SAFETY_PAD * 0.5;
      const influence = 1 - k / (LOOK_AHEAD_FRAMES + 1);
      // Mindest-/Höchstmittelpunkt, damit Box + Rand hineinpasst.
      const loX = b[2] + pad - half;
      const hiX = b[0] - pad + half;
      const loY = b[3] + pad - half;
      const hiY = b[1] - pad + half;
      if (loX <= hiX) {
        const want = clamp(needX, loX, hiX);
        needX += (want - needX) * influence;
      }
      if (loY <= hiY) {
        const want = clamp(needY, loY, hiY);
        needY += (want - needY) * influence;
      }
    }
    cx[i] = needX;
    cy[i] = needY;
  }

  cx = forwardBackwardSmooth(cx, 0.5);
  cy = forwardBackwardSmooth(cy, 0.5);

  // ── Dead Zone + Geschwindigkeits-/Beschleunigungsgrenzen ────────────
  const maxPan = size * MAX_PAN_PER_FRAME;
  const maxAccel = size * MAX_ACCEL_PER_FRAME;
  const outCx: number[] = new Array(n);
  const outCy: number[] = new Array(n);
  let prevX = cx[0];
  let prevY = cy[0];
  let velX = 0;
  let velY = 0;

  for (let i = 0; i < n; i++) {
    let targetX = cx[i];
    let targetY = cy[i];

    // Dead Zone: Mikrobewegungen werden nicht nachgeführt.
    if (Math.abs(targetX - prevX) < deadX * 0.5) targetX = prevX;
    if (Math.abs(targetY - prevY) < deadY * 0.5) targetY = prevY;

    let wantVelX = targetX - prevX;
    let wantVelY = targetY - prevY;

    // Beschleunigung begrenzen, dann Geschwindigkeit begrenzen.
    wantVelX = clamp(wantVelX, velX - maxAccel, velX + maxAccel);
    wantVelY = clamp(wantVelY, velY - maxAccel, velY + maxAccel);
    wantVelX = clamp(wantVelX, -maxPan, maxPan);
    wantVelY = clamp(wantVelY, -maxPan, maxPan);

    velX = wantVelX;
    velY = wantVelY;
    prevX = clamp(prevX + velX, half, Math.max(half, input.plateWidth - half));
    prevY = clamp(prevY + velY, half, Math.max(half, input.plateHeight - half));

    outCx[i] = prevX;
    outCy[i] = prevY;
  }

  // ── Pfad materialisieren ────────────────────────────────────────────
  const path: CropWindow[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = clamp(Math.round(outCx[i] - half), 0, maxX);
    const y = clamp(Math.round(outCy[i] - half), 0, maxY);
    path[i] = { x: x % 2 === 0 ? x : Math.max(0, x - 1), y: y % 2 === 0 ? y : Math.max(0, y - 1), size };
  }

  // ── Metriken ────────────────────────────────────────────────────────
  let contained = 0;
  let total = 0;
  let wContained = 0;
  let wTotal = 0;
  for (let i = 0; i < n; i++) {
    const b = boxes[i];
    if (!b) continue;
    const w = Math.max(0, weights[i]);
    const c = path[i];
    const inside =
      b[0] >= c.x && b[1] >= c.y && b[2] <= c.x + c.size && b[3] <= c.y + c.size;
    total++;
    wTotal += w;
    if (inside) {
      contained++;
      wContained += w;
    }
  }

  let maxJump = 0;
  let maxVelocity = 0;
  let maxAcceleration = 0;
  let prevVx = 0;
  let prevVy = 0;
  for (let i = 1; i < n; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const d = Math.hypot(dx, dy) / size;
    if (d > maxJump) maxJump = d;
    if (d > maxVelocity) maxVelocity = d;
    const a = Math.hypot(dx - prevVx, dy - prevVy) / size;
    if (i > 1 && a > maxAcceleration) maxAcceleration = a;
    prevVx = dx;
    prevVy = dy;
  }

  return {
    path,
    size,
    containedRatio: total > 0 ? contained / total : 0,
    weightedContainedRatio: wTotal > 0 ? wContained / wTotal : 0,
    maxJump,
    maxVelocity,
    maxAcceleration,
    maxGapFrames: filled.maxGapFrames,
    interpolatedFrames: filled.interpolatedFrames,
    reacquisitionFrames: filled.reacquisitionFrames,
    moving: maxJump > 0.001,
  };
}

// ── Schritt 5: Boxen in den BEWEGTEN Crop-Raum transformieren ─────────────

export interface ProviderBoxResult {
  boxes: Array<[number, number, number, number] | null>;
  /** Frames, deren Box nach der Transformation ungültig war. */
  invalidFrames: number[];
  /** Frames, in denen die Box vollständig im Ausgaberaum lag. */
  validFrames: number;
}

/**
 * Rechnet jede Gesichtsbox gegen das an DIESEM Frame gültige Crop-Fenster.
 *
 * Das ist der Punkt, an dem v358 noch scheiterte: dort wurde gegen ein
 * festes Fenster gerechnet. Sind Fenster und Box zeitlich entkoppelt, ist
 * die Box mathematisch korrekt und zeigt trotzdem ins Leere.
 *
 * Kontext-Padding ist Absicht — Sync 3 arbeitet nachweislich mit Umfeld
 * (Kiefer, Wangen, etwas Hals) besser als mit einem engen Mundausschnitt.
 */
export function transformBoxesToCropSpace(params: {
  boxes: Array<Box | null>;
  path: CropWindow[];
  outputSize: number;
  /** Zusätzlicher Kontextrand, Anteil der Boxseite. */
  contextPad?: number;
  minSidePx?: number;
}): ProviderBoxResult {
  const out: Array<[number, number, number, number] | null> = [];
  const invalidFrames: number[] = [];
  const pad = params.contextPad ?? 0.18;
  const minSide = params.minSidePx ?? 8;
  let validFrames = 0;

  for (let i = 0; i < params.boxes.length; i++) {
    const b = params.boxes[i];
    const c = params.path[i];
    if (!b || !c || !(c.size > 0)) {
      out.push(null);
      continue;
    }
    const bw = boxWidth(b);
    const bh = boxHeight(b);
    const px = bw * pad;
    const py = bh * pad;
    const scale = params.outputSize / c.size;

    let x1 = (b[0] - px - c.x) * scale;
    let y1 = (b[1] - py - c.y) * scale;
    let x2 = (b[2] + px - c.x) * scale;
    let y2 = (b[3] + py - c.y) * scale;

    if (![x1, y1, x2, y2].every((v) => Number.isFinite(v))) {
      invalidFrames.push(i);
      out.push(null);
      continue;
    }

    x1 = clamp(x1, 0, params.outputSize);
    y1 = clamp(y1, 0, params.outputSize);
    x2 = clamp(x2, 0, params.outputSize);
    y2 = clamp(y2, 0, params.outputSize);

    if (x2 - x1 < minSide || y2 - y1 < minSide) {
      // Die Box ist im Ausgaberaum kollabiert — das Gesicht liegt (fast)
      // außerhalb des Ausschnitts. Ehrlich `null` statt einer Scheinbox.
      invalidFrames.push(i);
      out.push(null);
      continue;
    }

    validFrames++;
    out.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]);
  }

  return { boxes: out, invalidFrames, validFrames };
}

// ── Schritt 6: Sprachgewichte ─────────────────────────────────────────────

/**
 * Gewichtet Frames nach tatsächlicher Sprachaktivität.
 *
 * Für Sync ist nicht jeder Frame gleich wichtig. Fehlt das Gesicht während
 * eines Handles, ist das folgenlos; fehlt es beim Silbenbeginn, entsteht
 * genau der Passthrough, den wir bekämpfen.
 */
export function buildSpeechWeights(params: {
  frameCount: number;
  fps: number;
  /** Sprech-Fenster in der Zeitbasis des Clips, Sekunden. */
  voicedWindowsSec: Array<[number, number]>;
  /** Handle-Länge am Anfang/Ende, Sekunden. */
  handleSec?: number;
}): number[] {
  const { frameCount, fps } = params;
  const handleFrames = Math.round((params.handleSec ?? 0.2) * fps);
  const weights = new Array<number>(frameCount).fill(SILENCE_WEIGHT);

  const windows = (params.voicedWindowsSec ?? []).filter(
    ([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s,
  );

  if (windows.length === 0) {
    // Ohne Fenster gilt der gesamte Clip als Sprachkern — außer den Handles.
    for (let i = 0; i < frameCount; i++) {
      weights[i] = i < handleFrames || i >= frameCount - handleFrames ? HANDLE_WEIGHT : 1;
    }
    return weights;
  }

  for (const [s, e] of windows) {
    const fs = clamp(Math.floor(s * fps), 0, frameCount - 1);
    const fe = clamp(Math.ceil(e * fps), 0, frameCount - 1);
    for (let i = fs; i <= fe; i++) weights[i] = 1;
  }
  for (let i = 0; i < Math.min(handleFrames, frameCount); i++) {
    if (weights[i] < 1) weights[i] = HANDLE_WEIGHT;
  }
  for (let i = Math.max(0, frameCount - handleFrames); i < frameCount; i++) {
    if (weights[i] < 1) weights[i] = HANDLE_WEIGHT;
  }
  return weights;
}
