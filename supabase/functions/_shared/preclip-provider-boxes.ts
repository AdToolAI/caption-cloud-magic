/**
 * preclip-provider-boxes.ts — v396 Schritt 6
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sync.so verlangt genau einen Eintrag pro Frame des INPUT-Videos, in dessen
 * Pixelraum — bei uns also der echte, fertig encodierte Preclip.
 *
 * Bisher wurden entweder Standboxen oder ungeglättete Einzelmessungen
 * gesendet. Beides ist falsch: die Standbox verliert den Kopf bei Bewegung,
 * unabhängige Rohmessungen erzeugen Box-Jitter.
 *
 * Ab v396:
 *   Detektion auf belastbaren Frames
 *     → Identitätsbindung (siehe preclip-identity-binding.ts)
 *     → zeitlicher Track
 *     → kurze Lücken interpolieren
 *     → Center und Boxgrösse glätten
 *     → genau ein validierter Eintrag pro DEKODIERTEM Frame
 *
 * Die Länge wird hart gegen die real dekodierte Framezahl geprüft (ffprobe
 * am encodierten Preclip), NICHT gegen die geplante Remotion-Framezahl.
 */

export type Box = [number, number, number, number];

export interface TrackObservation {
  /** Lokaler Preclip-Frameindex. */
  preclipFrame: number;
  box: Box;
}

export interface ProviderBoxesResult {
  ok: boolean;
  reason?: string;
  boxes: Box[];
  /** Anzahl interpolierter bzw. extrapolierter Frames. */
  filledFrames: number;
  observedFrames: number;
}

/** Längste Erkennungslücke, die noch interpoliert werden darf (Frames). */
export const MAX_INTERPOLATION_GAP = 12;
/** Fensterbreite der gleitenden Glättung (ungerade). */
export const SMOOTHING_WINDOW = 5;

function boxCenter(b: Box): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function clampBox(b: Box, w: number, h: number): Box {
  return [
    Math.max(0, Math.min(w, Math.round(b[0]))),
    Math.max(0, Math.min(h, Math.round(b[1]))),
    Math.max(0, Math.min(w, Math.round(b[2]))),
    Math.max(0, Math.min(h, Math.round(b[3]))),
  ];
}

function smooth(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k < 0 || k >= values.length) continue;
      sum += values[k];
      n++;
    }
    return sum / n;
  });
}

/**
 * Baut den Provider-Payload aus einem identitätsgebundenen Track.
 *
 * @param decodedFrameCount Real dekodierte Framezahl des encodierten Preclips.
 */
export function buildProviderBoxes(params: {
  observations: readonly TrackObservation[];
  decodedFrameCount: number;
  clipWidth: number;
  clipHeight: number;
  maxGap?: number;
  smoothingWindow?: number;
}): ProviderBoxesResult {
  const { decodedFrameCount, clipWidth, clipHeight } = params;
  const maxGap = params.maxGap ?? MAX_INTERPOLATION_GAP;

  if (!Number.isInteger(decodedFrameCount) || decodedFrameCount <= 0) {
    return {
      ok: false,
      reason: `decoded_preclip_frame_count is unknown (${String(decodedFrameCount)}) — cannot build a provider payload`,
      boxes: [],
      filledFrames: 0,
      observedFrames: 0,
    };
  }

  const obs = [...params.observations]
    .filter(
      (o) =>
        Number.isInteger(o.preclipFrame) &&
        o.preclipFrame >= 0 &&
        o.preclipFrame < decodedFrameCount &&
        o.box.every((n) => Number.isFinite(n)),
    )
    .sort((a, b) => a.preclipFrame - b.preclipFrame);

  if (obs.length === 0) {
    return {
      ok: false,
      reason: "no identity-bound observations — refusing to emit a still or auto-detect payload",
      boxes: [],
      filledFrames: 0,
      observedFrames: 0,
    };
  }

  // Grösste Lücke prüfen, bevor interpoliert wird.
  for (let i = 1; i < obs.length; i++) {
    const gap = obs[i].preclipFrame - obs[i - 1].preclipFrame - 1;
    if (gap > maxGap) {
      return {
        ok: false,
        reason: `detection gap of ${gap} frames between ${obs[i - 1].preclipFrame} and ${obs[i].preclipFrame} exceeds ${maxGap}`,
        boxes: [],
        filledFrames: 0,
        observedFrames: obs.length,
      };
    }
  }

  // Center + Grösse getrennt interpolieren: das hält die Box stabil, auch
  // wenn der Detektor bei einzelnen Frames enger oder weiter misst.
  const cx: number[] = new Array(decodedFrameCount);
  const cy: number[] = new Array(decodedFrameCount);
  const bw: number[] = new Array(decodedFrameCount);
  const bh: number[] = new Array(decodedFrameCount);
  let filledFrames = 0;

  const at = (idx: number) => {
    const b = obs[idx].box;
    const c = boxCenter(b);
    return { c, w: b[2] - b[0], h: b[3] - b[1] };
  };

  for (let f = 0; f < decodedFrameCount; f++) {
    let nextIdx = obs.findIndex((o) => o.preclipFrame >= f);
    if (nextIdx === -1) nextIdx = obs.length - 1;
    const exact = obs[nextIdx]?.preclipFrame === f;
    if (exact) {
      const a = at(nextIdx);
      cx[f] = a.c[0];
      cy[f] = a.c[1];
      bw[f] = a.w;
      bh[f] = a.h;
      continue;
    }
    filledFrames++;
    const prevIdx = nextIdx > 0 && obs[nextIdx].preclipFrame > f ? nextIdx - 1 : nextIdx;
    const A = at(Math.max(0, prevIdx));
    const B = at(nextIdx);
    const fa = obs[Math.max(0, prevIdx)].preclipFrame;
    const fb = obs[nextIdx].preclipFrame;
    const t = fb === fa ? 0 : Math.max(0, Math.min(1, (f - fa) / (fb - fa)));
    cx[f] = A.c[0] + (B.c[0] - A.c[0]) * t;
    cy[f] = A.c[1] + (B.c[1] - A.c[1]) * t;
    bw[f] = A.w + (B.w - A.w) * t;
    bh[f] = A.h + (B.h - A.h) * t;
  }

  const win = params.smoothingWindow ?? SMOOTHING_WINDOW;
  const sx = smooth(cx, win);
  const sy = smooth(cy, win);
  const sw = smooth(bw, win);
  const sh = smooth(bh, win);

  const boxes: Box[] = [];
  for (let f = 0; f < decodedFrameCount; f++) {
    boxes.push(
      clampBox([sx[f] - sw[f] / 2, sy[f] - sh[f] / 2, sx[f] + sw[f] / 2, sy[f] + sh[f] / 2], clipWidth, clipHeight),
    );
  }

  return { ok: true, boxes, filledFrames, observedFrames: obs.length };
}

/**
 * Harte Vertragsprüfung unmittelbar vor dem Dispatch.
 * `decodedFrameCount` MUSS aus ffprobe am encodierten Preclip stammen.
 */
export function assertProviderBoxContract(
  boxes: readonly Box[],
  decodedFrameCount: number,
): { ok: boolean; reason?: string } {
  if (!Number.isInteger(decodedFrameCount) || decodedFrameCount <= 0) {
    return { ok: false, reason: "decoded_preclip_frame_count missing" };
  }
  if (boxes.length !== decodedFrameCount) {
    return {
      ok: false,
      reason: `bounding box count ${boxes.length} !== decoded preclip frame count ${decodedFrameCount}`,
    };
  }
  const bad = boxes.findIndex(
    (b) => !Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isFinite(n)) || b[2] <= b[0] || b[3] <= b[1],
  );
  if (bad >= 0) return { ok: false, reason: `degenerate bounding box at frame ${bad}` };
  return { ok: true };
}
