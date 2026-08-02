/**
 * Sync.so Live Face-Gate — v252-aws-face-gate-primary
 *
 * Runs AWS Rekognition DetectFaces on the EXACT frame we are about to send to
 * Sync.so, BEFORE the dispatch call. Gemini Vision (previously the primary
 * detector here) was flaky under load — 429/5xx and unparsed text replies
 * forced too many `probe_unavailable` results. Rekognition returns
 * deterministic bboxes with confidence; that's exactly what this gate needs.
 *
 * Gemini is intentionally NOT used in this file anymore. Cartoon-Rescue and
 * Identity-Matching still use Gemini in their own modules
 * (plate-face-detect / plate-face-identity) — this file is the pre-dispatch
 * face gate only.
 *
 * Frame source (unchanged, v251 Anchor-First):
 *   - `prebuiltFrameUrl` from the caller (client-canvas capture) is preferred
 *   - otherwise a deterministic composer-frames cache hit
 *   - no server-side MP4 extraction (no Replicate/lucataco/ffmpeg)
 *
 * Verdict mapping (unchanged so callers/DB/UI keep working):
 *   - ok: true,  code: "ok"                       → safe to dispatch
 *   - ok: true,  code: "ok_after_snap", snapped_coord → caller MUST override
 *                                                       ASD coords before dispatch
 *   - ok: true,  code: "skipped"                  → preflight constraint
 *   - ok: true,  code: "probe_unavailable"        → non-blocking, dispatch proceeds
 *   - ok: false, code: "no_face" | "not_at_coord" | "multiple_faces"
 *                                                 → caller MUST refund + fail
 *
 * `unparsed` stays in the type union for back-compat but is no longer emitted.
 */

import { extractFrameForFaceProbe } from "./face-frame-extract.ts";
import { detectFacesMediaPipe } from "./face-detect-mediapipe.ts";
import { measurePreclipMouth } from "./preclip-mouth-geometry.ts";
import { awsFrameProbeAvailable, renderAwsStill } from "./aws-frame-probe.ts";
import { checkPreclipFrame } from "./frame-space.ts";
import { inspectStill } from "./still-sanity.ts";

const GATE_VERSION = "v397-zero-face-consensus";


export type FaceGateCode =
  | "ok"
  | "ok_after_snap"
  | "no_face"
  | "not_at_coord"
  | "multiple_faces"
  | "mouth_missing"
  | "mouth_at_edge"
  // ── v396 — `mouth_at_edge` war ein Sammelbecken für völlig verschiedene
  // Ursachen. Sie sind jetzt getrennt; nur `crop_not_viable` heisst wirklich
  // "richtige Person, richtiger Frame, korrekte Transformation, trotzdem am Rand".
  | "frame_mapping_failed"
  | "transform_contract_failed"
  | "face_not_detected"
  | "identity_ambiguous"
  | "wrong_identity"
  | "source_geometry_drift"
  | "recrop_required"
  | "crop_not_viable"
  // ── v397 — Messausfall (leeres/schwarzes Still) vs. degradierter Pass.
  | "still_blank"
  | "probe_degraded"
  | "skipped"
  | "probe_unavailable"
  | "unparsed";




export interface FaceGateResult {
  ok: boolean;
  code: FaceGateCode;
  reason?: string;
  raw_reply?: string;
  http_status?: number;
  /** Raw gateway error body (truncated) — for forensic logging. */
  raw_error?: string;
  /** Public URL of the JPEG we sent to Gemini (when extraction succeeded). */
  frame_jpeg_url?: string;
  /** True when the JPEG came from the storage cache. */
  frame_cached?: boolean;
  /** Replicate + Gemini wall-clock for forensic logging. */
  extract_ms?: number;
  gemini_ms?: number;
  /** v129.22.3 — Rekognition-derived plate-pixel center to use instead of
   *  the original intent coord. Only set when code === "ok_after_snap". */
  snapped_coord?: [number, number];
  /** v129.22.3 — Original intent coord before snap (log/UI delta). */
  original_coord?: [number, number];
  /** v129.22.3 — Pixel distance between original and snapped coord. */
  snap_distance_px?: number;
  /** v393 — Mundmittelpunkt auf dem dispatchten Bild, in Clip-Pixeln. */
  mouth_center?: [number, number];
  /** v393 — Messfenster um den Mund [x1,y1,x2,y2] in Clip-Pixeln. */
  mouth_rect?: [number, number, number, number];
  /** v393 — Kontrollfenster (Stirn) fuer die Rausch-Normalisierung. */
  control_rect?: [number, number, number, number];
  /** v393 — normalisierte (0..1) Messfenster fuer die Passthrough-Bewertung. */
  mouth_rect_norm?: { x: number; y: number; w: number; h: number };
  control_rect_norm?: { x: number; y: number; w: number; h: number };
  /** v393 — Bildmasse, in denen die Pixel-Fenster gelten. */
  mouth_frame_dims?: [number, number];
  /** v393 — kleinster Abstand des Mundfensters zum Bildrand. */
  mouth_edge_margin_px?: number;

  // ── v397 Forensik: was wurde tatsächlich angeschaut? ──────────────
  /** Öffentliche URLs aller geprüften Probe-Stills. */
  probe_still_urls?: string[];
  /** Bytegrösse je Probe-Still (0 = nicht ladbar). */
  probe_still_bytes?: number[];
  /** Lokale Preclip-Frameindizes je Probe. */
  probe_frame_indices?: number[];
  /** Verdikt je Probe: `faces:N` | `zero_faces` | `still_blank` | … */
  probe_verdicts?: string[];

}



function hasAwsCreds(): boolean {
  return Boolean(Deno.env.get("AWS_ACCESS_KEY_ID") && Deno.env.get("AWS_SECRET_ACCESS_KEY"));
}


export interface FaceGateInput {
  videoUrl: string;
  frameNumber: number | null | undefined;
  coord: [number, number] | null | undefined;
  /** When true (single-speaker preclip), multiple_faces is a soft pass.
   *  When false (multi-speaker plate), multiple_faces is a hard fail
   *  because Sync.so cannot disambiguate from a single coord. */
  isMultiSpeakerContext?: boolean;
  /** Hard timeout for the Gemini call (ms). Default 15s. */
  timeoutMs?: number;
  /** Optional fps hint for the frame extractor. Defaults to 30. */
  fps?: number;
  /** Pre-extracted JPEG/PNG URL. Dispatch should pass this when available so
   *  the gate probes exactly the frame that preflight/forensics use. */
  prebuiltFrameUrl?: string;
  /** Optional stable cache path parts for server-side extraction. */
  userId?: string;
  projectId?: string;
  sceneId?: string;
  passIdx?: number;
  /** True when the preclip was already validated as exactly one clean face. */
  preclipTrusted?: boolean;
  /**
   * v393 — Mund-Vorbedingung. Fuer Preclips (Single-Face-Crop, der direkt an
   * Sync.so geht) muss der Mund nachweislich im Bild liegen und Abstand zum
   * Rand haben. Ohne Mund kann der Provider nichts animieren und reicht den
   * Clip unveraendert durch — genau der belegte Passthrough-Fall.
   */
  requireMouth?: boolean;

  /** v129.22.3 — Plate pixel dims required for AWS Rekognition auto-snap.
   *  When omitted, "yes_but_not_at_coord" stays a hard fail (legacy v129.11
   *  behaviour). Callers with plate dims handy should pass them to enable
   *  self-healing. */
  plateWidth?: number;
  plateHeight?: number;

  /**
   * v396 — REAL dekodierte Framezahl des encodierten Preclips. Pflicht,
   * sobald `requireMouth` gesetzt ist. Ohne sie kann `frameNumber` nicht
   * geprüft werden und wir wiederholen den belegten Fehler: ein absoluter
   * Plate-Frame (102) wurde gegen einen 68-Frame-Preclip geprüft und der
   * Vertragsbruch blieb hinter dem stillen `t = 0.05 s`-Fallback verborgen.
   */
  decodedPreclipFrameCount?: number;
  /**
   * v396 — Frames der Zielperson dürfen NICHT über Sekunden adressiert
   * werden. Ist dieser Index gesetzt, wird genau er extrahiert.
   */
  preclipFrameIndex?: number;
  /**
   * v397 — true, wenn die v396-Geometrie (Affine + Roundtrip-Beweis) für
   * diesen Pass verifiziert wurde. Nur dann darf ein reiner Messausfall
   * (alle Stills leer) in einen degradierten Dispatch münden statt in ein
   * hartes Scheitern.
   */
  geometryContractOk?: boolean;

}

export async function verifyFaceBeforeDispatch(
  input: FaceGateInput,
): Promise<FaceGateResult> {
  if (!hasAwsCreds()) {
    return input.requireMouth === true
      ? { ok: false, code: "probe_unavailable", reason: "exact_preclip_probe_unavailable:no_aws_credentials" }
      : { ok: true, code: "skipped", reason: "no_aws_credentials" };
  }
  if (!input.videoUrl) {
    return input.requireMouth === true
      ? { ok: false, code: "probe_unavailable", reason: "exact_preclip_probe_unavailable:no_video_url" }
      : { ok: true, code: "skipped", reason: "no_video_url" };
  }


  const frame = Number.isFinite(input.frameNumber) ? Number(input.frameNumber) : null;
  const coord = Array.isArray(input.coord) && input.coord.length >= 2
    ? [Number(input.coord[0]), Number(input.coord[1])] as [number, number]
    : null;

  // ── v396 Stage 0 — Framevertrag, VOR jeder Extraktion ────────────
  // Auf einem Preclip ist `frameNumber` ein LOKALER Index. Wird hier ein
  // absoluter Plate-Frame durchgereicht, ist das ein Vertragsbruch und kein
  // Anlass, still auf einen Zeitstempel auszuweichen.
  const decodedFrameCount = Number.isFinite(input.decodedPreclipFrameCount)
    ? Number(input.decodedPreclipFrameCount)
    : null;
  let verifiedPreclipFrame: number | null = null;
  if (input.requireMouth === true) {
    const requested = Number.isFinite(input.preclipFrameIndex)
      ? Number(input.preclipFrameIndex)
      : frame;
    if (decodedFrameCount === null || !(decodedFrameCount > 0)) {
      return {
        ok: false,
        code: "frame_mapping_failed",
        reason:
          "decoded_preclip_frame_count is unknown — refusing to probe a preclip frame by timestamp " +
          "(v396: no more seconds-based extraction)",
      };
    }
    if (requested !== null) {
      const checked = checkPreclipFrame(requested, decodedFrameCount);
      if (!checked.ok) {
        console.warn(`[face-gate] ${GATE_VERSION} frame_mapping_failed ${checked.reason}`);
        return { ok: false, code: "frame_mapping_failed", reason: checked.reason };
      }
      verifiedPreclipFrame = Number(checked.frame);
    } else {
      verifiedPreclipFrame = 0;
    }
  }

  // v396/v397 — Zeitstempel werden AUSSCHLIESSLICH aus geprüften lokalen
  // Preclip-Frameindizes abgeleitet (siehe Konsens-Schleife unten). Der
  // frühere feste Wert `0.05 s` war der stille Fallback, hinter dem sich der
  // "102 aus 68"-Vertragsbruch versteckt hat.




  // Rekognition braucht Bildmasse, um relative Boxen in Pixel zu wandeln.
  const W = Math.max(0, Number(input.plateWidth ?? 0));
  const H = Math.max(0, Number(input.plateHeight ?? 0));
  const rekW = W > 0 ? W : 1280;
  const rekH = H > 0 ? H : 720;

  // ── v397 Forensik-Sammler ────────────────────────────────────────
  const probeStillUrls: string[] = [];
  const probeStillBytes: number[] = [];
  const probeFrameIndices: number[] = [];
  const probeVerdicts: string[] = [];

  let frameJpegUrl: string | undefined;
  let frameCached = false;
  let extractMs = 0;
  let rek: Awaited<ReturnType<typeof detectFacesMediaPipe>> | null = null;
  let awsMs = 0;

  /** Ein Still auswerten: erst Bildinhalt, dann Gesichter. */
  const probeStill = async (
    url: string,
    frameIdx: number,
  ): Promise<
    | { state: "faces"; rek: Awaited<ReturnType<typeof detectFacesMediaPipe>>; ms: number }
    | { state: "zero"; ms: number }
    | { state: "blank"; code: string }
    | { state: "detector_error"; error: string; ms: number }
  > => {
    const sanity = await inspectStill(url);
    probeStillUrls.push(url);
    probeStillBytes.push(sanity.bytes);
    probeFrameIndices.push(frameIdx);
    if (!sanity.usable) {
      probeVerdicts.push(sanity.code);
      console.warn(
        `[face-gate] ${GATE_VERSION} still_not_usable frame=${frameIdx} code=${sanity.code} ` +
        `reason=${sanity.reason ?? "-"} bytes=${sanity.bytes}`,
      );
      return { state: "blank", code: sanity.code };
    }
    const t0 = Date.now();
    try {
      const r = await detectFacesMediaPipe({
        videoUrl: input.videoUrl,
        plateWidth: rekW,
        plateHeight: rekH,
        durationSec: 1,
        prebuiltFrameUrls: [url],
      });
      const ms = Date.now() - t0;
      if (!r.ok) {
        probeVerdicts.push(`detector_error:${r.error ?? "unknown"}`);
        return { state: "detector_error", error: r.error ?? "unknown", ms };
      }
      if ((r.faces?.length ?? 0) === 0) {
        probeVerdicts.push("zero_faces");
        return { state: "zero", ms };
      }
      probeVerdicts.push(`faces:${r.faces.length}`);
      return { state: "faces", rek: r, ms };
    } catch (e) {
      const ms = Date.now() - t0;
      probeVerdicts.push("detector_threw");
      return { state: "detector_error", error: (e as Error)?.message ?? String(e), ms };
    }
  };

  const forensicMeta = () => ({
    probe_still_urls: [...probeStillUrls],
    probe_still_bytes: [...probeStillBytes],
    probe_frame_indices: [...probeFrameIndices],
    probe_verdicts: [...probeVerdicts],
  });

  // ── Stage 1/2 (Preclip) — Konsens über bis zu 3 Frames ───────────
  if (input.requireMouth === true && awsFrameProbeAvailable()) {
    const total = decodedFrameCount ?? 0;
    const base = verifiedPreclipFrame ?? 0;
    const span = Math.max(1, Math.round(total * 0.15));
    const candidates: number[] = [];
    for (const idx of [base, base + span, base - span]) {
      const checked = checkPreclipFrame(idx, total);
      if (checked.ok && !candidates.includes(Number(checked.frame))) {
        candidates.push(Number(checked.frame));
      }
    }
    if (candidates.length === 0) candidates.push(0);

    const fps = Number.isFinite(input.fps) && Number(input.fps) > 0 ? Number(input.fps) : 30;
    let zeroCount = 0;
    let usableCount = 0;
    let detectorError: string | null = null;

    // Ein bereits vorhandenes Client-Canvas-Frame ist autoritativ und wird
    // als erster Kandidat geprüft.
    const prebuilt = typeof input.prebuiltFrameUrl === "string" && input.prebuiltFrameUrl.startsWith("http")
      ? input.prebuiltFrameUrl
      : null;

    for (let i = 0; i < candidates.length; i++) {
      const idx = candidates[i];
      let url: string | null = null;
      let cached = false;
      if (i === 0 && prebuilt) {
        url = prebuilt;
        cached = true;
      } else {
        const t0 = Date.now();
        const still = await renderAwsStill({
          videoUrl: input.videoUrl,
          // v396 — kein Sekunden-Raten. Der Zeitstempel folgt streng dem
          // gegen die dekodierte Framezahl geprüften LOKALEN Index.
          timestamp: (idx + 0.5) / fps,
          frameSize: Math.max(64, Number(input.plateWidth ?? input.plateHeight ?? 720)),
          deadline: Date.now() + Math.max(15_000, input.timeoutMs ?? 45_000),
        });
        extractMs += Date.now() - t0;
        if (!still.url) {
          probeFrameIndices.push(idx);
          probeVerdicts.push(`still_render_failed:${still.error ?? "unknown"}`);
          continue;
        }
        url = still.url;
      }

      const res = await probeStill(url, idx);
      if (res.state === "faces") {
        frameJpegUrl = url;
        frameCached = cached;
        rek = res.rek;
        awsMs += res.ms;
        usableCount++;
        break;
      }
      if (res.state === "zero") {
        frameJpegUrl = frameJpegUrl ?? url;
        awsMs += res.ms;
        usableCount++;
        zeroCount++;
        continue;
      }
      if (res.state === "detector_error") {
        awsMs += res.ms;
        detectorError = res.error;
        continue;
      }
      // blank → Messausfall, nächster Kandidat
    }

    if (!rek) {
      const baseFail = {
        frame_jpeg_url: frameJpegUrl,
        frame_cached: frameCached,
        extract_ms: extractMs,
        gemini_ms: awsMs,
        ...forensicMeta(),
      };

      // Zwei auswertbare Stills, beide ohne Gesicht → belastbarer Befund.
      if (zeroCount >= 2) {
        console.warn(`[face-gate] ${GATE_VERSION} no_face consensus zero=${zeroCount}/${usableCount}`);
        return {
          ok: false,
          code: "no_face",
          reason:
            `AWS Rekognition detected no human face in ${zeroCount} independent preclip stills ` +
            `(frames ${probeFrameIndices.join(",")}) — Sync.so cannot lipsync.`,
          raw_reply: `aws_rek:0_face x${zeroCount}`,
          ...baseFail,
        };
      }

      // Alle Stills leer/schwarz → Messausfall, KEIN Befund.
      if (usableCount === 0) {
        const allBlank = probeVerdicts.length > 0 &&
          probeVerdicts.every((v) => v.startsWith("still_"));
        if (allBlank && input.preclipTrusted === true && input.geometryContractOk === true) {
          console.warn(
            `[face-gate] ${GATE_VERSION} probe_degraded — all stills blank, but preclip is ` +
            `single-face validated and geometry roundtrip passed. Dispatching under degraded trust.`,
          );
          return {
            ok: true,
            code: "probe_degraded",
            reason: `still_blank_all:${probeVerdicts.join(",")} — dispatch under degraded trust (preclip validated).`,
            ...baseFail,
          };
        }
        return {
          ok: false,
          code: allBlank ? "still_blank" : "probe_unavailable",
          reason: allBlank
            ? `exact_preclip_probe_unavailable:still_blank_all:${probeVerdicts.join(",")}`
            : `exact_preclip_probe_unavailable:${detectorError ?? probeVerdicts.join(",") || "no_frame"}`,
          ...baseFail,
        };
      }

      // Genau ein auswertbares Still ohne Gesicht — zu dünn für ein hartes
      // Urteil (v397: no_face braucht Konsens).
      return {
        ok: false,
        code: "probe_unavailable",
        reason:
          `exact_preclip_probe_inconclusive:zero_faces_on_single_still ` +
          `(usable=${usableCount}, verdicts=${probeVerdicts.join(",")})`,
        ...baseFail,
      };
    }
  }

  // ── Stage 1 (Nicht-Preclip) — bestehendes Verhalten ──────────────
  if (!rek) {
    if (typeof input.prebuiltFrameUrl === "string" && input.prebuiltFrameUrl.startsWith("http")) {
      frameJpegUrl = input.prebuiltFrameUrl;
      frameCached = true;
    } else if (frame != null) {
      const extracted = await extractFrameForFaceProbe({
        videoUrl: input.videoUrl,
        frameNumber: verifiedPreclipFrame ?? frame,
        fps: input.fps ?? 30,
        userId: input.userId,
        projectId: input.projectId,
        sceneId: input.sceneId,
        passIdx: input.passIdx,
      });
      extractMs += extracted.latencyMs ?? 0;
      if (!extracted.ok || !extracted.frameUrl) {
        return {
          ok: input.requireMouth !== true,
          code: "probe_unavailable",
          reason: input.requireMouth === true
            ? `exact_preclip_probe_unavailable:${extracted.reason ?? "unknown"}`
            : `frame_probe_unavailable: ${extracted.reason ?? "unknown"}; source=${input.preclipTrusted ? "preclip-validated" : "none"} — dispatch will proceed unchecked.`,
          extract_ms: extractMs,
          ...forensicMeta(),
        };
      }
      frameJpegUrl = extracted.frameUrl;
      frameCached = !!extracted.cached;
    }

    if (!frameJpegUrl) {
      return {
        ok: input.requireMouth !== true,
        code: "probe_unavailable",
        reason: input.requireMouth === true
          ? "exact_preclip_probe_unavailable:no_frame"
          : `no_client_canvas_frame; source=${input.preclipTrusted ? "preclip-validated" : "none"} — dispatch will proceed unchecked.`,
        extract_ms: extractMs,
        ...forensicMeta(),
      };
    }

    // ── Stage 2 — AWS Rekognition auf dem extrahierten Bild ────────
    const awsStart = Date.now();
    try {
      rek = await detectFacesMediaPipe({
        videoUrl: input.videoUrl,
        plateWidth: rekW,
        plateHeight: rekH,
        durationSec: 1,
        prebuiltFrameUrls: [frameJpegUrl],
      });
    } catch (e) {
      return {
        ok: input.requireMouth !== true,
        code: "probe_unavailable",
        reason: input.requireMouth === true
          ? `exact_preclip_face_probe_threw:${(e as Error)?.message ?? String(e)}`
          : `aws_rekognition_threw: ${(e as Error)?.message ?? String(e)} — dispatch will proceed unchecked.`,
        frame_jpeg_url: frameJpegUrl,
        frame_cached: frameCached,
        extract_ms: extractMs,
        gemini_ms: Date.now() - awsStart,
        ...forensicMeta(),
      };
    }
    awsMs += Date.now() - awsStart;
  }

  const faceCount = rek.faces?.length ?? 0;
  const rawReply = rek.ok
    ? `aws_rek:${faceCount}_face${faceCount === 1 ? `@${Math.round(rek.faces[0].center[0])},${Math.round(rek.faces[0].center[1])}` : ""}`
    : `aws_rek_error:${rek.error ?? "unknown"}`;

  const baseMeta = {
    frame_jpeg_url: frameJpegUrl,
    frame_cached: frameCached,
    extract_ms: extractMs,
    gemini_ms: awsMs, // reused meta field for wall-clock (kept name for schema compat)
    ...forensicMeta(),
  } as const;

  if (!rek.ok) {
    // v397 — hier landen nur noch ECHTE Ausfälle (Credentials, Fetch, HTTP).
    // "0 Gesichter" ist seit v397 `ok:true, faces:[]` und fällt unten in den
    // korrekten `no_face`-Pfad.
    return {
      ok: input.requireMouth !== true,
      code: "probe_unavailable",
      reason: input.requireMouth === true
        ? `exact_preclip_face_probe_error:${rek.error ?? "unknown"}`
        : `aws_rekognition_error: ${rek.error ?? "unknown"} — dispatch will proceed unchecked.`,
      raw_error: (rek.error ?? "").slice(0, 400),
      raw_reply: rawReply,
      ...baseMeta,
    };
  }


  // ── Verdict from face count ──────────────────────────────────────
  if (faceCount === 0) {
    console.log(`[face-gate] ${GATE_VERSION} no_face on jpeg`);
    return {
      ok: false,
      code: "no_face",
      reason: "AWS Rekognition detected no human face in the extracted ASD frame — Sync.so cannot lipsync.",
      raw_reply: rawReply,
      ...baseMeta,
    };
  }

  // ── v393 — Mundgeometrie auf genau diesem Bild ───────────────────
  // Ein Gesicht ohne sichtbaren Mund ist fuer Sync.so wertlos. Wir messen
  // hier einmal und geben die Fenster zurueck, damit die spaetere
  // Passthrough-Bewertung nicht mehr auf einem generischen Grossbereich
  // raten muss.
  const mouthGeo = measurePreclipMouth({
    faces: (rek.faces ?? []).map((f: any) => ({
      bbox: f.bbox,
      center: f.center,
      landmarks: f.landmarks,
    })),
    width: rekW,
    height: rekH,
  });
  // Pixel- UND normalisierte Fassung: Pixel fuer die Forensik, normalisiert
  // fuer die spaetere Passthrough-Messung, die in 0..1 rechnet.
  const toNorm = (r?: [number, number, number, number]) =>
    r && rekW > 0 && rekH > 0
      ? { x: r[0] / rekW, y: r[1] / rekH, w: (r[2] - r[0]) / rekW, h: (r[3] - r[1]) / rekH }
      : undefined;
  const mouthMeta = {
    mouth_center: mouthGeo.mouthCenter,
    mouth_rect: mouthGeo.mouthRect,
    control_rect: mouthGeo.controlRect,
    mouth_rect_norm: toNorm(mouthGeo.mouthRect),
    control_rect_norm: toNorm(mouthGeo.controlRect),
    mouth_frame_dims: [rekW, rekH] as [number, number],
    mouth_edge_margin_px: mouthGeo.edgeMarginPx,
  } as const;

  console.log(
    `[face-gate] ${GATE_VERSION} mouth_geometry code=${mouthGeo.code} derived=${mouthGeo.derived} ` +
    `center=${mouthGeo.mouthCenter?.join(",") ?? "-"} band_y=${mouthGeo.bandY?.toFixed(3) ?? "-"} ` +
    `edge_margin=${mouthGeo.edgeMarginPx ?? "-"}px frame=${rekW}x${rekH} require_mouth=${input.requireMouth === true}`,
  );
  if (input.requireMouth === true && !mouthGeo.ok) {
    return {
      ok: false,
      code: mouthGeo.code === "no_face" ? "no_face" : (mouthGeo.code as FaceGateCode),
      reason: `Preclip mouth check failed: ${mouthGeo.reason ?? mouthGeo.code}`,
      raw_reply: rawReply,
      ...baseMeta,
      ...mouthMeta,
    };
  }



  if (faceCount > 1) {
    if (input.isMultiSpeakerContext) {
      console.log(`[face-gate] ${GATE_VERSION} multiple_faces=${faceCount} multi_speaker=true → hard fail`);
      return {
        ok: false,
        code: "multiple_faces",
        reason: `AWS Rekognition saw ${faceCount} faces on a multi-speaker plate — Sync.so cannot disambiguate from a single coordinate.`,
        raw_reply: rawReply,
        ...baseMeta,
      ...mouthMeta,
      };
    }
    // Single-speaker preclip: extra faces (e.g. background extra) are a
    // soft pass — the preclip crop guarantees the target face dominates.
    console.log(`[face-gate] ${GATE_VERSION} multiple_faces=${faceCount} single_speaker → soft pass`);
    return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta, ...mouthMeta };
  }

  // Exactly one face — check coord tolerance if we have both coord + plate dims.
  const f = rek.faces[0];
  const faceCx = f.center[0];
  const faceCy = f.center[1];

  if (coord != null && W > 0 && H > 0) {
    // Tolerance: 15% of the longer plate side.
    const tolPx = Math.max(W, H) * 0.15;
    const dist = Math.hypot(faceCx - coord[0], faceCy - coord[1]);
    if (dist <= tolPx) {
      console.log(
        `[face-gate] ${GATE_VERSION} ok face=[${Math.round(faceCx)},${Math.round(faceCy)}] ` +
        `coord=[${coord[0]},${coord[1]}] dist=${Math.round(dist)}px tol=${Math.round(tolPx)}px`,
      );
      return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta, ...mouthMeta };
    }

    // Off-coord: attempt auto-snap when the face is inside the 5-95% safe zone.
    const inBounds =
      faceCx >= W * 0.05 && faceCx <= W * 0.95 &&
      faceCy >= H * 0.05 && faceCy <= H * 0.95;
    if (inBounds) {
      const snapped: [number, number] = [Math.round(faceCx), Math.round(faceCy)];
      console.log(
        `[face-gate] ${GATE_VERSION} AUTO_SNAP intent=[${coord[0]},${coord[1]}] ` +
        `→ rekognition=[${snapped[0]},${snapped[1]}] dist=${Math.round(dist)}px plate=${W}x${H}`,
      );
      return {
        ok: true,
        code: "ok_after_snap",
        reason: `Intent coord [${coord[0]},${coord[1]}] missed the face. ` +
          `Rekognition snapped to [${snapped[0]},${snapped[1]}] (${Math.round(dist)}px delta).`,
        raw_reply: rawReply,
        snapped_coord: snapped,
        original_coord: [coord[0], coord[1]],
        snap_distance_px: Math.round(dist),
        ...baseMeta,
      ...mouthMeta,
      };
    }

    console.warn(
      `[face-gate] ${GATE_VERSION} not_at_coord face=[${Math.round(faceCx)},${Math.round(faceCy)}] ` +
      `outside safe-zone on plate ${W}x${H} — hard fail.`,
    );
    return {
      ok: false,
      code: "not_at_coord",
      reason: `Face exists but not at active_speaker_detection coord [${coord[0]},${coord[1]}] — Sync.so would return generation_unknown_error.`,
      raw_reply: rawReply,
      ...baseMeta,
      ...mouthMeta,
    };
  }

  // No coord or no plate dims → 1 face is a green light.
  console.log(`[face-gate] ${GATE_VERSION} ok face_count=1 (no coord check)`);
  return { ok: true, code: "ok", raw_reply: rawReply, ...baseMeta, ...mouthMeta };

}
