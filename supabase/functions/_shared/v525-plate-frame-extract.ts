/**
 * ═══════════════════════════════════════════════════════════════════════════
 * V525 — SERVER-SIDE PLATE FRAME EXTRACTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Scene 67b392b1, generation 21, Sarah pass 0. V524 registration failed with
 * `frame_extract_failed` on frame 30, V523 then correctly refused the
 * anchor-native geometry with `reference_space_mismatch`, and the pass
 * terminalized. Both gates behaved exactly as designed.
 *
 * The cause was that V524 had been wired to something that cannot extract a
 * frame. `extractFrameForFaceProbe` says so in its own header — "No
 * Replicate. No lucataco. No ffmpeg calls. Ever." — and its body is a cache
 * reader: it looks for a previously written PNG at
 * `{userId}/{projectId}/probe-frames/{sceneId}-p{n}-f{frame}.png` and returns
 * `no_cache_no_server_extract` when the object is missing. Production storage
 * held scene-anchor PNGs for this scene and zero probe frames, so all three
 * bounded attempts failed before identity detection ever ran. Deterministic,
 * not flaky.
 *
 * The real extractor already exists and is already AWS-only: `plate-face-track`
 * renders Remotion Lambda `type:"still"` against the plate video for every
 * V452 track sample. V525 reuses that renderer verbatim — no new Lambda
 * payload, no new AWS stack, no ffmpeg, no third party — and adds the two
 * things it lacked: a place to put the result, and a cache key that cannot
 * hand generation 20's frame to generation 21.
 *
 * ── ON THE CACHE PATH ──────────────────────────────────────────────────────
 *
 * The legacy probe path is keyed on `{sceneId}-p{pass}-f{frame}` and carries
 * no run, generation or source URL. Frame 30 of generation 20 and frame 30 of
 * generation 21 are the same object name and different pictures. Writing
 * plate-identity evidence into that namespace would rebuild the generation-20
 * defect one layer down: correct arithmetic on the wrong picture.
 *
 * So V525 writes to its own namespace, fenced by a fingerprint of the base
 * video URL, under which a stale hit is not merely rejected but unreachable:
 *
 *     {userId}/{projectId}/plate-frames/{sceneId}/{fingerprint}/f{frame}.jpeg
 *
 * Every primitive is INJECTED — fingerprint, cache read, still render, cache
 * write — so this module stays a leaf with no AWS, no storage and no network,
 * the same discipline V519, V523 and V524 use.
 */

export type PlateFrameExtractFailure =
  /** No usable base video URL for this run. */
  | "source_video_unavailable"
  /** Nothing cached AND no renderer available to make one. */
  | "probe_cache_miss"
  | "still_render_failed"
  | "still_render_timeout"
  | "still_upload_failed"
  /** Bytes came back, but they are not a usable still. */
  | "invalid_still_result"
  /** V528 — the plate raster itself is unusable, so nothing can be asked for. */
  | "invalid_plate_dims"
  /** V528 — the still arrived but its raster could not be read. */
  | "still_dims_unavailable"
  /** V528 — the still arrived at a raster other than the plate's. */
  | "still_dims_mismatch";

export interface PlateFrameExtractResult {
  ok: boolean;
  frameNumber: number;
  imageUrl?: string;
  sourceVideoUrl?: string;
  cacheHit?: boolean;
  source?: "probe_cache" | "remotion_still";
  bytes?: number;
  /** V528 — the raster this attempt asked the renderer for. */
  requestedRaster?: PlateRaster;
  /** V528 — the raster actually measured in the returned bytes. */
  actualRaster?: PlateRaster | null;
  reason?: PlateFrameExtractFailure;
  detail?: string;
}

export interface PlateRaster { width: number; height: number }

/**
 * V528 — THE RASTER A STILL MUST BE ASKED FOR.
 *
 * Generation 26: the plate probed at 656x1406, V525 rendered every frame
 * through `DialogStitchVideo` without target dimensions, the composition
 * fell back to its 1280x720 default, and `object-fit: cover` cropped the
 * portrait plate into a landscape frame. V524 refused all three frames with
 * `dims_incoherent` — correctly. The gate was right; it was handed the wrong
 * picture, the same referent split one layer down from V527.
 *
 * This mirrors the composition's own normalization exactly rather than
 * inventing a tolerance:
 *
 *   const even = (value, fallback) => {
 *     const n = Number(value);
 *     const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
 *     return safe % 2 === 0 ? safe : safe - 1;
 *   };
 *
 * Two consequences are load-bearing. A dimension below 64 does not clamp —
 * it silently becomes the 1280x720 default, i.e. exactly the Gen26 bug — so
 * it is rejected here BEFORE anything renders. And an odd dimension is
 * decremented by the composition, so the expected raster is the normalized
 * one, not the raw plate number. Returns null when no raster can be asked
 * for at all.
 */
export function resolvePlateRaster(
  dims: { width: number; height: number } | null | undefined,
): PlateRaster | null {
  const norm = (v: unknown): number | null => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 64) return null;
    const r = Math.round(n);
    return r % 2 === 0 ? r : r - 1;
  };
  const width = norm(dims?.width);
  const height = norm(dims?.height);
  if (width === null || height === null) return null;
  return { width, height };
}

/**
 * V528 — read the raster out of the bytes that came back.
 *
 * Requesting a size is not the same as getting one. Pure JPEG/PNG header
 * parsing so this module keeps its leaf discipline; returns null when the
 * bytes are neither, or truncated.
 */
export function probeStillDims(bytes: Uint8Array): PlateRaster | null {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24) return null;
    // PNG: IHDR width/height are big-endian u32 at fixed offsets.
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const u32 = (o: number) =>
        (bytes[o] << 24 | bytes[o + 1] << 16 | bytes[o + 2] << 8 | bytes[o + 3]) >>> 0;
      const width = u32(16), height = u32(20);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // JPEG: walk the segment chain to the first SOF marker.
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i < bytes.length - 8) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15 carry dimensions;
        // DHT (c4), JPG (c8) and DAC (cc) sit in the same range and do not.
        if (
          marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
        ) {
          const height = (bytes[i + 5] << 8) | bytes[i + 6];
          const width = (bytes[i + 7] << 8) | bytes[i + 8];
          return width > 0 && height > 0 ? { width, height } : null;
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) return null;
        i += 2 + segLen;
      }
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Minimum plausible JPEG. The same floor `plate-face-track` already applies to
 * a rendered still (`still_too_small`), reused rather than re-chosen.
 */
export const MIN_STILL_BYTES = 1024;

/**
 * V525 — the fenced cache path.
 *
 * `fingerprint` must be derived from the base-video URL, which carries the
 * generation (`.../gen-21/base.mp4`). Two different plates therefore cannot
 * produce the same object name, and a stale frame is unreachable rather than
 * merely rejected.
 */
export function plateFrameCachePath(params: {
  userId: string;
  projectId: string;
  sceneId: string;
  /** Hex digest of the base-video URL. */
  fingerprint: string;
  /**
   * V528 — the raster the object was rendered at. Without it the same URL
   * and frame name one object for every raster, so a pre-V528 1280x720 hit
   * would satisfy a 656x1406 request and the Gen26 defect would survive the
   * deploy. With it, old objects are not rejected — they are unreachable,
   * and no migration or delete is needed.
   */
  raster: { width: number; height: number };
  frameNumber: number;
}): string {
  // Dot runs are collapsed before the character filter: a storage key is
  // literal, so `..` cannot traverse — but a path segment that READS like a
  // parent reference is the kind of thing that stops being harmless the day
  // someone joins it into a real filesystem path.
  const seg = (v: unknown) =>
    String(v ?? "")
      .replace(/\.{2,}/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64) || "unknown";
  return [
    seg(params.userId),
    seg(params.projectId),
    "plate-frames",
    seg(params.sceneId),
    seg(params.fingerprint),
    seg(`${Math.round(Number(params.raster?.width) || 0)}x${Math.round(Number(params.raster?.height) || 0)}`),
    `f${Math.max(0, Math.round(Number(params.frameNumber) || 0))}.jpeg`,
  ].join("/");
}

const isTimeout = (e: unknown): boolean => {
  const name = String((e as { name?: string })?.name ?? "");
  const msg = String((e as { message?: string })?.message ?? e ?? "");
  return name === "TimeoutError" || name === "AbortError" ||
    /timed?\s*out|timeout|aborted/i.test(msg);
};

/**
 * V525 — cache first, then render, then persist.
 *
 * The order matters for cost: a retry of the same run against the same base
 * video must not pay for a second Lambda still. It matters for correctness
 * too — the cache is only consulted at a path that already proves the source.
 *
 * Every failure is classified. Collapsing them into one `frame_extract_failed`
 * is what made generation 21 take three attempts to say nothing; V524 may
 * still map the category outward, but the internal record names the cause.
 */
export async function extractPlateFrame(params: {
  userId: string;
  projectId: string;
  sceneId: string;
  /** The durable base video this frame must come from. */
  baseVideoUrl: string | null | undefined;
  /** Plate duration, passed through to the still composition unchanged. */
  totalSec: number;
  /**
   * V528 — the CURRENT plate raster, from the same MP4 probe that feeds the
   * V524 fence. Never inferred from the anchor, a UI aspect ratio, a model
   * name or a 720p label: those are all descriptions of something else.
   */
  plateDims: { width: number; height: number } | null | undefined;
  frameNumber: number;
  timeoutMs: number;
  /** Injected: hex digest of a string (the base-video URL). */
  fingerprint: (value: string) => Promise<string>;
  /** Injected: signed URL for an existing cache object, or null. */
  readCache: (path: string) => Promise<string | null>;
  /** Injected: `defaultRenderStill()` from `plate-face-track.ts`. */
  renderStill: (
    videoUrl: string,
    totalSec: number,
    frame: number,
    timeoutMs: number,
    targetDims?: { width: number; height: number } | null,
  ) => Promise<Uint8Array>;
  /** Injected: persist bytes and return a readable URL. */
  writeCache: (path: string, bytes: Uint8Array) => Promise<string | null>;
}): Promise<PlateFrameExtractResult> {
  const frameNumber = Math.max(0, Math.round(Number(params.frameNumber) || 0));
  const fail = (
    reason: PlateFrameExtractFailure,
    detail?: string,
  ): PlateFrameExtractResult => ({ ok: false, frameNumber, reason, detail });

  const videoUrl = String(params.baseVideoUrl ?? "");
  if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
    return fail("source_video_unavailable", videoUrl ? "not an http url" : "empty");
  }

  // V528 — decide the raster first. Everything downstream, cache identity
  // included, is fenced by it, so there is no window in which a still exists
  // without a raster it can be held to.
  const raster = resolvePlateRaster(params.plateDims);
  if (!raster) {
    return fail(
      "invalid_plate_dims",
      `plate=${params.plateDims?.width ?? "?"}x${params.plateDims?.height ?? "?"} min=64`,
    );
  }

  let path: string;
  try {
    path = plateFrameCachePath({
      userId: params.userId,
      projectId: params.projectId,
      sceneId: params.sceneId,
      fingerprint: await params.fingerprint(videoUrl),
      raster,
      frameNumber,
    });
  } catch (e) {
    return fail("still_render_failed", `fingerprint: ${(e as Error)?.message ?? e}`);
  }

  // ── 1. cache ────────────────────────────────────────────────────────
  try {
    const cached = await params.readCache(path);
    if (cached) {
      return {
        ok: true,
        frameNumber,
        imageUrl: cached,
        sourceVideoUrl: videoUrl,
        cacheHit: true,
        source: "probe_cache",
        // V528 — the path itself is the provenance: video fingerprint,
        // raster and frame. An object can only sit here if a V528 render
        // produced it AND passed the post-render raster check below, so a
        // hit cannot be a different raster. Pre-V528 objects live one
        // segment shorter and are not addressable from here at all.
        requestedRaster: raster,
        actualRaster: raster,
      };
    }
  } catch {
    // A cache read failure is not an extraction failure — fall through and
    // render. Silently, because the render answers the same question.
  }

  // ── 2. render ───────────────────────────────────────────────────────
  let bytes: Uint8Array;
  try {
    bytes = await params.renderStill(
      videoUrl,
      Number(params.totalSec) || 0,
      frameNumber,
      params.timeoutMs,
      raster,
    );
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return isTimeout(e)
      ? fail("still_render_timeout", msg)
      : fail("still_render_failed", msg);
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < MIN_STILL_BYTES) {
    return fail(
      "invalid_still_result",
      `bytes=${bytes instanceof Uint8Array ? bytes.byteLength : "none"} min=${MIN_STILL_BYTES}`,
    );
  }

  // ── 2b. V528 — measure what actually came back ──────────────────────
  //
  // Asking is not obeying. Gen26 asked for nothing and got 1280x720; a run
  // that asks for 656x1406 and still gets 1280x720 must fail here rather
  // than hand V524 an incoherent raster and let the dims gate absorb it.
  const actual = probeStillDims(bytes);
  if (!actual) {
    return {
      ...fail("still_dims_unavailable", `bytes=${bytes.byteLength}`),
      requestedRaster: raster,
      actualRaster: null,
    };
  }
  if (actual.width !== raster.width || actual.height !== raster.height) {
    return {
      ...fail(
        "still_dims_mismatch",
        `expected=${raster.width}x${raster.height} actual=${actual.width}x${actual.height}`,
      ),
      requestedRaster: raster,
      actualRaster: actual,
    };
  }

  // ── 3. persist ──────────────────────────────────────────────────────
  let url: string | null;
  try {
    url = await params.writeCache(path, bytes);
  } catch (e) {
    return fail("still_upload_failed", String((e as Error)?.message ?? e));
  }
  if (!url) return fail("still_upload_failed", "no url returned");

  return {
    ok: true,
    frameNumber,
    imageUrl: url,
    sourceVideoUrl: videoUrl,
    cacheHit: false,
    source: "remotion_still",
    bytes: bytes.byteLength,
    requestedRaster: raster,
    actualRaster: actual,
  };
}
