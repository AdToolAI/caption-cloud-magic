/**
 * V518 — DURABLE DIALOG / CINEMATIC OUTPUT AUTHORITY
 * ---------------------------------------------------------------------------
 * The V518 RCA proved two things about the Composer output lifecycle:
 *
 *   · The canonical DB writers are SQL RPCs — `composer_finalize_plate_scene`
 *     and `composer_finalize_lipsync_scene`. Both are atomic and correctly
 *     fenced on run + generation. They are NOT the defect and stay untouched.
 *   · The URL those RPCs are handed can be a raw provider URL. For a dialog
 *     scene the final output is Remotion's own AWS S3 URL, written verbatim
 *     into `processed_video_url`. We display it, build continuity on it and
 *     call the scene complete — and we do not own it.
 *
 * `compose-clip-webhook` does rehost the plate, but fail-OPEN: on any fetch or
 * upload error it keeps the provider URL and still marks the scene ready. And
 * it writes to a FIXED key (`composer/{project}/{scene}.mp4`, `upsert: true`),
 * so a successful generation 15 overwrites generation 14's bytes in place.
 *
 * This module makes the source durable BEFORE the RPC is allowed to
 * materialize it. It deliberately does NOT write `composer_scenes`, does not
 * touch pipeline state and does not decide readiness: the RPCs remain the
 * single authority. The only thing that changes is which URL they receive.
 *
 * GENERATION-SCOPED BY CONSTRUCTION
 *   composer/{projectId}/{sceneId}/gen-{generation}/base.mp4
 *   composer/{projectId}/{sceneId}/gen-{generation}/final.mp4
 *
 * `upsert: true` is safe here and unsafe at the old key for the same reason:
 * the destination carries the generation, so a repeated callback for the SAME
 * scene+generation+kind overwrites its own object (idempotent redelivery),
 * while generation 15 can never address generation 14's path.
 *
 * The base plate and the final mux are separate objects on purpose. A dialog
 * scene legitimately owns both: Sync.so consumes the plate, the viewer sees
 * the final.
 */

export type DurableOutputKind = "base" | "final";

export type DurableSourceKind =
  | "owned_destination"
  | "owned_bucket"
  | "external";

export type DurableFailureClass =
  | "invalid_input"
  | "unsupported_source"
  | "source_fetch_failed"
  | "source_too_small"
  | "upload_failed";

export const DURABLE_OUTPUT_BUCKET = "ai-videos";
export const DURABLE_OUTPUT_VERSION = "v518";
/** These are 1–60 MB mp4s; the plate rehost has used 45 s successfully. */
const FETCH_TIMEOUT_MS = 45_000;
/** Anything smaller is an error page, not a video. */
const MIN_BYTES = 1024;

export class DurableOutputError extends Error {
  readonly failureClass: DurableFailureClass;
  constructor(failureClass: DurableFailureClass, message: string) {
    super(message);
    this.name = "DurableOutputError";
    this.failureClass = failureClass;
  }
}

export interface DurableSceneOutputResult {
  /** Durable public URL inside the owned bucket. Safe as scene authority. */
  url: string;
  bucket: string;
  path: string;
  sourceKind: DurableSourceKind;
  /** false when the source already was the exact owned destination. */
  uploaded: boolean;
  bytes: number;
  durationMs: number;
}

interface SupabaseLike {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        opts?: Record<string, unknown>,
      ): Promise<{ error: { message: string } | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

/**
 * PURE — the ONE place a durable output path is built.
 *
 * Duplicated path construction is how the fixed key ended up in one webhook
 * and nowhere else; there is exactly one builder so a second layout cannot
 * quietly appear.
 */
export function durableOutputPath(input: {
  projectId: string;
  sceneId: string;
  generation: number;
  outputKind: DurableOutputKind;
}): string {
  const projectId = String(input?.projectId ?? "").trim();
  const sceneId = String(input?.sceneId ?? "").trim();
  const generation = Number(input?.generation);
  const kind = input?.outputKind;
  if (!projectId) throw new DurableOutputError("invalid_input", "projectId is required");
  if (!sceneId) throw new DurableOutputError("invalid_input", "sceneId is required");
  if (!Number.isFinite(generation) || !Number.isInteger(generation) || generation < 0) {
    throw new DurableOutputError(
      "invalid_input",
      `generation must be a non-negative integer, got ${String(input?.generation)}`,
    );
  }
  if (kind !== "base" && kind !== "final") {
    throw new DurableOutputError("invalid_input", `unknown outputKind ${String(kind)}`);
  }
  return `composer/${projectId}/${sceneId}/gen-${generation}/${kind}.mp4`;
}

/** PURE — classify what kind of transport this source URL is. */
export function classifyDurableSource(
  sourceUrl: string,
  destinationPath: string,
): DurableSourceKind {
  const url = String(sourceUrl ?? "");
  const marker = `/${DURABLE_OUTPUT_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return "external";
  const objectPath = url.slice(at + marker.length).split("?")[0];
  return objectPath === destinationPath ? "owned_destination" : "owned_bucket";
}

/** PURE — a URL safe to log: origin + path, never the query string. */
export function redactUrl(raw: unknown): string {
  const s = String(raw ?? "");
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.origin}${u.pathname}`;
  } catch {
    return s.split("?")[0].slice(0, 160);
  }
}

/**
 * Materialize `sourceUrl` as a durable, generation-scoped object in the owned
 * bucket and return its public URL.
 *
 * Throws `DurableOutputError` on every failure. Callers MUST NOT fall back to
 * the source URL: an output we cannot store is an output we do not own, and a
 * scene must not become ready on one. That fail-open fallback is the defect
 * this module exists to remove.
 */
export async function materializeDurableSceneOutput(input: {
  supabaseAdmin: SupabaseLike;
  projectId: string;
  sceneId: string;
  generation: number;
  sourceUrl: string;
  outputKind: DurableOutputKind;
}): Promise<DurableSceneOutputResult> {
  const startedAt = Date.now();
  const path = durableOutputPath(input);
  const sourceUrl = String(input?.sourceUrl ?? "").trim();
  if (!sourceUrl) {
    throw new DurableOutputError("invalid_input", "sourceUrl is required");
  }
  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new DurableOutputError(
      "unsupported_source",
      `source is not an http(s) URL: ${redactUrl(sourceUrl)}`,
    );
  }

  const store = input.supabaseAdmin.storage.from(DURABLE_OUTPUT_BUCKET);
  const sourceKind = classifyDurableSource(sourceUrl, path);

  // Already exactly where it belongs — a redelivered callback for the same
  // scene, generation and kind. Nothing to copy.
  if (sourceKind === "owned_destination") {
    return {
      url: store.getPublicUrl(path).data.publicUrl,
      bucket: DURABLE_OUTPUT_BUCKET,
      path,
      sourceKind,
      uploaded: false,
      bytes: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  let bytes: Uint8Array;
  try {
    const res = await fetch(sourceUrl, {
      method: "GET",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new DurableOutputError(
        "source_fetch_failed",
        `source fetch HTTP ${res.status} for ${redactUrl(sourceUrl)}`,
      );
    }
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof DurableOutputError) throw e;
    throw new DurableOutputError(
      "source_fetch_failed",
      `source fetch failed for ${redactUrl(sourceUrl)}: ${(e as Error)?.message ?? String(e)}`,
    );
  }
  if (bytes.byteLength < MIN_BYTES) {
    throw new DurableOutputError(
      "source_too_small",
      `source is ${bytes.byteLength} bytes — an error page, not a video`,
    );
  }

  // `upsert` is safe ONLY because the path carries the generation: it can
  // overwrite this callback's own object, never a previous generation's.
  const up = await store.upload(path, bytes, {
    contentType: "video/mp4",
    cacheControl: "604800",
    upsert: true,
  });
  if (up.error) {
    throw new DurableOutputError("upload_failed", `upload failed: ${up.error.message}`);
  }

  const publicUrl = store.getPublicUrl(path).data.publicUrl;
  if (!publicUrl) {
    throw new DurableOutputError("upload_failed", "public URL unavailable after upload");
  }

  return {
    url: publicUrl,
    bucket: DURABLE_OUTPUT_BUCKET,
    path,
    sourceKind,
    uploaded: true,
    bytes: bytes.byteLength,
    durationMs: Date.now() - startedAt,
  };
}

/** PURE — bounded telemetry. No URLs with query strings, no byte payloads. */
export function buildDurableOutputTelemetry(
  r: DurableSceneOutputResult | null,
  err: DurableOutputError | null,
  ctx: { generation: number; outputKind: DurableOutputKind; sourceUrl?: string },
): Record<string, unknown> {
  return {
    version: DURABLE_OUTPUT_VERSION,
    output_kind: ctx.outputKind,
    generation: ctx.generation,
    source_kind: r?.sourceKind ?? null,
    source: redactUrl(ctx.sourceUrl),
    destination_key: r?.path ?? null,
    uploaded: r?.uploaded ?? null,
    bytes: r?.bytes ?? null,
    ms: r?.durationMs ?? null,
    result: err ? "failed" : "ok",
    failure_class: err?.failureClass ?? null,
  };
}
