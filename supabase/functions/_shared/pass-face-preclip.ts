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
import { probeMp4Dims } from "./twoshot-face-map.ts";
// v359 — temporaler Crop: der Preclip-Ausschnitt folgt dem Gesicht.
import { planCameraPath, buildSpeechWeights } from "./camera-path.ts";
import { buildDenseTrack } from "./face-track.ts";

// v356 — the closeup contract no longer blocks here; geometry is telemetry.

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
   * v359 — per-frame face track for this speaker across the turn, in
   * source-master pixel space (from `_shared/face-track.ts`). When present
   * the preclip is cut with a MOVING window planned by
   * `_shared/camera-path.ts` instead of one fixed rectangle.
   *
   * This is the fix for the proven Kailee failure: a fixed window shows the
   * place the face used to be, so a moving speaker walks out of frame,
   * Sync.so finds no mouth and returns the input unchanged.
   *
   * Absent → unchanged pre-v359 static-crop behaviour.
   */
  track?: Array<{ t: number; box: [number, number, number, number] }> | null;
  /** v359 — voiced sub-windows in clip-relative seconds. Frames inside these
   *  windows are weighted higher when planning zoom and framing: it matters
   *  far more that the mouth is visible while speaking than during handles. */
  voicedWindows?: Array<[number, number]> | null;
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
  actualDims?: { width: number; height: number };
  /** v247/v342 — anchor used ("mouth" | "mouth_from_bbox" | "face_center"). */
  anchor?: "mouth" | "face_center" | "mouth_from_bbox";

  /** v247 — face bbox area / crop area after clamping (0..1). Telemetry. */
  faceShareInCrop?: number;
  /** v344.1 — LINEAR share: longest face side / crop side. Gate metric. */
  faceSideShare?: number;
  /** v344.1 — longest face side in plate pixels. */
  faceSidePx?: number;
  /** v344.1 — true when minSize (not the target share) sized the crop. */
  minSizeWidened?: boolean;
  /** v247 — distance (px) between mouth and crop center. */
  mouthOffsetPx?: number;
  /** v247 — true when clamping forced the crop off the ideal anchor. */
  clamped?: boolean;
  /** v359 — the moving window actually rendered, one entry per frame in
   *  source-master pixel space. Must be persisted on the pass so the mux
   *  pastes the lipsynced crop back along the identical path. */
  cropPath?: Array<{ x: number; y: number; size: number }>;
  /** v359 — how the window was planned. Telemetry for the benchmark. */
  cropMode?: "static" | "camera_path";
  /** v359 — total camera travel in plate pixels across the turn. */
  cameraTravelPx?: number;
  /** v359 — share of frames whose tracked face lies inside the window. */
  trackContainment?: number;
  error?: string;
  errorClass?: "dispatch_failed" | "lambda_failed" | "poll_timeout" | "invalid_input";
}



const FPS = 30;
// v188 (Phase 1.3) — halved from 2000ms to shave ~1s detection latency on
// short renders. No cost impact; DB read only.
const POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 90_000;
const PRECLIP_PIPELINE_VERSION = "v359-camera-path";

function evenDimension(value: number, fallback: number): number {
  const n = Number(value);
  const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
  return safe % 2 === 0 ? safe : safe - 1;
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
  } = input;

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

  // v247 — mouth-anchor crop when we have a face bbox. Guarantees
  // faceShareInCrop ≥ ~42% so Sync.so cannot no-op on tiny/far faces.
  //
  // v342 — the detector frequently returns a face bbox WITHOUT mouth
  // landmarks (AWS Rekognition on Hailuo plates). Previously that dropped
  // us into the legacy face-center crop, which produced a fixed ~394px box
  // around a 60–100px face → face share ~3% → Sync.so animated nothing.
  // We now derive the mouth anchor from the lower third of the bbox
  // (same formula as v280_bbox_derived_mouth_anchor) so the tight crop
  // applies whenever a bbox exists.
  const bboxValid =
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => Number.isFinite(Number(n))) &&
    Number(bbox[2]) > Number(bbox[0]) &&
    Number(bbox[3]) > Number(bbox[1]);
  const mouthValid =
    Array.isArray(mouth) &&
    mouth.length === 2 &&
    Number.isFinite(Number(mouth[0])) &&
    Number.isFinite(Number(mouth[1]));
  const useMouthAnchor = bboxValid;

  let crop0Size: number;
  let crop0X: number;
  let crop0Y: number;
  let anchor: "mouth" | "face_center" | "mouth_from_bbox" = "face_center";
  let faceShareInCrop = 0;
  let faceSideShare = 0;
  let faceSidePx = 0;
  let minSizeWidened = false;
  let mouthOffsetPx = 0;
  let clampedAnchor = false;

  if (useMouthAnchor) {
    const bx1 = Math.round(Number((bbox as number[])[0]));
    const by1 = Math.round(Number((bbox as number[])[1]));
    const bx2 = Math.round(Number((bbox as number[])[2]));
    const by2 = Math.round(Number((bbox as number[])[3]));
    // Lower-third anchor: horizontal center, ~72% down the face box.
    const derivedMouth: [number, number] = [
      Math.round((bx1 + bx2) / 2),
      Math.round(by1 + (by2 - by1) * 0.72),
    ];
    const mouthPoint: [number, number] = mouthValid
      ? [Math.round(Number((mouth as number[])[0])), Math.round(Number((mouth as number[])[1]))]
      : derivedMouth;
    const r = computeMouthCenteredCrop({
      face: {
        bbox: [bx1, by1, bx2, by2],
        center: [Math.round(Number(coords[0])), Math.round(Number(coords[1]))],
        mouth: mouthPoint,
      },
      plateWidth: sW,
      plateHeight: sH,
      targetFaceShare: 0.42,
      // v356 — back to the 2026-07-27 baseline value. The v344.1 change to
      // 96 was made to satisfy the area-share floor that v356 removes; the
      // DB-verified working runs all used 128.
      minSize: 128,
      outputSize: 720,

    });
    crop0X = r.crop.x;
    crop0Y = r.crop.y;
    crop0Size = r.crop.size;
    anchor = mouthValid ? r.anchor : "mouth_from_bbox";
    faceShareInCrop = r.faceShareInCrop;
    faceSideShare = r.faceSideShare;
    faceSidePx = r.faceSidePx;
    minSizeWidened = r.minSizeWidened;
    mouthOffsetPx = r.mouthOffsetPx;
    clampedAnchor = r.clamped;
    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v344_mouth_anchor_preclip anchor=${anchor} mouth_source=${mouthValid ? "detector" : "bbox_lower_third"} side_share=${faceSideShare.toFixed(3)} area_share=${faceShareInCrop.toFixed(3)} face_side_px=${faceSidePx} min_size_widened=${minSizeWidened} mouth_offset_px=${mouthOffsetPx} clamped=${clampedAnchor} crop=${crop0X},${crop0Y},${crop0Size}`,
    );
  } else {
    const cf = computeFaceCrop(coords, bbox ?? null, sW, sH, 512, siblingCoords ?? null);
    crop0X = cf.x;
    crop0Y = cf.y;
    crop0Size = cf.size;
    console.warn(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v342_no_bbox_legacy_crop crop=${crop0X},${crop0Y},${crop0Size} — no usable face bbox, falling back to coords crop`,
    );
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
  const nativeOut = Math.min(1280, Math.max(720, expandedSize));
  const evenNative = nativeOut % 2 === 0 ? nativeOut : nativeOut - 1;
  const crop = { x: expandedX, y: expandedY, size: expandedSize, outputSize: evenNative };
  const outW = crop.outputSize;
  const outH = crop.outputSize;
  const durationInFrames = Math.max(6, Math.ceil(dur * FPS));

  // ════════════════════════════════════════════════════════════════════
  // v359 — MOVING WINDOW (Kamerapfad statt festem Rechteck)
  //
  // Bis v358 stand `crop` für den ganzen Turn fest. Bewegt sich die Person
  // beim Sprechen, zeigt dieses Fenster den Ort, an dem das Gesicht einmal
  // war — nicht den, an dem der Mund gerade ist. Genau das war der belegte
  // Kailee-Fall: in der ersten Hälfte des Preclips nur Haare und Schulter,
  // Sync.so fand keinen Mund und reichte das Video unverändert durch.
  //
  // Eine Bounding-Box kann kein Gesicht zurückholen, das der Crop bereits
  // weggeschnitten hat. Deshalb folgt jetzt das FENSTER dem Gesicht. Der
  // Zoom bleibt über den Turn konstant, der Pfad ist geglättet, mit
  // Dead Zone und Look-ahead — es soll wie eine geführte Kamera aussehen,
  // nicht wie ein zuckender Auto-Crop.
  //
  // Ohne Track bleibt alles exakt wie vor v359.
  // ════════════════════════════════════════════════════════════════════
  let cropPath: Array<{ x: number; y: number; size: number }> | undefined;
  let cropMode: "static" | "camera_path" = "static";
  let cameraTravelPx = 0;
  let trackContainment: number | undefined;

  const trackKeyframes = Array.isArray(input.track) ? input.track : null;
  if (trackKeyframes && trackKeyframes.length >= 2) {
    try {
      const dense = buildDenseTrack({
        keyframes: trackKeyframes.map((k) => ({ t: k.t - startSec, box: k.box })),
        frameCount: durationInFrames,
        fps: FPS,
      });
      const weights = buildSpeechWeights({
        frameCount: durationInFrames,
        fps: FPS,
        voicedWindows: (input.voicedWindows ?? [[0, dur]]) as Array<[number, number]>,
      });
      const planned = planCameraPath({
        boxes: dense,
        plateWidth: sW,
        plateHeight: sH,
        weights,
        // Zoom nicht enger als das statisch berechnete Fenster: die
        // bestehende Größenlogik (Mund-Anker, Sibling-Cap, Mindestgröße)
        // bleibt maßgeblich, v359 ändert nur die POSITION über die Zeit.
        minSize: crop.size,
      });

      if (planned.path.length === durationInFrames && planned.moving) {
        cropPath = planned.path.map((p) => ({ x: p.x, y: p.y, size: p.size }));
        cropMode = "camera_path";
        trackContainment = planned.weightedContainedRatio;
        for (let i = 1; i < planned.path.length; i++) {
          cameraTravelPx += Math.hypot(
            planned.path[i].x - planned.path[i - 1].x,
            planned.path[i].y - planned.path[i - 1].y,
          );
        }
        cameraTravelPx = Math.round(cameraTravelPx);
        // Das statische Rechteck bleibt als Repräsentant erhalten (erster
        // Frame) — Altpfade und Telemetrie lesen es weiter.
        crop.x = planned.path[0].x;
        crop.y = planned.path[0].y;
        crop.size = planned.size;
      }

      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v359_camera_path mode=${cropMode} ` +
        `size=${planned.size} moving=${planned.moving} travel_px=${cameraTravelPx} ` +
        `contained=${planned.containedRatio.toFixed(3)} weighted=${planned.weightedContainedRatio.toFixed(3)} ` +
        `max_jump=${planned.maxJump.toFixed(3)} gap_frames=${planned.maxGapFrames} ` +
        `interpolated=${planned.interpolatedFrames}`,
      );
    } catch (pathErr) {
      // Kamerapfad ist eine Verbesserung, keine Vorbedingung: schlägt die
      // Planung fehl, rendert der Preclip wie vor v359 statisch weiter.
      console.warn(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v359_camera_path_failed: ${(pathErr as Error)?.message ?? String(pathErr)}`,
      );
    }
  }



  // ════════════════════════════════════════════════════════════════════
  // v356 — TELEMETRY ONLY. No geometric pre-dispatch block.
  //
  // Evidence from the working baseline (2026-07-27, DB-verified):
  //   scene 0f8818ee, 4 speakers, status=done
  //     crop 128px → 720p, face-share 4.8 % / 8.5 % / 17.4 % / 12.9 %
  //   scene c01d339d, 4 speakers, status=done
  //     crop 165–540px, face-share 15–21 %
  //
  // Every one of those PASSING passes would be rejected by the v344.1
  // side-share floor (0.34) and by the v353 native-crop floor (144px).
  // The floors were generalised from a single failing scene and turned
  // into a law the provider never obeyed. They are removed; the numbers
  // stay in the log so we keep measuring without deciding.
  //
  // The only remaining guard is outcome-based: `mouth-motion-verdict`
  // compares the provider OUTPUT against the INPUT after the run and
  // blocks the mux + refunds on a proven passthrough.
  // ════════════════════════════════════════════════════════════════════
  if (bboxValid) {
    const fbW = Math.max(1, Number((bbox as number[])[2]) - Number((bbox as number[])[0]));
    const fbH = Math.max(1, Number((bbox as number[])[3]) - Number((bbox as number[])[1]));
    const fbSide = Math.max(fbW, fbH);
    faceShareInCrop = Math.min(1, (fbW * fbH) / Math.max(1, crop.size * crop.size));
    faceSideShare = Math.min(1, fbSide / Math.max(1, crop.size));
    faceSidePx = fbSide;

    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v356_geometry_telemetry side_share=${faceSideShare.toFixed(3)} area_share=${faceShareInCrop.toFixed(3)} crop_size=${crop.size} face_side=${Math.round(fbSide)} upscale=${(crop.outputSize / Math.max(1, crop.size)).toFixed(1)}x ratio=${(crop.size / Math.max(1, fbSide)).toFixed(2)} min_size_widened=${minSizeWidened} anchor=${anchor} — no block, verdict decides`,
    );
  }




  const t0 = Date.now();

  // v188 (Phase 1.2) — Reuse-Guard. If an earlier Lambda run for THIS exact
  // scene+pass with the SAME crop geometry finished within the last 15 min
  // (typical case: previous compose-dialog-segments hit its 180s poll timeout
  // but the Lambda kept rendering and completed at ~190s), reuse that
  // rendered mp4 instead of paying for a duplicate Lambda render. The
  // `face_crop.size` match keeps v116 face-gate expansion retries (which
  // change `size`) properly cache-missing.
  try {
    const cutoffIso = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: prior } = await supabase
      .from("video_renders")
      .select("render_id, video_url, content_config, started_at")
      .eq("source", "dialog-pass-preclip")
      .eq("status", "completed")
      .contains("content_config", {
        composer_scene_id: sceneId,
        pass_idx: passIdx,
        face_crop: { size: crop.size },
        preclip_pipeline_version: PRECLIP_PIPELINE_VERSION,
        // v359 — ein statisch gerenderter Preclip darf nicht für einen
        // Kamerapfad-Plan wiederverwendet werden: der Mux würde den Crop
        // dann entlang eines Pfades zurücklegen, mit dem er nie geschnitten
        // wurde, und das Gesicht über die Plate schmieren.
        crop_mode: cropMode,
        camera_travel_px: cameraTravelPx,
        width: outW,
        height: outH,
      })

      .gte("started_at", cutoffIso)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.video_url) {
      const actualDims = await probeMp4Dims(prior.video_url);
      if (!actualDims || actualDims.width !== outW || actualDims.height !== outH) {
        console.warn(`[pass-face-preclip] scene=${sceneId} pass=${passIdx} v358_reuse_rejected expected=${outW}x${outH} actual=${actualDims ? `${actualDims.width}x${actualDims.height}` : "unknown"}`);
      } else {
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
        actualDims,
        anchor,
        faceShareInCrop,
        faceSideShare,
        faceSidePx,
        minSizeWidened,
        mouthOffsetPx,
        clamped: clampedAnchor,
      };
      }
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
    // v359 — bewegtes Fenster. Fehlt es, rendert die Komposition statisch.
    ...(cropPath ? { cropPath } : {}),
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
        crop_mode: cropMode,
        camera_travel_px: cameraTravelPx,
        preclip_pipeline_version: PRECLIP_PIPELINE_VERSION,

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
    forceWidth: outW,
    forceHeight: outH,
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
  const invokeResp = await fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
  });
  const dispatchMs = Date.now() - dispatchStart;
  if (!invokeResp.ok) {
    const t = await invokeResp.text().catch(() => "");
    await supabase
      .from("video_renders")
      .update({
        status: "failed",
        error_message: `invoke ${invokeResp.status}: ${t}`.slice(0, 400),
        completed_at: new Date().toISOString(),
      })
      .eq("render_id", renderId);
    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v188_timing invoke_failed status=${invokeResp.status} dispatch_ms=${dispatchMs} total_ms=${Date.now() - t0}`,
    );
    return {
      ok: false,
      error: `invoke_${invokeResp.status}:${t.slice(0, 200)}`,
      errorClass: "dispatch_failed",
      preclipRenderId: renderId,
      crop,
      durationSec: dur,
      fps: FPS,
      frameCount: durationInFrames,
    };
  }

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
      const actualDims = await probeMp4Dims(url);
      if (!actualDims || actualDims.width !== outW || actualDims.height !== outH) {
        const actual = actualDims ? `${actualDims.width}x${actualDims.height}` : "unknown";
        const mismatch = `preclip_dimension_mismatch:expected=${outW}x${outH}:actual=${actual}`;
        await supabase.from("video_renders").update({ error_message: mismatch }).eq("render_id", renderId);
        console.error(`[pass-face-preclip] scene=${sceneId} pass=${passIdx} v358_DIMENSION_MISMATCH expected=${outW}x${outH} actual=${actual} — refusing Sync.so dispatch`);
        return { ok: false, error: mismatch, errorClass: "lambda_failed", preclipRenderId: renderId, crop, actualDims: actualDims ?? undefined, durationSec: dur, fps: FPS, frameCount: durationInFrames };
      }
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
        actualDims,
        anchor,
        faceShareInCrop,
        faceSideShare,
        faceSidePx,
        minSizeWidened,
        mouthOffsetPx,
        clamped: clampedAnchor,
        cropPath,
        cropMode,
        cameraTravelPx,
        trackContainment,
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
