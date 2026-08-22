/**
 * pass-face-preclip.ts — Per-Pass Single-Face Preclip for v5 fan-out
 *
 * v68 (June 2026):
 * For 3+ speaker dialog scenes the v5 fan-out pipeline used to send the full
 * Multi-Face scene plate to Sync.so with `active_speaker_detection.coordinates`
 * (or `bounding_boxes`) pointing at one of N faces. Sync.so (both lipsync-2-pro
 * AND sync-3) silently returned `An unknown error occurred.` on 4-speaker
 * plates regardless of which retry variant we used.
 *
 * The v21 legacy per-turn pipeline already had a working pattern: render a
 * tight single-face SQUARE CROP via Remotion Lambda, send THAT to Sync.so
 * with `auto_detect:true` (no ambiguity — the crop contains exactly one
 * face), and overlay the result back onto the master plate at the original
 * (cropX, cropY, cropSize) region with a soft circular mask via
 * `DialogStitchVideo.shots[].crop`.
 *
 * This helper wires that legacy infrastructure into the v5 fan-out pass loop.
 * It is synchronous from the caller's perspective: dispatches the Lambda
 * render, polls `video_renders.video_url` every 2s up to 90s, returns the
 * preclip URL + crop region. Idempotent: if the pass already has a preclip
 * URL stored, reuses it without re-rendering.
 *
 * Notes:
 *  - We DO NOT use render-dialog-turn directly because that function writes
 *    into `dialog_shots.shots[]` (v4 schema). Our v5 fan-out uses
 *    `dialog_shots.passes[]`, so we drive the Lambda render directly via
 *    invoke-remotion-render and read video_renders.video_url.
 *  - `audio_tight.windows_secs` is the source of the preclip's render
 *    window. The preclip duration matches the voiced turn duration; the
 *    surrounding silence in the original plate is filled back in by the
 *    audio-mux Lambda overlay step.
 */

import { computeFaceCrop, FaceCropRegion } from "./face-crop.ts";
import { appendWebhookToken } from "./webhook-auth.ts";
import { DEFAULT_BUCKET_NAME } from "./aws-lambda.ts";
import { computeMouthCenteredCrop } from "./compute-mouth-centered-crop.ts";
// v400 Freeze: alle Tuning-Werte kommen aus dem eingefrorenen Vertrag.
import { PRECLIP } from "./lipsync-frozen-contract.ts";
// FA-4/P0 — exactly-once dispatch resume decisions (pure, unit-tested).
import {
  classifyDispatchOutcome,
  type DispatchOutcome,
  hasDispatchClaim,
  terminalClassOnNoProgress,
} from "./preclip-dispatch-resume.ts";

export interface PassPreclipInput {
  sceneId: string;
  projectId: string;
  userId: string;
  passIdx: number;
  /** Master plate URL (full scene). */
  masterVideoUrl: string;
  /** Source-master pixel dims. */
  srcWidth: number;
  srcHeight: number;
  /** Speaker face coords in source-master pixel space. */
  coords: [number, number];
  /** Optional face bbox in source-master pixel space [x1,y1,x2,y2]. */
  bbox?: [number, number, number, number] | null;
  /** v76 — Face centers of the OTHER speakers on the same plate. Used to
   *  cap the crop edge so it never includes a neighbor's face. */
  siblingCoords?: Array<[number, number]> | null;
  /** Render window for this speaker's turn(s) in scene seconds. */
  startSec: number;
  endSec: number;
  /**
   * v116 (Fix B — Face-Gate Self-Repair). Multiplier applied to the
   * computed crop `size` AFTER computeFaceCrop. Used by the dispatcher
   * to re-render a wider crop (more headroom/chinroom) when the prior
   * preclip's face-gate returned `faces=0` (face was just outside the
   * crop). 1.0 = no change (default). 1.4 / 1.8 are the dispatcher's
   * standard repair steps. Crop is re-centered on `coords` and clamped
   * to source bounds; never includes a neighbor's coordinate.
   */
  cropExpansionFactor?: number;
  /** v247 — precise mouth-center landmark [x, y] in source-master pixel
   *  space (AWS Rekognition mouthLeft/Right midpoint). When present we
   *  center the crop on the mouth instead of the face-bbox center and
   *  enforce faceShareInCrop ≥ ~42%. Falls back to the legacy
   *  computeFaceCrop path when unset. */
  mouth?: [number, number] | null;
  /**
   * V445 — stable, sanitized label of the measurement the `bbox`/`mouth`
   * geometry came from (plate URL without signature + hydration source).
   * Echoed back so the caller can persist `crop_measure_src` /
   * `bbox_measure_src` and prove both share one measurement.
   */
  bboxMeasureSrc?: string | null;
  /**
   * V447 — Run-Identität des laufenden Durchgangs. Ohne beide Felder wird
   * KEIN fertiger Preclip wiederverwendet (fail-closed): ein Artefakt aus
   * einem früheren Lauf darf einen neuen Lauf nie betreten.
   */
  runId?: string | null;
  plateGeneration?: number | null;
}



export interface PassPreclipResult {
  ok: boolean;
  preclipUrl?: string;
  preclipRenderId?: string;
  crop?: FaceCropRegion;
  /** Window passed to Lambda (preclip plays t=0 → endSec-startSec). */
  durationSec?: number;
  fps?: number;
  frameCount?: number;
  /** v247 — anchor used ("mouth" | "face_center"). */
  anchor?: "mouth" | "face_center";
  /** v247 — face bbox area / crop area after clamping (0..1). */
  faceShareInCrop?: number;
  /** v247 — distance (px) between mouth and crop center. */
  mouthOffsetPx?: number;
  /** V445 — true when clamping forced the crop off the ideal anchor. */
  clamped?: boolean;
  /** V445 — measurement source the crop geometry was computed from. */
  cropMeasureSrc?: string | null;
  /** V445 — measurement source of the face bbox handed in by the caller. */
  bboxMeasureSrc?: string | null;
  /** V445 — the exact face bbox the crop was computed from. */
  cropFromBbox?: [number, number, number, number] | null;

  error?: string;
  /**
   * `dispatch_uncertain` (FA-4/P0): 5xx / network failure where it is unknown
   * whether the render service received the request. Must be kept as its own
   * class all the way to compose-dialog-segments — never collapsed into
   * `dispatch_failed` or `poll_timeout`.
   */
  errorClass?:
    | "dispatch_failed"
    | "dispatch_uncertain"
    | "lambda_failed"
    | "poll_timeout"
    | "invalid_input";
}


const FPS = 30;
// v188 (Phase 1.3) — halved from 2000ms to shave ~1s detection latency on
// short renders. No cost impact; DB read only.
const POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 90_000;

function evenDimension(value: number, fallback: number): number {
  const n = Number(value);
  const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
  return safe % 2 === 0 ? safe : safe - 1;
}

/**
 * V447 — vollständige Artefakt-Signatur eines Preclips. `null` bedeutet:
 * keine Run-Identität vorhanden ⇒ kein Reuse, kein Signatur-Stempel.
 */
export function buildPreclipSignature(args: {
  runId: string | null;
  generation: number | null;
  plateKey: string;
  crop: { x: number; y: number; size: number; outputSize: number };
  bbox: [number, number, number, number] | null;
  startSec: number;
  endSec: number;
}): string | null {
  if (!args.runId || args.generation === null || !Number.isFinite(args.generation)) return null;
  if (!args.plateKey) return null;
  const bboxSig = args.bbox ? args.bbox.map((n) => Math.round(n)).join(",") : "nobbox";
  return [
    `r=${args.runId}`,
    `g=${args.generation}`,
    `p=${args.plateKey}`,
    `c=${args.crop.x},${args.crop.y},${args.crop.size},${args.crop.outputSize}`,
    `b=${bboxSig}`,
    `w=${Number(args.startSec).toFixed(3)}-${Number(args.endSec).toFixed(3)}`,
  ].join("|");
}


/**
 * Render a single-face preclip via Remotion Lambda and wait for it to finish.
 * Caller should already have stored `preclip_url` + `preclip_crop` on the
 * pass if a prior call succeeded (idempotency lives at the call site so we
 * don't have to re-read composer_scenes here).
 */
export async function renderPassFacePreclip(
  supabase: any,
  serviceKey: string,
  supabaseUrl: string,
  input: PassPreclipInput,
  pollTimeoutMs: number = DEFAULT_POLL_TIMEOUT_MS,
): Promise<PassPreclipResult> {
  const {
    sceneId,
    projectId,
    userId,
    passIdx,
    masterVideoUrl,
    srcWidth,
    srcHeight,
    coords,
    bbox,
    siblingCoords,
    startSec,
    endSec,
    cropExpansionFactor,
    mouth,
    bboxMeasureSrc,
  } = input;

  // V445 — crop and dispatch bbox must share one measurement. We echo the
  // caller's sanitized source label back as BOTH tags; the crop is computed
  // from exactly the `bbox` handed in here, never from cached geometry.
  const measureSrc: string | null = typeof bboxMeasureSrc === "string" && bboxMeasureSrc.length > 0
    ? bboxMeasureSrc
    : null;
  const cropFromBbox: [number, number, number, number] | null =
    Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(Number(n)))
      ? [
        Math.round(Number(bbox[0])),
        Math.round(Number(bbox[1])),
        Math.round(Number(bbox[2])),
        Math.round(Number(bbox[3])),
      ]
      : null;


  if (!masterVideoUrl || !Number.isFinite(srcWidth) || !Number.isFinite(srcHeight)) {
    return { ok: false, error: "invalid_master_dims", errorClass: "invalid_input" };
  }
  if (!Array.isArray(coords) || coords.length !== 2) {
    return { ok: false, error: "missing_coords", errorClass: "invalid_input" };
  }
  const dur = Math.max(0.2, endSec - startSec);
  if (!Number.isFinite(dur)) {
    return { ok: false, error: "invalid_window", errorClass: "invalid_input" };
  }

  const sW = evenDimension(srcWidth, 1280);
  const sH = evenDimension(srcHeight, 720);

  // v247 — mouth-anchor crop when we have both a mouth landmark and a
  // face bbox. Guarantees faceShareInCrop ≥ ~42% so Sync.so cannot no-op
  // on tiny/far faces. Falls back to legacy face-center crop otherwise.
  const useMouthAnchor =
    Array.isArray(mouth) &&
    mouth.length === 2 &&
    Number.isFinite(Number(mouth[0])) &&
    Number.isFinite(Number(mouth[1])) &&
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => Number.isFinite(Number(n)));

  let crop0Size: number;
  let crop0X: number;
  let crop0Y: number;
  let anchor: "mouth" | "face_center" = "face_center";
  let faceShareInCrop = 0;
  let mouthOffsetPx = 0;
  let clampedAnchor = false;

  if (useMouthAnchor) {
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [
          Math.round(Number((bbox as number[])[0])),
          Math.round(Number((bbox as number[])[1])),
          Math.round(Number((bbox as number[])[2])),
          Math.round(Number((bbox as number[])[3])),
        ],
        center: [Math.round(Number(coords[0])), Math.round(Number(coords[1]))],
        mouth: [Math.round(Number((mouth as number[])[0])), Math.round(Number((mouth as number[])[1]))],
      },
      plateWidth: sW,
      plateHeight: sH,
      targetFaceShare: PRECLIP.targetFaceShare,
      minSize: PRECLIP.minCropSizePx,
      outputSize: PRECLIP.outputSizePx,
    });
    crop0X = r.crop.x;
    crop0Y = r.crop.y;
    crop0Size = r.crop.size;
    anchor = r.anchor;
    faceShareInCrop = r.faceShareInCrop;
    mouthOffsetPx = r.mouthOffsetPx;
    clampedAnchor = r.clamped;
    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v247_mouth_anchor_preclip anchor=${anchor} face_share=${faceShareInCrop.toFixed(3)} mouth_offset_px=${mouthOffsetPx} clamped=${clampedAnchor} crop=${crop0X},${crop0Y},${crop0Size}`,
    );
  } else {
    const cf = computeFaceCrop(coords, bbox ?? null, sW, sH, PRECLIP.legacyFallbackOutputPx, siblingCoords ?? null);
    crop0X = cf.x;
    crop0Y = cf.y;
    crop0Size = cf.size;
  }
  const crop0 = { x: crop0X, y: crop0Y, size: crop0Size };

  // v116 (Fix B) — expand the crop on repair retries. We multiply `size`
  // around the same center coords and re-clamp to source bounds. This is
  // the cheapest way to give Sync.so + Gemini face-detect more margin
  // when the original crop missed the face. We deliberately ignore the
  // neighbor cap on expansion: when faces=0 in the first crop, including
  // a sibling face is preferable to producing a useless empty crop —
  // the downstream face-gate will still validate count===1.
  const expandFactor = Number.isFinite(cropExpansionFactor) && (cropExpansionFactor as number) > 1
    ? Math.min(2.5, Number(cropExpansionFactor))
    : 1;
  let expandedSize = crop0.size;
  let expandedX = crop0.x;
  let expandedY = crop0.y;
  if (expandFactor > 1) {
    const centerX = crop0.x + crop0.size / 2;
    const centerY = crop0.y + crop0.size / 2;
    const target = Math.min(Math.min(sW, sH), Math.round(crop0.size * expandFactor));
    expandedSize = target % 2 === 0 ? target : target - 1;
    expandedX = Math.max(0, Math.min(sW - expandedSize, Math.round(centerX - expandedSize / 2)));
    expandedY = Math.max(0, Math.min(sH - expandedSize, Math.round(centerY - expandedSize / 2)));
    expandedX = expandedX % 2 === 0 ? expandedX : Math.max(0, expandedX - 1);
    expandedY = expandedY % 2 === 0 ? expandedY : Math.max(0, expandedY - 1);
  }

  // v112 — Sync.so docs explicitly require ≥480p for reliable face detection
  // (sync.so/docs/compatibility-and-tips/improving-lip-sync-quality:
  // "Use at least 480p resolution for reliable face detection. […]
  //  We recommend 1080p as the best balance"). The v109 native-resolution
  // policy (max(256, crop.size)) frequently produced 220–360px preclips,
  // well under the 480p floor → sync-3 completed COMPLETED but emitted the
  // preclip unchanged ("mouths don't move"). v112 targets a 720p floor
  // (safety margin above 480p) and caps at 1280p so cost/latency stay
  // bounded. Lanczos upscale lives in the Remotion DialogTurnFaceCropVideo
  // composition via width/height inputProps below.
  const nativeOut = Math.min(PRECLIP.nativeOutputMaxPx, Math.max(PRECLIP.nativeOutputMinPx, expandedSize));
  const evenNative = nativeOut % 2 === 0 ? nativeOut : nativeOut - 1;
  const crop = { x: expandedX, y: expandedY, size: expandedSize, outputSize: evenNative };
  const outW = crop.outputSize;
  const outH = crop.outputSize;
  const durationInFrames = Math.max(6, Math.ceil(dur * FPS));

  // ── V447 — Reuse-Signatur (Run-Identität) ────────────────────────────
  // Ein fertiger Preclip darf nur wiederverwendet werden, wenn er
  // NACHWEISLICH zum selben Lauf, derselben Plate-Generation, derselben
  // Plate-URL, derselben vollständigen Crop-Geometrie (x/y/size/outputSize),
  // derselben BBox-Messung und demselben Renderfenster gehört. Fehlt die
  // Run-Identität, wird gar nicht wiederverwendet (fail-closed).
  const v447RunId = typeof input.runId === "string" && input.runId.length > 0 ? input.runId : null;
  const v447Generation = Number.isFinite(Number(input.plateGeneration))
    ? Number(input.plateGeneration)
    : null;
  const v447PlateKey = String(masterVideoUrl).split("?")[0];
  const v447Signature = buildPreclipSignature({
    runId: v447RunId,
    generation: v447Generation,
    plateKey: v447PlateKey,
    crop,
    bbox: cropFromBbox,
    startSec,
    endSec,
  });

  const t0 = Date.now();

  // v188 (Phase 1.2) — Reuse-Guard, seit V447 an die Run-Identität gebunden.
  // Reuse trifft nur noch bei exakt identischer `v447_signature`; Zeilen ohne
  // Signatur (alle Alt-Renders) sind grundsätzlich nicht wiederverwendbar.
  try {
    if (!v447Signature) {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v447_reuse_disabled reason=no_run_identity run=${v447RunId ?? "null"} gen=${v447Generation ?? "null"}`,
      );
      throw new Error("v447_no_run_identity");
    }
    const cutoffIso = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: prior } = await supabase
      .from("video_renders")
      .select("render_id, video_url, content_config, started_at")
      .eq("source", "dialog-pass-preclip")
      .eq("status", "completed")
      .contains("content_config", {
        composer_scene_id: sceneId,
        pass_idx: passIdx,
        v447_signature: v447Signature,
      })
      .gte("started_at", cutoffIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prior?.video_url) {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_reuse_hit render=${prior.render_id} url=…${String(prior.video_url).slice(-60)} dispatch_ms=0 poll_wait_ms=0 total_ms=${Date.now() - t0}`,
      );
      return {
        ok: true,
        preclipUrl: prior.video_url,
        preclipRenderId: prior.render_id,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
        anchor,
        faceShareInCrop,
        mouthOffsetPx,
        clamped: clampedAnchor,
        cropMeasureSrc: measureSrc,
        bboxMeasureSrc: measureSrc,
        cropFromBbox,
      };
    }
  } catch (reuseErr) {
    // Non-fatal — cache miss falls through to normal dispatch.
    console.warn(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_reuse_lookup_failed: ${(reuseErr as Error)?.message ?? String(reuseErr)}`,
    );
  }

  const renderId = crypto.randomUUID();
  const outName = `dialog-pass-preclip-${sceneId}-p${passIdx}-${Date.now()}.mp4`;

  const inputProps = {
    masterVideoUrl,
    startSec,
    endSec,
    outputSize: crop.outputSize,
    srcWidth: sW,
    srcHeight: sH,
    cropX: crop.x,
    cropY: crop.y,
    cropSize: crop.size,
  };

  const { error: insertErr } = await supabase
    .from("video_renders")
    .insert({
      render_id: renderId,
      project_id: projectId,
      user_id: userId,
      bucket_name: DEFAULT_BUCKET_NAME,
      source: "dialog-pass-preclip",
      status: "pending",
      started_at: new Date().toISOString(),
      format_config: { format: "mp4", aspect_ratio: "1:1", width: outW, height: outH, fps: FPS },
      content_config: {
        out_name: outName,
        durationInFrames,
        fps: FPS,
        width: outW,
        height: outH,
        composer_scene_id: sceneId,
        pass_idx: passIdx,
        face_crop: { x: crop.x, y: crop.y, size: crop.size, outputSize: crop.outputSize },
        // V447 — Run-Identität des Artefakts. Nur Zeilen mit identischer
        // Signatur dürfen später wiederverwendet werden.
        ...(v447Signature
          ? {
            v447_signature: v447Signature,
            run_id: v447RunId,
            plate_generation: v447Generation,
            plate_key: v447PlateKey,
          }
          : {}),

      },
      subtitle_config: {},
    });
  if (insertErr) {
    return { ok: false, error: `insert_render:${insertErr.message}`, errorClass: "dispatch_failed" };
  }

  const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/remotion-webhook`);
  const lambdaPayload: Record<string, unknown> = {
    type: "start",
    serveUrl: Deno.env.get("REMOTION_SERVE_URL") || "",
    composition: "DialogTurnFaceCropVideo",
    inputProps: { type: "payload", payload: JSON.stringify(inputProps) },
    codec: "h264",
    imageFormat: "jpeg",
    // v129.23.3 — force TV-range yuv420p instead of jpeg-range yuvj420p.
    // Sync.so's decoder/face-tracker silently fails with
    // generation_unknown_error on yuvj420p, even though ffmpeg/Chrome
    // accept it. Without these two fields the Lambda h264 encoder
    // inherits PC-range from the JPEG frame source.
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    maxRetries: 1,
    privacy: "public",
    logLevel: "warn",
    outName,
    bucketName: DEFAULT_BUCKET_NAME,
    width: outW,
    height: outH,
    fps: FPS,
    durationInFrames,
    frameRange: [0, durationInFrames - 1],
    muted: true,
    audioCodec: "aac",
    scale: 1,
    envVariables: {},
    chromiumOptions: {},
    timeoutInMilliseconds: 180_000,
    concurrencyPerLambda: 1,
    // v188 (Phase 2.1) — split frames across parallel Lambdas. 60 frames per
    // worker gives up to 3 parallel workers on a 6s @30fps preclip (180
    // frames), matching the project's Lambda concurrency policy (max 3
    // parallel per render). Shorter preclips naturally fall back to 1 worker.
    framesPerLambda: 60,
    downloadBehavior: { type: "play-in-browser" },

    webhook: {
      url: webhookUrl,
      secret: null,
      customData: {
        pending_render_id: renderId,
        out_name: outName,
        user_id: userId,
        // Use a distinct source so remotion-webhook does NOT try to patch
        // v4 dialog_shots.shots[] (which doesn't exist for this scene).
        // The webhook will still mark video_renders.completed; we poll for it.
        source: "dialog-pass-preclip",
        composer_scene_id: sceneId,
        composer_project_id: projectId,
        pass_idx: passIdx,
      },
    },
  };

  const dispatchStart = Date.now();

  // ── FA-4/P0 — dispatch resilience (exactly-once) ─────────────────────
  // A 5xx / network failure is `dispatch_uncertain`: the request may have
  // reached the render service even though we never saw a response. We
  // therefore NEVER destroy the render row and NEVER create a second one.
  // The single re-invoke reuses the SAME pendingRenderId; whether AWS is
  // actually started is decided solely by the atomic dispatch claim inside
  // invoke-remotion-render.
  type InvokeOutcome = DispatchOutcome;
  const doInvoke = async (): Promise<InvokeOutcome> => {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
      });
      const body = resp.ok ? "" : await resp.text().catch(() => "");
      return { ok: resp.ok, status: resp.status, body, networkError: null };
    } catch (e) {
      return { ok: false, status: 0, body: "", networkError: (e as Error)?.message ?? String(e) };
    }
  };

  /** Provably rejected before anything could be sent to AWS → no retry. */
  const isDefinitiveRejection = (o: InvokeOutcome): boolean =>
    classifyDispatchOutcome(o) === "definitive_rejection";

  const readClaimState = async (): Promise<{ claimed: boolean; completed: boolean; url: string }> => {
    const { data: row } = await supabase
      .from("video_renders")
      .select("status, video_url, content_config")
      .eq("render_id", renderId)
      .maybeSingle();
    const cfg = ((row as any)?.content_config ?? {}) as Record<string, unknown>;
    const status = String((row as any)?.status ?? "");
    return {
      claimed: hasDispatchClaim({
        lambdaInvokedAt: (cfg.lambda_invoked_at as string | undefined) ?? null,
        realRemotionRenderId: (cfg.real_remotion_render_id as string | undefined) ?? null,
        status,
      }),
      completed: status === "completed",
      url: String((row as any)?.video_url ?? ""),
    };

  };

  let invoke = await doInvoke();
  let dispatchUncertain = false;

  if (!invoke.ok) {
    if (isDefinitiveRejection(invoke)) {
      await supabase
        .from("video_renders")
        .update({
          status: "failed",
          error_message: `invoke ${invoke.status}: ${invoke.body}`.slice(0, 400),
          completed_at: new Date().toISOString(),
        })
        .eq("render_id", renderId);
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_timing invoke_rejected status=${invoke.status} dispatch_ms=${Date.now() - dispatchStart} total_ms=${Date.now() - t0}`,
      );
      return {
        ok: false,
        error: `invoke_${invoke.status}:${invoke.body.slice(0, 200)}`,
        errorClass: "dispatch_failed",
        preclipRenderId: renderId,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
      };
    }

    dispatchUncertain = true;
    console.warn(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} fa4p0_dispatch_uncertain status=${invoke.status} net=${invoke.networkError ?? "-"} — recheck, no row destruction`,
    );

    await new Promise((r) => setTimeout(r, 3_000));
    const state = await readClaimState();
    if (state.claimed) {
      // Claim exists (or render already progressed) → poll only, never re-dispatch.
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} fa4p0_claim_present — poll only, no second AWS start`,
      );
    } else {
      // Provably no claim → exactly one re-invoke with the SAME pendingRenderId.
      invoke = await doInvoke();
      if (invoke.ok) {
        dispatchUncertain = false;
        console.log(
          `[pass-face-preclip] scene=${sceneId} pass=${passIdx} fa4p0_reinvoke_ok same_render_id=${renderId}`,
        );
      } else if (isDefinitiveRejection(invoke)) {
        await supabase
          .from("video_renders")
          .update({
            status: "failed",
            error_message: `invoke ${invoke.status}: ${invoke.body}`.slice(0, 400),
            completed_at: new Date().toISOString(),
          })
          .eq("render_id", renderId);
        return {
          ok: false,
          error: `invoke_${invoke.status}:${invoke.body.slice(0, 200)}`,
          errorClass: "dispatch_failed",
          preclipRenderId: renderId,
          crop,
          durationSec: dur,
          fps: FPS,
          frameCount: durationInFrames,
        };
      } else {
        console.warn(
          `[pass-face-preclip] scene=${sceneId} pass=${passIdx} fa4p0_reinvoke_uncertain status=${invoke.status} net=${invoke.networkError ?? "-"}`,
        );
      }
    }
  }

  const dispatchMs = Date.now() - dispatchStart;


  // ── Poll for completion ──────────────────────────────────────────────
  const pollStart = Date.now();
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { data: row } = await supabase
      .from("video_renders")
      .select("status, video_url, error_message")
      .eq("render_id", renderId)
      .maybeSingle();
    const status = String((row as any)?.status ?? "");
    const url = String((row as any)?.video_url ?? "");
    if (status === "completed" && url) {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_timing completed dispatch_ms=${dispatchMs} poll_wait_ms=${Date.now() - pollStart} total_ms=${Date.now() - t0} frames=${durationInFrames} out=${outW}x${outH}`,
      );
      return {
        ok: true,
        preclipUrl: url,
        preclipRenderId: renderId,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
        anchor,
        faceShareInCrop,
        mouthOffsetPx,
        clamped: clampedAnchor,
        cropMeasureSrc: measureSrc,
        bboxMeasureSrc: measureSrc,
        cropFromBbox,
      };
    }
    if (status === "failed") {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_timing lambda_failed dispatch_ms=${dispatchMs} poll_wait_ms=${Date.now() - pollStart} total_ms=${Date.now() - t0}`,
      );
      return {
        ok: false,
        error: `lambda:${(row as any)?.error_message ?? "unknown"}`.slice(0, 300),
        errorClass: "lambda_failed",
        preclipRenderId: renderId,
        crop,
        durationSec: dur,
        fps: FPS,
        frameCount: durationInFrames,
      };
    }
  }

  // FA-4/P0 — no progress within the budget. If the dispatch was uncertain we
  // must NOT restart Lambda; the run stays fail-closed under v187 with its own
  // diagnosis class so support can tell infrastructure from a real timeout.
  if (dispatchUncertain) {
    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} fa4p0_dispatch_uncertain_no_progress dispatch_ms=${dispatchMs} poll_wait_ms=${Date.now() - pollStart} total_ms=${Date.now() - t0} budget_ms=${pollTimeoutMs}`,
    );
    return {
      ok: false,
      error: `dispatch_uncertain_${Math.round(pollTimeoutMs / 1000)}s`,
      errorClass: terminalClassOnNoProgress(true),
      preclipRenderId: renderId,
      crop,
      durationSec: dur,
      fps: FPS,
      frameCount: durationInFrames,
    };
  }

  console.log(
    `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_timing poll_timeout dispatch_ms=${dispatchMs} poll_wait_ms=${Date.now() - pollStart} total_ms=${Date.now() - t0} budget_ms=${pollTimeoutMs}`,
  );
  return {
    ok: false,
    error: `poll_timeout_${Math.round(pollTimeoutMs / 1000)}s`,
    errorClass: "poll_timeout",
    preclipRenderId: renderId,
    crop,
    durationSec: dur,
    fps: FPS,
    frameCount: durationInFrames,
  };
}
