/**
 * FA-4 v406 — Frozen Provider Input Snapshot / Retry-Wire Parity.
 *
 * PURE module. No IO, no Deno APIs — unit-testable with plain vitest/deno test.
 *
 * Contract (frozen):
 *   Fresh dispatch and NOOP retry dispatch MUST send the exact same provider
 *   wire. The only permitted difference is the ASD transport:
 *
 *     fresh : active_speaker_detection = { auto_detect:false, bounding_boxes_url }
 *             (the JSON behind that URL is byte-equal to snapshot.bounding_boxes)
 *     retry : active_speaker_detection = { auto_detect:false, bounding_boxes }
 *
 * `buildProviderWire()` is the ONLY production source for every frozen wire
 * field. Nothing downstream of it may recompute or overwrite video_url,
 * audio_url, model, sync_mode, ASD, bbox/bounding_boxes, frame_count or
 * dispatch_fps.
 */

export type WireBox = [number, number, number, number];
export type WireBoxOrNull = WireBox | null;
export type WireWindow = [number, number];

export interface ProviderWireSnapshot {
  video_url: string;
  audio_url: string;
  bbox: WireBox;
  bounding_boxes: WireBoxOrNull[];
  frame_count: number;
  dispatch_fps: number;
  voiced_windows: WireWindow[];
  sync_mode: string;
  model: string;
  speaker_idx: number;
  segment_id: string;
  run_id: string | null;
  plate_generation: number;
}

export type AsdTransport = "url" | "inline";

export type ProviderAsd =
  | { auto_detect: false; bounding_boxes_url: string }
  | { auto_detect: false; bounding_boxes: WireBoxOrNull[] };

export interface ProviderWire {
  model: string;
  video_url: string;
  audio_url: string;
  sync_mode: string;
  bbox: WireBox;
  frame_count: number;
  dispatch_fps: number;
  voiced_windows: WireWindow[];
  speaker_idx: number;
  segment_id: string;
  run_id: string | null;
  plate_generation: number;
  active_speaker_detection: ProviderAsd;
}

/** Field list of the frozen snapshot — used for completeness validation. */
export const PROVIDER_WIRE_SNAPSHOT_FIELDS = [
  "video_url",
  "audio_url",
  "bbox",
  "bounding_boxes",
  "frame_count",
  "dispatch_fps",
  "voiced_windows",
  "sync_mode",
  "model",
  "speaker_idx",
  "segment_id",
  "run_id",
  "plate_generation",
] as const;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isBox = (v: unknown): v is WireBox =>
  Array.isArray(v) && v.length === 4 && v.every((n) => Number.isFinite(Number(n)));

const normalizeBox = (v: WireBox): WireBox => [
  Math.round(Number(v[0])),
  Math.round(Number(v[1])),
  Math.round(Number(v[2])),
  Math.round(Number(v[3])),
];

const normalizeWindow = (v: unknown): WireWindow | null => {
  if (!Array.isArray(v) || v.length < 2) return null;
  const s = Number(v[0]);
  const e = Number(v[1]);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return [Number(s.toFixed(3)), Number(e.toFixed(3))];
};

export interface BuildProviderWireSnapshotInput {
  videoUrl: unknown;
  audioUrl: unknown;
  bbox: unknown;
  boundingBoxes: unknown;
  frameCount: unknown;
  dispatchFps: unknown;
  voicedWindows: unknown;
  syncMode: unknown;
  model: unknown;
  speakerIdx: unknown;
  segmentId: unknown;
  runId: unknown;
  plateGeneration: unknown;
}

export class ProviderWireSnapshotError extends Error {
  readonly field: string;
  constructor(field: string, detail?: string) {
    super(`provider_wire_snapshot_invalid:${field}${detail ? `:${detail}` : ""}`);
    this.field = field;
    this.name = "ProviderWireSnapshotError";
  }
}

/**
 * Build the normalized, frozen snapshot. Throws `ProviderWireSnapshotError`
 * when any contract field is missing or unusable — the caller MUST fail
 * closed before any provider call.
 */
export function buildProviderWireSnapshot(
  input: BuildProviderWireSnapshotInput,
): ProviderWireSnapshot {
  if (!isNonEmptyString(input.videoUrl)) throw new ProviderWireSnapshotError("video_url");
  if (!isNonEmptyString(input.audioUrl)) throw new ProviderWireSnapshotError("audio_url");
  if (!isBox(input.bbox)) throw new ProviderWireSnapshotError("bbox");
  if (!Array.isArray(input.boundingBoxes) || input.boundingBoxes.length === 0) {
    throw new ProviderWireSnapshotError("bounding_boxes");
  }
  const frameCount = Math.round(Number(input.frameCount));
  if (!Number.isFinite(frameCount) || frameCount < 1) {
    throw new ProviderWireSnapshotError("frame_count");
  }
  const dispatchFps = Number(input.dispatchFps);
  if (!Number.isFinite(dispatchFps) || dispatchFps <= 0) {
    throw new ProviderWireSnapshotError("dispatch_fps");
  }
  if (!isNonEmptyString(input.syncMode)) throw new ProviderWireSnapshotError("sync_mode");
  if (!isNonEmptyString(input.model)) throw new ProviderWireSnapshotError("model");
  const speakerIdx = Math.round(Number(input.speakerIdx));
  if (!Number.isFinite(speakerIdx) || speakerIdx < 0) {
    throw new ProviderWireSnapshotError("speaker_idx");
  }
  if (!isNonEmptyString(input.segmentId)) throw new ProviderWireSnapshotError("segment_id");
  const plateGeneration = Number(input.plateGeneration ?? 0);
  if (!Number.isFinite(plateGeneration)) throw new ProviderWireSnapshotError("plate_generation");

  const boundingBoxes: WireBoxOrNull[] = (input.boundingBoxes as unknown[]).map((b) => {
    if (b == null) return null;
    if (!isBox(b)) throw new ProviderWireSnapshotError("bounding_boxes", "non_box_entry");
    return normalizeBox(b);
  });
  if (boundingBoxes.length !== frameCount) {
    throw new ProviderWireSnapshotError(
      "bounding_boxes",
      `length_${boundingBoxes.length}_!=_frame_count_${frameCount}`,
    );
  }

  const rawWindows = Array.isArray(input.voicedWindows) ? input.voicedWindows : [];
  const voicedWindows: WireWindow[] = [];
  for (const w of rawWindows) {
    const nw = normalizeWindow(w);
    if (!nw) throw new ProviderWireSnapshotError("voiced_windows", "non_numeric_window");
    voicedWindows.push(nw);
  }

  return {
    video_url: String(input.videoUrl),
    audio_url: String(input.audioUrl),
    bbox: normalizeBox(input.bbox),
    bounding_boxes: boundingBoxes,
    frame_count: frameCount,
    dispatch_fps: dispatchFps,
    voiced_windows: voicedWindows,
    sync_mode: String(input.syncMode),
    model: String(input.model),
    speaker_idx: speakerIdx,
    segment_id: String(input.segmentId),
    run_id: isNonEmptyString(input.runId) ? String(input.runId) : null,
    plate_generation: plateGeneration,
  };
}

/**
 * Read the persisted frozen snapshot off a dialog pass.
 * Returns `null` when it is absent OR incomplete — an incomplete snapshot is
 * treated exactly like a missing one (fail closed, no legacy rebuild).
 */
export function resolveFrozenProviderInput(
  pass: Record<string, unknown> | null | undefined,
): ProviderWireSnapshot | null {
  if (!pass || typeof pass !== "object") return null;
  const raw = (pass as Record<string, unknown>)["provider_input_frozen"];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const field of PROVIDER_WIRE_SNAPSHOT_FIELDS) {
    if (field === "run_id") continue; // nullable by contract
    if (r[field] === undefined || r[field] === null) return null;
  }
  try {
    return buildProviderWireSnapshot({
      videoUrl: r.video_url,
      audioUrl: r.audio_url,
      bbox: r.bbox,
      boundingBoxes: r.bounding_boxes,
      frameCount: r.frame_count,
      dispatchFps: r.dispatch_fps,
      voicedWindows: r.voiced_windows,
      syncMode: r.sync_mode,
      model: r.model,
      speakerIdx: r.speaker_idx,
      segmentId: r.segment_id,
      runId: r.run_id ?? null,
      plateGeneration: r.plate_generation,
    });
  } catch {
    return null;
  }
}

/**
 * THE single production source for the provider wire. Everything the provider
 * sees is derived from the frozen snapshot; only the ASD transport differs.
 */
export function buildProviderWire(
  snapshot: ProviderWireSnapshot,
  opts: { asdTransport: AsdTransport; boundingBoxesUrl?: string | null },
): ProviderWire {
  let asd: ProviderAsd;
  if (opts.asdTransport === "url") {
    if (!isNonEmptyString(opts.boundingBoxesUrl)) {
      throw new ProviderWireSnapshotError("bounding_boxes_url", "missing_for_url_transport");
    }
    asd = { auto_detect: false, bounding_boxes_url: String(opts.boundingBoxesUrl) };
  } else {
    asd = { auto_detect: false, bounding_boxes: snapshot.bounding_boxes };
  }
  return {
    model: snapshot.model,
    video_url: snapshot.video_url,
    audio_url: snapshot.audio_url,
    sync_mode: snapshot.sync_mode,
    bbox: snapshot.bbox,
    frame_count: snapshot.frame_count,
    dispatch_fps: snapshot.dispatch_fps,
    voiced_windows: snapshot.voiced_windows,
    speaker_idx: snapshot.speaker_idx,
    segment_id: snapshot.segment_id,
    run_id: snapshot.run_id,
    plate_generation: snapshot.plate_generation,
    active_speaker_detection: asd,
  };
}

/** The exact JSON body the bounding-box upload must contain (fresh path). */
export function boundingBoxesJsonFromSnapshot(
  snapshot: ProviderWireSnapshot,
): { bounding_boxes: WireBoxOrNull[] } {
  return { bounding_boxes: snapshot.bounding_boxes };
}

/** Build the literal Sync.so /generate body from the wire. */
export function toSyncGeneratePayload(
  wire: ProviderWire,
  opts: { webhookUrl: string; extraOptions?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    model: wire.model,
    input: [
      { type: "video", url: wire.video_url },
      { type: "audio", url: wire.audio_url },
    ],
    options: {
      ...(opts.extraOptions ?? {}),
      sync_mode: wire.sync_mode,
      active_speaker_detection: wire.active_speaker_detection,
    },
    webhookUrl: opts.webhookUrl,
    webhook_url: opts.webhookUrl,
  };
}
