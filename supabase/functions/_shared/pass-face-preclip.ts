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
import { assessCropGeometry } from "./plate-identity-split.ts";

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
   * v331 (27.07./v169 restore) — measured face trajectory of THIS speaker on
   * the master plate, in plate pixel space. v327 used a "moving" classification
   * to drop the preclip entirely and dispatch the full plate, which let Sync.so
   * bleed onto neighbouring faces (visible morphing). v331 keeps the preclip as
   * the single source of truth and instead widens/recenters the crop so the
   * speaker's whole trajectory over the voiced window stays inside it.
   * Points outside [startSec, endSec] are ignored.
   */
  trackPoints?: Array<{ t: number; bbox: [number, number, number, number] }> | null;
  /**
   * v334 — geltender Face-Share-Floor des Dispatchers (0.24 bei ≥ 2 Sprechern,
   * sonst 0.12). Der Motion-Cover deckelt die Crop-Größe so, dass der Share
   * diesen Wert nicht unterschreitet.
   */
  faceShareFloor?: number | null;
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
  /** v247 — true when clamping forced the crop off the ideal anchor. */
  clamped?: boolean;
  /** v329 — true when the detector box was too small to be trusted. */
  geometrySuspicious?: boolean;
  /** v329 — why the geometry was rejected ("ok" | "box_too_small" | "no_bbox"). */
  geometryReason?: string;
  /** v329 — detector box width as a fraction of plate width (0..1). */
  plateBoxWidthPct?: number;
  /** v331 — number of trajectory samples inside the voiced window. */
  trackSamplesUsed?: number;
  /** v331 — max center drift (px) of the speaker across the voiced window. */
  trackDriftPx?: number;
  /** v331 — true when the crop was widened/recentered to cover the trajectory. */
  motionCropApplied?: boolean;
  /** v334 — why the motion cover did not run ("insufficient_samples" | "insufficient_motion" | "v334_track_scale_mismatch" | "no_hull" | "uncoverable"). */
  motionSkipReason?: string | null;
  /** v334 — which box source the reported faceShareInCrop was measured from. */
  faceShareSource?: "plate" | "track";

  error?: string;
  errorClass?: "dispatch_failed" | "lambda_failed" | "poll_timeout" | "invalid_input";
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
    trackPoints,
    faceShareFloor,
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

  // ── v329 — Geometrie-Plausibilität VOR dem Crop ────────────────────────
  // Der frühere feste `minSize: 128` hat untaugliche Detektor-Boxen nicht
  // abgefangen, sondern zementiert: eine 47×63-Box auf 1284×718 ergab einen
  // 128-px-Crop mit 18 % Face-Share, in dem der Kopf am Rand abgeschnitten
  // war. Sync.so gibt so ein Video unverändert zurück. Statt zu klemmen
  // bewerten wir die Box und ziehen bei unplausibler Geometrie ein
  // PLATE-PROPORTIONALES Fenster um den Mund-Landmark auf.
  const geometry = assessCropGeometry({ bbox: bbox ?? null, plateWidth: sW, plateHeight: sH });
  if (geometry.suspicious) {
    console.warn(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v329_geometry_suspicious reason=${geometry.reason} ` +
      `box_w_pct=${(geometry.boxWidthPct * 100).toFixed(2)}% box_h_pct=${(geometry.boxHeightPct * 100).toFixed(2)}% ` +
      `min_crop=${geometry.minCropSize} plate=${sW}x${sH} — widening crop to plate-proportional window`,
    );
  }

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
      targetFaceShare: 0.42,
      // v329 — kein harter 128-px-Floor mehr. Bei plausibler Box eine
      // konservative Untergrenze, bei unplausibler Box das proportionale
      // Rettungsfenster (≈ 26 % Plate-Höhe, min. 288 px).
      minSize: geometry.minCropSize,
      outputSize: 720,
    });
    crop0X = r.crop.x;
    crop0Y = r.crop.y;
    crop0Size = r.crop.size;
    anchor = r.anchor;
    faceShareInCrop = r.faceShareInCrop;
    mouthOffsetPx = r.mouthOffsetPx;
    clampedAnchor = r.clamped;
    console.log(
      `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v247_mouth_anchor_preclip anchor=${anchor} face_share=${faceShareInCrop.toFixed(3)} mouth_offset_px=${mouthOffsetPx} clamped=${clampedAnchor} crop=${crop0X},${crop0Y},${crop0Size} v329_geometry=${geometry.reason} min_crop=${geometry.minCropSize}`,
    );
  } else {
    const cf = computeFaceCrop(coords, bbox ?? null, sW, sH, 512, siblingCoords ?? null);
    crop0X = cf.x;
    crop0Y = cf.y;
    crop0Size = cf.size;
    // v329 — auch der Legacy-Pfad darf nicht unter das proportionale
    // Mindestfenster fallen, wenn die Geometrie unplausibel ist.
    if (geometry.suspicious && crop0Size < geometry.minCropSize) {
      const target = Math.min(Math.min(sW, sH), geometry.minCropSize);
      const cx = crop0X + crop0Size / 2;
      const cy = crop0Y + crop0Size / 2;
      crop0Size = target % 2 === 0 ? target : target - 1;
      crop0X = Math.max(0, Math.min(sW - crop0Size, Math.round(cx - crop0Size / 2)));
      crop0Y = Math.max(0, Math.min(sH - crop0Size, Math.round(cy - crop0Size / 2)));
    }
  }
  let crop0 = { x: crop0X, y: crop0Y, size: crop0Size };

  // ── v331 — Motion-Cover Crop (Rückbau des v327 Full-Plate-Pfads) ────────
  // v327 hat bei "moving" den Preclip fallen gelassen und die volle Plate an
  // Sync.so geschickt — genau dort greift der Provider auf Nachbargesichter
  // über (Morphing). v331 behält den Preclip und fasst die Bewegung stattdessen
  // IM Crop ein: Wir bilden die Hüllbox aller gemessenen Gesichtsboxen im
  // Sprechfenster, addieren einen Sicherheitsrand und zentrieren neu.
  //
  // v334 — Face-Share-Konsistenz. Der v331-Block hat die Hüllbox aus den
  // TRACK-Boxen gebildet, den Face-Share danach aber mit der (viel kleineren)
  // Plate-Box gegen die Hüllfläche gerechnet. Ergebnis: systematisch zu kleine
  // Shares (z. B. 2,8 % bei 4 px Drift) → `preclip_face_share_too_low` obwohl
  // der Mund-Anker-Crop sauber war. v334 misst konsistent aus derselben
  // Boxquelle, greift nur bei echter Bewegung und deckelt share-erhaltend.
  let trackSamplesUsed = 0;
  let trackDriftPx = 0;
  let motionCropApplied = false;
  let motionSkipReason: string | null = null;
  let faceShareSource: "plate" | "track" = "plate";
  const shareFloor = Number.isFinite(Number(faceShareFloor)) && Number(faceShareFloor) > 0
    ? Number(faceShareFloor)
    : 0.12;

  if (Array.isArray(trackPoints) && trackPoints.length > 0) {
    const pad = 0.15; // 15 % Sicherheitsrand auf die Hüllbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let firstC: [number, number] | null = null;
    const trackWidths: number[] = [];
    const trackAreas: number[] = [];
    for (const p of trackPoints) {
      const t = Number(p?.t);
      if (!Number.isFinite(t) || t < startSec - 0.2 || t > endSec + 0.2) continue;
      const b = p?.bbox;
      if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isFinite(Number(n)))) continue;
      const bw = Number(b[2]) - Number(b[0]);
      const bh = Number(b[3]) - Number(b[1]);
      if (!(bw > 0) || !(bh > 0)) continue;
      trackSamplesUsed++;
      trackWidths.push(bw);
      trackAreas.push(bw * bh);
      minX = Math.min(minX, Number(b[0]));
      minY = Math.min(minY, Number(b[1]));
      maxX = Math.max(maxX, Number(b[2]));
      maxY = Math.max(maxY, Number(b[3]));
      const c: [number, number] = [(Number(b[0]) + Number(b[2])) / 2, (Number(b[1]) + Number(b[3])) / 2];
      if (!firstC) firstC = c;
      else trackDriftPx = Math.max(trackDriftPx, Math.hypot(c[0] - firstC[0], c[1] - firstC[1]));
    }

    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
    };
    const medianTrackWidth = median(trackWidths);
    const medianTrackArea = median(trackAreas);

    const plateBoxWidth = Array.isArray(bbox) && bbox.length === 4
      ? Number(bbox[2]) - Number(bbox[0])
      : 0;

    // (4) Plausibilitätsbremse: weichen die Boxquellen um mehr als Faktor 2.5
    // voneinander ab, stimmen die Koordinatenräume nicht überein — dann darf
    // aus dem Track kein Crop abgeleitet werden.
    const scaleRatio = plateBoxWidth > 0 && medianTrackWidth > 0
      ? Math.max(medianTrackWidth / plateBoxWidth, plateBoxWidth / medianTrackWidth)
      : 1;

    // (2) Motion-Cover nur bei echter Bewegung.
    const driftRelevant = medianTrackWidth > 0
      ? trackDriftPx > 0.08 * medianTrackWidth
      : trackDriftPx > 8;

    if (trackSamplesUsed < 3) {
      motionSkipReason = "insufficient_samples";
    } else if (scaleRatio > 2.5) {
      motionSkipReason = "v334_track_scale_mismatch";
      console.warn(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v334_track_scale_mismatch ` +
        `plate_box_w=${Math.round(plateBoxWidth)} track_box_w=${Math.round(medianTrackWidth)} ratio=${scaleRatio.toFixed(2)} — motion cover discarded`,
      );
    } else if (!driftRelevant) {
      motionSkipReason = "insufficient_motion";
    } else if (!(Number.isFinite(minX) && maxX > minX && maxY > minY)) {
      motionSkipReason = "no_hull";
    }

    if (!motionSkipReason) {
      const hullW = (maxX - minX) * (1 + pad * 2);
      const hullH = (maxY - minY) * (1 + pad * 2);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      let want = Math.ceil(Math.max(hullW, hullH, crop0.size));

      // Nachbar-Deckel: der Crop darf nie bis zu einem anderen Gesicht reichen.
      let neighborCap = Infinity;
      for (const s of siblingCoords ?? []) {
        if (!Array.isArray(s) || s.length !== 2) continue;
        const d = Math.max(Math.abs(Number(s[0]) - cx), Math.abs(Number(s[1]) - cy));
        if (Number.isFinite(d)) neighborCap = Math.min(neighborCap, Math.max(64, (d - 24) * 2));
      }

      // (3) Share-erhaltende Deckelung: der Crop darf nie so groß werden, dass
      // das (mit derselben Boxquelle gemessene) Gesicht unter den Floor fällt.
      const faceArea = medianTrackArea > 0
        ? medianTrackArea
        : (plateBoxWidth > 0 && Array.isArray(bbox)
          ? plateBoxWidth * (Number(bbox[3]) - Number(bbox[1]))
          : 0);
      const shareCap = faceArea > 0 ? Math.sqrt(faceArea / shareFloor) : Infinity;

      const maxAllowed = Math.min(sW, sH, neighborCap, shareCap);

      if (want > maxAllowed) {
        // Bewegung passt nicht in einen nachbarsicheren Crop → ehrlich
        // fehlschlagen statt Full-Plate zu riskieren (Morph-Vermeidung).
        if (Math.max(hullW, hullH) > maxAllowed) {
          console.warn(
            `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v331_motion_uncoverable ` +
            `hull=${Math.round(hullW)}x${Math.round(hullH)} max_allowed=${Math.round(maxAllowed)} ` +
            `neighbor_cap=${Number.isFinite(neighborCap) ? Math.round(neighborCap) : "none"} ` +
            `share_cap=${Number.isFinite(shareCap) ? Math.round(shareCap) : "none"} floor=${shareFloor} ` +
            `drift_px=${Math.round(trackDriftPx)} samples=${trackSamplesUsed}`,
          );
          return {
            ok: false,
            error: "motion_uncoverable",
            errorClass: "invalid_input",
            trackSamplesUsed,
            trackDriftPx,
            motionSkipReason: "uncoverable",
          };
        }
        want = Math.floor(maxAllowed);
      }

      const size = (want % 2 === 0 ? want : want - 1);
      const x = Math.max(0, Math.min(sW - size, Math.round(cx - size / 2)));
      const y = Math.max(0, Math.min(sH - size, Math.round(cy - size / 2)));
      if (size !== crop0.size || x !== crop0.x || y !== crop0.y) {
        motionCropApplied = true;
        crop0 = { x: x % 2 === 0 ? x : Math.max(0, x - 1), y: y % 2 === 0 ? y : Math.max(0, y - 1), size };
        // (1) Face-Share aus DERSELBEN Boxquelle wie die Hüllbox messen.
        if (medianTrackArea > 0) {
          faceShareInCrop = medianTrackArea / (size * size);
          faceShareSource = "track";
        } else if (Array.isArray(bbox) && bbox.length === 4) {
          const fw = Number(bbox[2]) - Number(bbox[0]);
          const fh = Number(bbox[3]) - Number(bbox[1]);
          if (fw > 0 && fh > 0) {
            faceShareInCrop = (fw * fh) / (size * size);
            faceShareSource = "plate";
          }
        }
      }
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v331_motion_cover applied=${motionCropApplied} ` +
        `samples=${trackSamplesUsed} drift_px=${Math.round(trackDriftPx)} crop=${crop0.x},${crop0.y},${crop0.size} ` +
        `face_share=${faceShareInCrop.toFixed(3)} share_src=${faceShareSource} floor=${shareFloor}`,
      );
    } else {
      console.log(
        `[pass-face-preclip] scene=${sceneId} pass=${passIdx} v334_motion_cover_skipped reason=${motionSkipReason} ` +
        `samples=${trackSamplesUsed} drift_px=${Math.round(trackDriftPx)} track_box_w=${Math.round(medianTrackWidth)} ` +
        `plate_box_w=${Math.round(plateBoxWidth)} crop=${crop0.x},${crop0.y},${crop0.size} face_share=${faceShareInCrop.toFixed(3)}`,
      );
    }
  }





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
        geometrySuspicious: geometry.suspicious,
        geometryReason: geometry.reason,
        plateBoxWidthPct: geometry.boxWidthPct,
        trackSamplesUsed,
        trackDriftPx,
        motionCropApplied,
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
        geometrySuspicious: geometry.suspicious,
        geometryReason: geometry.reason,
        plateBoxWidthPct: geometry.boxWidthPct,
        trackSamplesUsed,
        trackDriftPx,
        motionCropApplied,
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
