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
  | "invalid_still_result";

export interface PlateFrameExtractResult {
  ok: boolean;
  frameNumber: number;
  imageUrl?: string;
  sourceVideoUrl?: string;
  cacheHit?: boolean;
  source?: "probe_cache" | "remotion_still";
  bytes?: number;
  reason?: PlateFrameExtractFailure;
  detail?: string;
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

  let path: string;
  try {
    path = plateFrameCachePath({
      userId: params.userId,
      projectId: params.projectId,
      sceneId: params.sceneId,
      fingerprint: await params.fingerprint(videoUrl),
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
      };
    }
  } catch {
    // A cache read failure is not an extraction failure — fall through and
    // render. Silently, because the render answers the same question.
  }

  // ── 2. render ───────────────────────────────────────────────────────
  let bytes: Uint8Array;
  try {
    bytes = await params.renderStill(videoUrl, Number(params.totalSec) || 0, frameNumber, params.timeoutMs);
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
  };
}
