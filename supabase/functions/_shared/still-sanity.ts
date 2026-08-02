/**
 * still-sanity.ts (v397) — Leerbild-Erkennung für Probe-Stills.
 * ==========================================================================
 * Ein von AWS gerendertes Still kann schwarz/uniform sein (Seek daneben,
 * Decoder noch nicht bereit, Clipende). Rekognition meldet darauf
 * zuverlässig "0 Gesichter" — und das wurde bisher als Beweis gewertet,
 * dass im Preclip kein Gesicht ist. Das ist falsch: ein leeres Bild ist ein
 * MESSAUSFALL, kein Befund.
 *
 * Dieses Modul lädt das Still einmal und entscheidet anhand von Bytegröße
 * und Luminanz-Statistik, ob überhaupt Bildinhalt vorhanden ist.
 */

import { decode as decodePng } from "npm:fast-png@6.2.0";

/** Unter dieser Bytegröße ist ein PNG praktisch garantiert leer. */
export const MIN_STILL_BYTES = 2_000;
/** Standardabweichung der Luminanz, unter der ein Bild als uniform gilt. */
export const MIN_LUMA_STDDEV = 3.5;
/** Mittlere Luminanz, unter der ein Bild als "schwarz" gilt. */
export const MAX_BLACK_LUMA_MEAN = 6;

export interface StillSanity {
  /** true = Bild hat auswertbaren Inhalt. */
  usable: boolean;
  /** Kurzcode für Forensik/Fehlertexte. */
  code: "ok" | "still_blank" | "still_black" | "still_too_small" | "still_fetch_failed" | "still_undecodable";
  bytes: number;
  lumaMean?: number;
  lumaStdDev?: number;
  reason?: string;
}

/**
 * Prüft ein Probe-Still. Wirft nie — jeder Fehler wird als nicht-nutzbares
 * Bild mit Grund gemeldet, damit der Aufrufer "Ausfall" von "kein Gesicht"
 * unterscheiden kann.
 */
export async function inspectStill(url: string, timeoutMs = 12_000): Promise<StillSanity> {
  let bytes = 0;
  let data: Uint8Array;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let buf: ArrayBuffer;
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        return { usable: false, code: "still_fetch_failed", bytes: 0, reason: `http_${res.status}` };
      }
      buf = await res.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
    data = new Uint8Array(buf);
    bytes = data.byteLength;
  } catch (e) {
    return {
      usable: false,
      code: "still_fetch_failed",
      bytes: 0,
      reason: (e as Error)?.message ?? String(e),
    };
  }

  if (bytes < MIN_STILL_BYTES) {
    return { usable: false, code: "still_too_small", bytes, reason: `${bytes}B < ${MIN_STILL_BYTES}B` };
  }

  let png: { width: number; height: number; channels: number; data: ArrayLike<number> };
  try {
    png = decodePng(data) as typeof png;
  } catch (e) {
    // Kein PNG (z. B. JPEG aus dem Client-Canvas-Cache): Bytegröße ist dann
    // das einzige Signal, und die hat oben schon bestanden.
    return {
      usable: true,
      code: "ok",
      bytes,
      reason: `undecodable_but_large:${(e as Error)?.message ?? "unknown"}`,
    };
  }

  const ch = Math.max(1, png.channels || 1);
  const px = png.width * png.height;
  if (px <= 0) {
    return { usable: false, code: "still_undecodable", bytes, reason: "zero_pixels" };
  }

  // Gleichmäßig über das Bild samplen — volle Iteration kostet auf 960²
  // unnötig Zeit und Speicher im Edge-Worker.
  const stride = Math.max(1, Math.floor(px / 20_000));
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < px; i += stride) {
    const o = i * ch;
    const r = Number(png.data[o] ?? 0);
    const g = ch >= 3 ? Number(png.data[o + 1] ?? 0) : r;
    const b = ch >= 3 ? Number(png.data[o + 2] ?? 0) : r;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += y;
    sumSq += y * y;
    n++;
  }
  if (n === 0) {
    return { usable: false, code: "still_undecodable", bytes, reason: "no_samples" };
  }

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stdDev = Math.sqrt(variance);

  if (mean <= MAX_BLACK_LUMA_MEAN && stdDev < MIN_LUMA_STDDEV) {
    return {
      usable: false,
      code: "still_black",
      bytes,
      lumaMean: mean,
      lumaStdDev: stdDev,
      reason: `mean=${mean.toFixed(2)} stddev=${stdDev.toFixed(2)}`,
    };
  }
  if (stdDev < MIN_LUMA_STDDEV) {
    return {
      usable: false,
      code: "still_blank",
      bytes,
      lumaMean: mean,
      lumaStdDev: stdDev,
      reason: `uniform_frame mean=${mean.toFixed(2)} stddev=${stdDev.toFixed(2)}`,
    };
  }

  return { usable: true, code: "ok", bytes, lumaMean: mean, lumaStdDev: stdDev };
}
