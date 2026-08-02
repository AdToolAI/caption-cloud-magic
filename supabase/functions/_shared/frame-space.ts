/**
 * frame-space.ts — v396 Schritt 1: Frame-Räume hart typisieren
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Belegter Fehler (Szene 9eded574, Pass 3):
 *   Das Gate erhielt `frame_number = 102` — einen ABSOLUTEN Plate-Frame —
 *   und prüfte damit gegen einen Preclip, der nur 68 Frames lang ist.
 *   Der Fehler blieb unsichtbar, weil der Extraktor still auf `t = 0.05 s`
 *   zurückfiel. Das Gate konnte also "funktionieren", obwohl sein
 *   Framevertrag verletzt war.
 *
 * Ab v396 sind Plate- und Preclip-Frames unterschiedliche Typen. Eine
 * Vermischung ist ein Compile-Fehler; ein Index ausserhalb der real
 * dekodierten Framezahl ist ein Runtime-Fehler mit eigenem Verdict
 * (`frame_mapping_failed`) statt eines stillen Sekunden-Fallbacks.
 *
 * Reine Typen und Guards — keine Netzwerkaufrufe, keine DB.
 */

/** Absoluter Frameindex im generierten Plate-Video. */
export type PlateFrameIndex = number & { readonly __brand: "PlateFrameIndex" };
/** Lokaler Frameindex im gerenderten Preclip (0 = erster Preclip-Frame). */
export type PreclipFrameIndex = number & { readonly __brand: "PreclipFrameIndex" };

export class FrameMappingError extends Error {
  readonly code = "frame_mapping_failed" as const;
  readonly detail: Record<string, unknown>;
  constructor(message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "FrameMappingError";
    this.detail = detail;
  }
}

function assertIntegerIndex(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new FrameMappingError(`${label} must be a non-negative integer, got ${String(value)}`, {
      label,
      value,
    });
  }
  return n;
}

export function plateFrame(value: number): PlateFrameIndex {
  return assertIntegerIndex(value, "plate_frame") as PlateFrameIndex;
}

/**
 * Preclip-Frame mit Pflicht-Schranke. `decodedFrameCount` MUSS die real
 * dekodierte Framezahl des fertig encodierten Preclips sein (ffprobe /
 * Container-Metadaten) — nicht die geplante Remotion-Framezahl.
 */
export function preclipFrame(value: number, decodedFrameCount: number): PreclipFrameIndex {
  const n = assertIntegerIndex(value, "preclip_frame");
  const count = Number(decodedFrameCount);
  if (!Number.isFinite(count) || count <= 0) {
    throw new FrameMappingError(
      `decoded_preclip_frame_count is unknown (${String(decodedFrameCount)}) — refusing to index a preclip frame`,
      { preclip_frame: n, decoded_frame_count: decodedFrameCount },
    );
  }
  if (n >= count) {
    throw new FrameMappingError(
      `preclip_frame ${n} is out of range for a preclip with ${count} decoded frames ` +
        `— this is the v396 "102 out of 68" trap`,
      { preclip_frame: n, decoded_frame_count: count },
    );
  }
  return n as PreclipFrameIndex;
}

/**
 * Plate-Frame → Preclip-Frame. Der Preclip beginnt bei
 * `preclipStartPlateFrame` (Turnstart inkl. Lead-in) im Plate-Raum.
 */
export function toPreclipFrame(
  plate: PlateFrameIndex,
  preclipStartPlateFrame: PlateFrameIndex,
  decodedFrameCount: number,
): PreclipFrameIndex {
  const local = Number(plate) - Number(preclipStartPlateFrame);
  if (local < 0) {
    throw new FrameMappingError(
      `plate_frame ${plate} lies before the preclip start ${preclipStartPlateFrame}`,
      { plate_frame: Number(plate), preclip_start: Number(preclipStartPlateFrame) },
    );
  }
  return preclipFrame(local, decodedFrameCount);
}

/** Preclip-Frame → Plate-Frame (Rückrichtung, für Forensik und T15). */
export function toPlateFrame(
  local: PreclipFrameIndex,
  preclipStartPlateFrame: PlateFrameIndex,
): PlateFrameIndex {
  return plateFrame(Number(local) + Number(preclipStartPlateFrame));
}

export interface FrameSpaceRecord {
  preclip_frame: number;
  source_plate_frame: number;
  /** Präsentationszeitstempel im Preclip, Sekunden. Nur Telemetrie. */
  preclip_pts_sec: number | null;
  decoded_preclip_frame_count: number;
  fps: number;
}

/**
 * Persistierbarer Datensatz je geprüftem Frame. Zeitstempel werden abgeleitet
 * und mitgeführt, dürfen aber nie als Quelle für die Extraktion dienen.
 */
export function frameSpaceRecord(params: {
  preclip: PreclipFrameIndex;
  preclipStartPlateFrame: PlateFrameIndex;
  decodedFrameCount: number;
  fps: number;
}): FrameSpaceRecord {
  const fps = Number(params.fps);
  return {
    preclip_frame: Number(params.preclip),
    source_plate_frame: Number(toPlateFrame(params.preclip, params.preclipStartPlateFrame)),
    preclip_pts_sec: Number.isFinite(fps) && fps > 0 ? Number(params.preclip) / fps : null,
    decoded_preclip_frame_count: Number(params.decodedFrameCount),
    fps: Number.isFinite(fps) && fps > 0 ? fps : 0,
  };
}

/**
 * Nicht-werfende Variante für Aufrufer, die den Vertragsbruch als Verdict
 * behandeln wollen statt als Exception.
 */
export function checkPreclipFrame(
  value: number,
  decodedFrameCount: number,
): { ok: true; frame: PreclipFrameIndex } | { ok: false; code: "frame_mapping_failed"; reason: string } {
  try {
    return { ok: true, frame: preclipFrame(value, decodedFrameCount) };
  } catch (e) {
    return {
      ok: false,
      code: "frame_mapping_failed",
      reason: (e as Error)?.message ?? "frame_mapping_failed",
    };
  }
}
