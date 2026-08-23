/**
 * V461 B + C — SEMANTIC INPUT FINGERPRINT + HONEST DISPATCH TELEMETRY
 * ---------------------------------------------------------------------------
 * V461 Stufe 1 proved that the NOOP ladder does NOT change the input the
 * provider sees: `bbox-url-pro` and `coords-pro-box` ship byte-identical video,
 * byte-identical audio and identical box coordinates — only the TRANSPORT of
 * the boxes differs (uploaded JSON vs. inline array). Repeating a dispatch
 * whose SEMANTIC input is unchanged cannot produce a different result; it only
 * burns wall-time and money.
 *
 * Therefore:
 *   - the rung stays (Stufe 1 disproved the "coords-pro-box is the cause"
 *     hypothesis — see docs/v461-stage1-dispatch-parity.md),
 *   - but a re-dispatch is only allowed when the SEMANTIC fingerprint changes.
 *
 * C: telemetry must describe the file that was actually sent. `unknown` (null)
 * is always better than a plate value on a pre-clip dispatch.
 *
 * PURE module — no I/O, no thresholds, deterministic.
 */

export const V461_FINGERPRINT_VERSION = "v461.1";

/** Rungs that only change how the boxes travel, not what they say. */
export const V461_TRANSPORT_ONLY_VARIANTS = new Set([
  "bbox-url-pro",
  "coords-pro-box",
]);

export const isTransportOnlyVariant = (variant?: string | null): boolean =>
  !!variant && V461_TRANSPORT_ONLY_VARIANTS.has(String(variant));

/** Deterministic 64-bit FNV-1a, hex — stable across runtimes, no crypto. */
export function stableHash(value: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < value.length; i++) {
    h = (h ^ BigInt(value.charCodeAt(i))) * prime & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Storage identity of a signed URL: the object path without query string.
 * Signed tokens rotate per request and must never enter a fingerprint.
 */
export function objectPathOf(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const noQuery = url.split("?")[0];
  const marker = "/object/";
  const idx = noQuery.indexOf(marker);
  const tail = idx >= 0 ? noQuery.slice(idx + marker.length) : noQuery;
  return tail.replace(/^(sign|public|authenticated)\//, "");
}

const round = (n: unknown, digits = 3): number | null => {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export interface V461SemanticInput {
  videoUrl?: string | null;
  videoBytes?: number | null;
  audioUrl?: string | null;
  audioBytes?: number | null;
  audioDurSec?: number | null;
  frameCount?: number | null;
  dispatchFps?: number | null;
  /** Per-frame boxes in DISPATCH coordinate space. */
  boundingBoxes?: (number[] | null)[] | null;
  /** Static dispatch box. */
  bbox?: number[] | null;
  coordinateSpace?: string | null;
  voicedWindows?: number[][] | null;
  model?: string | null;
  syncMode?: string | null;
  speakerIdx?: number | null;
}

export interface V461TransportInput {
  /** `url` (bounding_boxes_url) or `inline` (bounding_boxes). */
  asdTransport?: string | null;
  retryVariant?: string | null;
}

export interface V461Fingerprint {
  semantic: string;
  transport: string;
  version: string;
  parts: Record<string, unknown>;
}

function canonicalBoxes(input: V461SemanticInput): string {
  const boxes = Array.isArray(input.boundingBoxes) ? input.boundingBoxes : [];
  if (boxes.length > 0) {
    return boxes
      .map((b) =>
        Array.isArray(b) && b.length === 4
          ? b.map((n) => Math.round(Number(n))).join(",")
          : "null"
      )
      .join("|");
  }
  const b = input.bbox;
  return Array.isArray(b) && b.length === 4
    ? b.map((n) => Math.round(Number(n))).join(",")
    : "none";
}

/** PURE — semantic (what the provider is asked to do) + transport (how). */
export function computeInputFingerprint(
  semanticInput: V461SemanticInput,
  transportInput: V461TransportInput = {},
): V461Fingerprint {
  const boxesCanonical = canonicalBoxes(semanticInput);
  const parts: Record<string, unknown> = {
    video_object: objectPathOf(semanticInput.videoUrl),
    video_bytes: Number(semanticInput.videoBytes) || 0,
    audio_object: objectPathOf(semanticInput.audioUrl),
    audio_bytes: Number(semanticInput.audioBytes) || 0,
    audio_dur_sec: round(semanticInput.audioDurSec) ?? 0,
    frame_count: Number(semanticInput.frameCount) || 0,
    dispatch_fps: round(semanticInput.dispatchFps, 2) ?? 0,
    boxes_hash: stableHash(boxesCanonical),
    boxes_count: Array.isArray(semanticInput.boundingBoxes)
      ? semanticInput.boundingBoxes.length
      : 0,
    coordinate_space: String(semanticInput.coordinateSpace ?? "unknown"),
    voiced_windows: (semanticInput.voicedWindows ?? [])
      .map((w) => `${round(w?.[0]) ?? 0}-${round(w?.[1]) ?? 0}`)
      .join("|"),
    model: String(semanticInput.model ?? ""),
    sync_mode: String(semanticInput.syncMode ?? ""),
    speaker_idx: Number(semanticInput.speakerIdx ?? -1),
  };
  const semantic = stableHash(
    Object.keys(parts).sort().map((k) => `${k}=${String(parts[k])}`).join(";"),
  );
  const transportParts = {
    asd_transport: String(transportInput.asdTransport ?? "unknown"),
    retry_variant: String(transportInput.retryVariant ?? "none"),
  };
  const transport = stableHash(
    `${semantic};${transportParts.asd_transport};${transportParts.retry_variant}`,
  );
  return {
    semantic,
    transport,
    version: V461_FINGERPRINT_VERSION,
    parts: { ...parts, ...transportParts },
  };
}

export interface V461RedispatchDecision {
  allow: boolean;
  code: string;
  reason: string;
}

/**
 * PURE — may a NOOP be escalated onto the next rung?
 *
 * Blocked when the planned rung is transport-only AND the semantic fingerprint
 * it would carry has already been dispatched. Everything else stays allowed:
 * an unknown fingerprint never blocks (fail-open — the ladder keeps its old
 * behaviour when telemetry is missing).
 */
export function evaluateNoopRedispatch(input: {
  nextVariant?: string | null;
  plannedSemanticFingerprint?: string | null;
  seenSemanticFingerprints?: (string | null | undefined)[] | null;
}): V461RedispatchDecision {
  const planned = (input.plannedSemanticFingerprint ?? "").trim();
  if (!planned) {
    return {
      allow: true,
      code: "fingerprint_unknown",
      reason: "no_semantic_fingerprint_recorded",
    };
  }
  if (!isTransportOnlyVariant(input.nextVariant)) {
    return {
      allow: true,
      code: "variant_changes_semantics",
      reason: `variant_${input.nextVariant ?? "none"}_not_transport_only`,
    };
  }
  const seen = (input.seenSemanticFingerprints ?? []).filter(Boolean).map(String);
  if (seen.includes(planned)) {
    return {
      allow: false,
      code: "semantic_input_unchanged",
      reason: "transport_only_rung_with_identical_semantic_input",
    };
  }
  return { allow: true, code: "semantic_input_new", reason: "fingerprint_not_seen_before" };
}

export interface V461AssetTelemetry {
  url_hash: string;
  object_path: string;
  bytes: number | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
  source: "dispatch_probe" | "preclip_geometry" | "unknown";
}

/**
 * PURE — C. Telemetry for the asset that was ACTUALLY dispatched.
 * Never falls back to plate dimensions: unknown is reported as `null`.
 */
export function buildDispatchVideoTelemetry(input: {
  url?: string | null;
  probeBytes?: number | null;
  probeContentType?: string | null;
  /** Provider output size of the pre-clip (square), when known. */
  preclipOutputSize?: number | null;
  width?: number | null;
  height?: number | null;
}): V461AssetTelemetry {
  const objectPath = objectPathOf(input.url);
  const bytes = Number.isFinite(Number(input.probeBytes)) && Number(input.probeBytes) > 0
    ? Number(input.probeBytes)
    : null;
  let width = Number.isFinite(Number(input.width)) ? Number(input.width) : null;
  let height = Number.isFinite(Number(input.height)) ? Number(input.height) : null;
  let source: V461AssetTelemetry["source"] = width && height ? "dispatch_probe" : "unknown";
  if ((!width || !height) && Number(input.preclipOutputSize) > 0) {
    width = Number(input.preclipOutputSize);
    height = Number(input.preclipOutputSize);
    source = "preclip_geometry";
  }
  return {
    url_hash: objectPath ? stableHash(objectPath).slice(0, 12) : "",
    object_path: objectPath,
    bytes,
    content_type: input.probeContentType ?? null,
    width: width ?? null,
    height: height ?? null,
    source,
  };
}
