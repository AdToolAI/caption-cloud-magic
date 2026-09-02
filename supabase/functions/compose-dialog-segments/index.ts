/**
 * compose-dialog-segments — Sync.so Segments API, multi-pass per-speaker.
 *
 * MAY 2026 PIVOT (character-swap fix):
 * --------------------------------------------------------------------
 * The old "1-call" segments dispatch (single audio multiplexed across
 * speakers via `segments[]` + `active_speaker_detection.bounding_boxes`)
 * has two unsolvable problems against `lipsync-2-pro`:
 *
 *   1. Sync.so segments + per-frame `bounding_boxes` returns
 *      `An unknown error occurred` (DB-confirmed across May 2026 runs;
 *      v4 source comment in compose-twoshot-lipsync also documents this
 *      regression). Removing ASD makes the call complete BUT Sync.so
 *      then picks the audio→face mapping itself and routinely swaps
 *      speakers — exactly the bug the user reported.
 *   2. NOTE (v121, Juni 2026): The Sync.so docs DO document per-segment
 *      ASD via `segments[].optionsOverride.active_speaker_detection` today.
 *      Migrating the chained-pass dispatcher to that single-call route is
 *      tracked in plan v121 (compose-dialog-segments doc-current route);
 *      this comment block is retained to explain the historic chain.

 *
 * The only stable multi-speaker pattern is the one v4 used: one Sync.so
 * call per speaker, each with single-coord ASD pointing at THAT speaker's
 * face. We chain them: pass N's video input = pass N-1's output. The final
 * pass's output has every speaker correctly lip-synced.
 *
 * State model (dialog_shots, multi-pass):
 *  {
 *    version: 5,
 *    engine: "sync-segments",
 *    status: "queued" | "rendering" | "done" | "failed",
 *    multi_pass: true,
 *    passes: [{
 *      idx, speaker_idx, character_id, audio_url, coords,
 *      segments[], input_url, job_id?, output_url?, status, started_at?,
 *      finished_at?
 *    }, ...],
 *    current_pass: number,           // index into passes[]
 *    total_passes: number,
 *    sync_job_id: string,            // CURRENT pass's job id (for webhook)
 *    source_clip_url: string,        // pass 0 video input (master plate)
 *    total_sec: number,
 *    cost_credits: number,           // SUM across all passes
 *    refunded: boolean,
 *    final_url?: string,
 *    error?: string,
 *  }
 *
 * The webhook calls back into this function with `{ advance: true }` to
 * dispatch the next pass once a pass completes. Idempotent. Single-speaker
 * scenes still run as a single pass (no behaviour change for monologues).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import {
  classifySyncError,
  detectVoicedFrames,
  detectVoicedRange,
  countInflightSyncJobs,
  emitSystemAlert,
  evaluateCircuit,
  getSyncApiKey,
  inspectWav,
  logSyncDispatch,
  normalizeWav,
  sliceWavToWindows,
  openCircuit,
  probeAsset,
  readPreferredSyncSourceKind,
  recordCircuitFailure,
  recordCircuitSuccess,
  reconcileStaleSyncJobs,
  registerInflightSyncJob,
  SYNCSO_DEFAULT_MAX_PARALLEL,
  // trimWavLeadIn intentionally NOT imported (v33: lead-in trim disabled).
  validateFrameFace,
  validateSegments,
  validateSyncResponseShape,
} from "../_shared/syncso-preflight.ts";
import {
  pickSpeakerCoordinates,
  probeMp4Dims,
  resolveCharacterPortraits,
  resolveSceneFaceMap,
} from "../_shared/twoshot-face-map.ts";
import { detectPlateFaces, validatePlateFacesGeometry } from "../_shared/plate-face-detect.ts";
import { resolvePlateFaceIdentities, PlateIdentityFace } from "../_shared/plate-face-identity.ts";
import { evaluateV117Gate } from "../_shared/v436-plate-gate.ts";
import { buildAnchorLayoutFromV274, routePlateFacesToAnchor, type AnchorFaceLayout } from "../_shared/plateFaceSlotRouter.ts";
// FA-4 Contract E — deterministic preclip crop containment gate.
import {
  evaluateDynamicPreclipContainment,
  evaluatePreclipCropContainment,
  finalizePreclipContainment,
  isDynamicContainmentRegime,
  type CropContainmentResult,
} from "../_shared/preclip-crop-containment.ts";
import { cameraPathContainsAll } from "../_shared/pass-face-preclip.ts";
import {
  buildGeometryAuthorityTelemetry,
  resolvePreclipContainmentAuthority,
} from "../_shared/preclip-geometry-authority.ts";
// FA-4 Contract A/D — single canonical owner of the plate-face sanity limits.
import { plateFaceSanity } from "../_shared/plate-face-candidates.ts";
import { validateCast } from "../_shared/cast-validation.ts";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { withDialogLock } from "../_shared/dialog-lock.ts";
import { isFanoutClosed } from "../_shared/v459-fanout-aggregation.ts";
import {
  assertRootPatchSafe,
  buildTerminalPassPatch,
  isRunTerminal,
  mayDispatchProvider,
} from "../_shared/v510-terminal-fence.ts";
// v161 — renderPassFacePreclip re-enabled for the unified single-face
// bbox-url-pro pipeline (1..N speakers). v187 makes this fail-closed for
// multi-speaker: no full-plate fallback after a preclip timeout/failure.
import { renderPassFacePreclip } from "../_shared/pass-face-preclip.ts";
import { classifySplitScreenLayout } from "../_shared/split-screen-layout.ts";
import {
  buildDispatchFaceBox,
  faceBoxSignature,
  sanitizeMeasureSource,
} from "../_shared/plate-face-dispatch-box.ts";

import { assertSafeDispatchEntry } from "../_shared/dialogPassTransition.ts";
import { verifyFaceBeforeDispatch } from "../_shared/syncso-face-gate.ts";
// V461 A — v400 Face-Gate (hard, pre-dispatch). V461 B/C — semantic input
// fingerprint + honest dispatch telemetry.
import { evaluateV461FaceGate } from "../_shared/v461-face-gate.ts";
import {
  buildV516MouthAuthorityTelemetry,
  chooseCoherentMouthAuthority,
} from "../_shared/v516-mouth-coherence.ts";
// V469 — pre-dispatch mouth-visibility / pose-suitability gate (NOT a yaw cut).
import { evaluateV469MouthVisibility } from "../_shared/v469-mouth-visibility-gate.ts";
import {
  buildDispatchVideoTelemetry,
  computeInputFingerprint,
  evaluateNoopRedispatch,
} from "../_shared/v461-input-fingerprint.ts";
import { detectFacesMediaPipe } from "../_shared/face-detect-mediapipe.ts";
import {
  buildAsdStrategy,
  type PreflightFaceResult,
} from "../_shared/asd-strategy.ts";
// FA-4 v404 §9 — NOOP-Retry darf den Preclip nie entfernen (v148/v204).
import { shouldPreserveNoopRetryPreclip, isFrozenNoopRetryPass } from "../_shared/noop-retry-preclip.ts";
import { decideCachedPreclipDrop, recoverFrozenPreclip } from "../_shared/v450-noop-retry-geometry.ts";
// V452 — dynamic face tracking (identity static, geometry dynamic).
import {
  buildDynamicCameraPath,
  type DynamicCameraPath,
  isDynamicCameraPath,
  mouthRoiSamples,
  TRACK_SAMPLE_COUNT,
} from "../_shared/dynamic-camera-path.ts";
import {
  defaultDetectFaces,
  defaultRenderStill,
  pickAssignedFace,
  STILL_FPS,
  stillBoxToSource,
  trackAssignedFaceAcrossTurn,
} from "../_shared/plate-face-track.ts";
import {
  buildCommonFrameTelemetry,
  completeCommonFrameCohort,
  planCommonFrameCompletion,
  type FrameAttemptEvidence,
} from "../_shared/v526b-common-frame-identity.ts";
import { TRACK_SAMPLE_COUNT_MAX, trackSampleTimes } from "../_shared/dynamic-camera-path.ts";
// V526-B — the same decoder `plate-face-track` uses for still dimensions.
import jpegDecodeV526 from "npm:jpeg-js@0.4.4";
import {
  buildSceneFrameTelemetry,
  selectSceneIdentityFrames,
} from "../_shared/v526-scene-frame-authority.ts";
import {
  centerOfBox,
  resolveIdentityLockedRepair,
  resolveLockedIdentityReference,
  type IdentityReference,
  type IdentityRepairResult,
} from "../_shared/v523-identity-repair.ts";
import {
  classifyIdentityMapSpace,
  findPlateNativeRecord,
  registerPlateNativeIdentities,
  boundAttempts,
  reuseStoredRegistration,
  type PlateGeometrySpace,
  type PlateIdentityRegistration,
  type PlateNativeFence,
  type PlateNativeIdentityRecord,
  type RegistrationAttempt,
} from "../_shared/v524-plate-identity-registration.ts";
import { resolveIdentityViaRekognition } from "../_shared/resolveIdentityViaRekognition.ts";
import {
  extractPlateFrame,
  type PlateFrameExtractResult,
} from "../_shared/v525-plate-frame-extract.ts";
import {
  buildPerFrameAsdBoxes,
  evaluatePerFrameSiblingExclusion,
  validateAsdRegistration,
  type PlateTrackSample as V464TrackSample,
} from "../_shared/v464-asd-projection.ts";

// V456 Gate 2 — pose-aware mouth anchor (no colour heuristics).
import { resolveMouthAnchorPoseAware } from "../_shared/v456-roi-contract.ts";
// V477 — measured track landmark becomes the authoritative mouth anchor.
import { resolveTrackMouthAuthority } from "../_shared/v477-mouth-authority.ts";
// V502 — Coords müssen aus DEMSELBEN Crop-Transform stammen wie der Preclip.
import { resolveCoordsContract } from "../_shared/v502-coords-contract.ts";
// V513-T0 — shadow motion telemetry (observation only, zero runtime consumers).
import { computeV513MotionTelemetry } from "../_shared/v513-motion-telemetry.ts";

// FA-4 v406/v407 — Frozen Provider Input Snapshot / Retry-Wire-Parität.
import {
  buildProviderWire,
  buildProviderWireSnapshot,
  boundingBoxesJsonFromSnapshot,
  gateFrozenNoopRetry,
  isV407FreshWireContract,
  isV407NoopRetryCandidate,
  persistFrozenProviderInput,
  resolveAsdTransport,
  resolveFrozenProviderInput,
  toSyncGeneratePayload,
  type ProviderWireSnapshot,
} from "../_shared/provider-wire-snapshot.ts";

import {
  ensureDialogTurnsForScene,
  orderedSpeakerIdsFromTurns,
  readIdOnlyEnabled,
} from "../_shared/scene-dialog-turns.ts";
import { readFrozenCanonicalTurnIds } from "../_shared/canonical-turn-identity.ts";
import { rehostPlate } from "../_shared/rehostPlate.ts";






import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";
import { adoptPreAcquiredLedgerJob, bindSyncPassAttempt, readRetryContext, recordDiagnosticObservation as recordCallbackObservation, resolveLedgerDispatch, settleLedgerDispatchFailure } from "../_shared/v431-ledger.ts";
// V542 — 2-Sprecher Golden-Core Preclip Recovery (Zulässigkeit + Telemetrie).
import {
  buildV542RecoveryDetails,
  evaluateV542Recovery,
  V542_RECOVERY_VERDICT,
} from "../_shared/v542-static-golden-core-recovery.ts";

import { evaluateTurnPassBinding, isStabilizerPass, type TurnPassCandidate } from "../_shared/fa4-turn-pass-guard.ts";
import {
  buildImmutableArtifactKey,
  pinImmutableArtifact,
  resolveArtifactAttempt,
} from "../_shared/v434-immutable-artifact.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYNC_API_BASE = "https://api.sync.so/v2";
// v131.5 — Version pin. Stamped into every syncso_dispatch_log.meta so
// we can prove which build dispatched any given pass in <5s of SQL.
// Bump on any dispatch-path change so production failures are
// trivially attributable to a specific deploy.
const COMPOSE_DIALOG_SEGMENTS_VERSION = "v408-fa4-predeploy-final";

// v249 — Slice A: surface v247 mouth-anchor preclip metrics as top-level columns
// on `syncso_dispatch_log` so v248-Slice-4 ladder in `report-lipsync-motion-probe`
// can escalate on the actual face-share signal instead of guessing.
// Contract:
//   detector_used ∈ { "mouth-centered" | "face-fallback" | "plate-fallback" }
//     • mouth-centered → pass-face-preclip found AWS Rekognition mouth landmarks
//     • face-fallback  → face bbox only (no mouth landmark, or face-gate probe
//                        server-disabled — the current default per Slice-B audit)
//     • plate-fallback → preclip skipped, full-plate dispatch (multi-speaker
//                        would have been fail-closed here; single-speaker only)
function preclipMetricsForPass(
  pass: Record<string, unknown> | null | undefined,
  attempt: number,
  usePassPreclip: boolean,
): {
  face_share_in_preclip: number | null;
  mouth_center_offset_px: number | null;
  detector_used: string | null;
  retry_count: number;
} {
  const p = (pass ?? {}) as Record<string, unknown>;
  const rawShare = (p as any).preclip_face_share;
  const rawOffset = (p as any).preclip_mouth_offset_px;
  const rawAnchor = (p as any).preclip_anchor;
  const anchor = typeof rawAnchor === "string" && rawAnchor.length > 0 ? rawAnchor : null;
  const detector = usePassPreclip
    ? (anchor === "mouth-centered" ? "mouth-centered" : "face-fallback")
    : "plate-fallback";
  return {
    face_share_in_preclip: Number.isFinite(Number(rawShare)) ? Number(rawShare) : null,
    mouth_center_offset_px: Number.isFinite(Number(rawOffset)) ? Number(rawOffset) : null,
    detector_used: detector,
    retry_count: Number.isFinite(Number(attempt)) ? Number(attempt) : 0,
  };
}

// v153.8 — Sync.so spec (https://sync.so/docs/developer-guides/speaker-selection)
// requires the `bounding_boxes` array length to MATCH the actual video frame
// count. We were sending `Math.ceil(totalSec * 24)` where `totalSec` was the
// *requested* Hailuo duration (9s) — but Hailuo routinely returns 10.0–10.5s,
// so the JSON had ~216 entries against a 243-frame plate → provider rejected
// every pass with the opaque `generation_unknown_error`.
//
// Fix: probe the rehosted MP4 once per plate URL (cached by URL) by parsing
// the `mvhd` box for `duration / timescale`, then derive frameCount from the
// actual duration. Fallback to the legacy `totalSec * 24` if the probe fails.
const __plateMetaCache = new Map<string, { durationSec: number | null }>();
async function probePlateDurationSec(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const findBox = (start: number, end: number, name: string): { start: number; end: number } | null => {
      let p = start;
      while (p + 8 <= end) {
        const size = dv.getUint32(p);
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
        const boxEnd = size === 0 ? end : p + size;
        if (type === name) return { start: p + 8, end: boxEnd };
        if (size < 8) break;
        p = boxEnd;
      }
      return null;
    };
    const moov = findBox(0, buf.length, "moov");
    if (!moov) return null;
    const mvhd = findBox(moov.start, moov.end, "mvhd");
    if (!mvhd) return null;
    const version = buf[mvhd.start];
    let timescale: number, duration: number;
    if (version === 1) {
      // version(1) + flags(3) + creation(8) + mod(8) + timescale(4) + duration(8)
      timescale = dv.getUint32(mvhd.start + 4 + 8 + 8);
      const high = dv.getUint32(mvhd.start + 4 + 8 + 8 + 4);
      const low = dv.getUint32(mvhd.start + 4 + 8 + 8 + 8);
      duration = high * 2 ** 32 + low;
    } else {
      // version(1) + flags(3) + creation(4) + mod(4) + timescale(4) + duration(4)
      timescale = dv.getUint32(mvhd.start + 4 + 4 + 4);
      duration = dv.getUint32(mvhd.start + 4 + 4 + 4 + 4);
    }
    if (!timescale) return null;
    return duration / timescale;
  } catch {
    return null;
  }
}
async function getPlateDurationSecCached(url: string): Promise<number | null> {
  if (__plateMetaCache.has(url)) return __plateMetaCache.get(url)!.durationSec;
  const durationSec = await probePlateDurationSec(url);
  __plateMetaCache.set(url, { durationSec });
  return durationSec;
}

// ── V543-2 — GEMESSENE VIDEO-ZEITBASIS (statt ASSUMED_FPS = 24) ──────────
// Der Full-Shot-Pfad schickt das GANZE Plate-Video. Sync.so verlangt, dass
// das `bounding_boxes`-Array exakt so viele Einträge hat wie das Video
// Frames. Bisher wurde die Framezahl aus `ceil(Dauer × 24)` geschätzt —
// weicht die echte Plate-FPS ab, ist die Länge falsch und der Provider
// antwortet `generation_input_face_selection_invalid`.
//
// Diese Probe liest die WAHRE Framezahl aus der Video-Spur:
//   moov → trak(hdlr=vide) → mdia/mdhd (timescale, duration)
//                          → mdia/minf/stbl/stts (Summe sample_count)
// Kein Treffer ⇒ `null` ⇒ Full-Shot ist für diesen Pass nicht zulässig.
export interface PlateVideoMeta {
  durationSec: number;
  fps: number;
  frameCount: number;
}
const __plateVideoMetaCache = new Map<string, PlateVideoMeta | null>();

function probeVideoMetaFromMp4(buf: Uint8Array): PlateVideoMeta | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const children = (start: number, end: number): Array<{ type: string; start: number; end: number }> => {
    const out: Array<{ type: string; start: number; end: number }> = [];
    let p = start;
    while (p + 8 <= end) {
      const size = dv.getUint32(p);
      const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
      const boxEnd = size === 0 ? end : p + size;
      if (size < 8 || boxEnd > end) break;
      out.push({ type, start: p + 8, end: boxEnd });
      p = boxEnd;
    }
    return out;
  };
  const child = (start: number, end: number, name: string) =>
    children(start, end).find((b) => b.type === name) ?? null;

  const moov = child(0, buf.length, "moov");
  if (!moov) return null;
  for (const trak of children(moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(trak.start, trak.end, "mdia");
    if (!mdia) continue;
    const hdlr = child(mdia.start, mdia.end, "hdlr");
    if (!hdlr) continue;
    const handler = String.fromCharCode(
      buf[hdlr.start + 8],
      buf[hdlr.start + 9],
      buf[hdlr.start + 10],
      buf[hdlr.start + 11],
    );
    if (handler !== "vide") continue;

    const mdhd = child(mdia.start, mdia.end, "mdhd");
    if (!mdhd) continue;
    const version = buf[mdhd.start];
    let timescale: number;
    let duration: number;
    if (version === 1) {
      timescale = dv.getUint32(mdhd.start + 4 + 8 + 8);
      const high = dv.getUint32(mdhd.start + 4 + 8 + 8 + 4);
      const low = dv.getUint32(mdhd.start + 4 + 8 + 8 + 8);
      duration = high * 2 ** 32 + low;
    } else {
      timescale = dv.getUint32(mdhd.start + 4 + 4 + 4);
      duration = dv.getUint32(mdhd.start + 4 + 4 + 4 + 4);
    }
    if (!timescale || !duration) continue;
    const durationSec = duration / timescale;

    const minf = child(mdia.start, mdia.end, "minf");
    const stbl = minf ? child(minf.start, minf.end, "stbl") : null;
    const stts = stbl ? child(stbl.start, stbl.end, "stts") : null;
    if (!stts) continue;
    const entryCount = dv.getUint32(stts.start + 4);
    let frameCount = 0;
    for (let i = 0; i < entryCount; i++) {
      const off = stts.start + 8 + i * 8;
      if (off + 8 > stts.end) return null;
      frameCount += dv.getUint32(off);
    }
    if (!(frameCount > 0) || !(durationSec > 0)) continue;
    const fps = frameCount / durationSec;
    if (!Number.isFinite(fps) || fps <= 0 || fps > 240) continue;
    return {
      durationSec: Number(durationSec.toFixed(4)),
      fps: Number(fps.toFixed(4)),
      frameCount,
    };
  }
  return null;
}

async function getPlateVideoMetaCached(url: string): Promise<PlateVideoMeta | null> {
  if (__plateVideoMetaCache.has(url)) return __plateVideoMetaCache.get(url)!;
  let meta: PlateVideoMeta | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      meta = probeVideoMetaFromMp4(new Uint8Array(await res.arrayBuffer()));
    }
  } catch {
    meta = null;
  }
  __plateVideoMetaCache.set(url, meta);
  return meta;
}

// v139.2 — Module-load boot marker. Proves which build is actually running
// inside Edge Runtime (vs a stale cached copy). Look for this exact string
// in logs immediately after any deploy to confirm the new code is live.
console.log(
  `[compose-dialog-segments] BOOT version=${COMPOSE_DIALOG_SEGMENTS_VERSION} deploy_marker=${Date.now()} pid=${(globalThis as any).Deno?.pid ?? "?"}`,
);
const LIPSYNC_MODEL = "lipsync-2-pro";
const LIPSYNC_FALLBACK_MODEL = "lipsync-2";
// v37 — `sync3-coords` added as the Sync.so-recommended fallback for
// difficult / static / occluded / multi-speaker plates per
// https://sync.so/docs/models/lipsync (sync-3 has built-in obstruction
// detection and can open closed lips, which lipsync-2-pro cannot).
// Order is intentional: try lipsync-2-pro first (better fidelity when it
// works), then sync-3 BEFORE the auto-* face-swap-risk variants.
const SYNC3_MODEL = "sync-3";
// v82 (Phase 2.1) — `bbox-url-pro` is the new PRIMARY for multi-speaker
// dialog when plate-identity is resolved. Uploads a per-frame
// `bounding_boxes` JSON to the `composer-frames` bucket and points
// Sync.so at it via `active_speaker_detection.bounding_boxes_url`.
// Deterministic per-speaker targeting → no more "Lipsync hat keinen
// Avatar getroffen". Falls through the existing ladder on failure.
// v84 (Phase 2.3): unified ladder — `coords-pro-lp2pro` now sits between
// `sync3-coords` and `auto-pro`, matching `V5_RETRY_VARIANTS` in
// sync-so-webhook. Single source of truth for valid variants accepted on
// fresh dispatch (`pass.retry_variant`).
const RETRY_VARIANTS = ["bbox-url-pro", "coords-pro", "coords-pro-box", "sync3-coords", "coords-pro-lp2pro", "auto-pro", "auto-standard"] as const;
type RetryVariant = typeof RETRY_VARIANTS[number];

/**
 * v124 — Sync-3 doc-strict whitelist sanitizer + ASD mutex.
 *
 * Per https://sync.so/docs/models/sync-3 the ONLY accepted `options` keys
 * for `model: "sync-3"` are `sync_mode` and `active_speaker_detection`.
 * `temperature`, `reasoning_enabled`, `occlusion_detection_enabled` are
 * explicitly NOT applicable and reproducibly trigger `provider_unknown_error`
 * on the provider job (validator returns 201, then the job dies).
 *
 * Per https://sync.so/docs/developer-guides/speaker-selection the ASD DTO
 * has three mutually exclusive shapes:
 *   (a) `{ auto_detect: true }` — video only
 *   (b) `{ auto_detect: false, frame_number, coordinates }`
 *   (c) `{ auto_detect: false, bounding_boxes }` OR `{ ..., bounding_boxes_url }`
 *       — when boxes are provided, `frame_number`/`coordinates` are dropped.
 *
 * Logs `v124_sync3_sanitize` with the stripped keys so any future doc-drift
 * is visible at dispatch time.
 */
function sanitizeSync3Options(
  model: string,
  options: Record<string, unknown>,
  ctx: { scene: string; pass: number; speaker: string },
): { options: Record<string, unknown>; strippedOpts: string[]; strippedAsd: string[] } {
  const strippedOpts: string[] = [];
  const strippedAsd: string[] = [];
  if (model !== SYNC3_MODEL) {
    return { options, strippedOpts, strippedAsd };
  }
  const allowedTop = new Set(["sync_mode", "active_speaker_detection"]);
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    if (allowedTop.has(k)) {
      cleaned[k] = v;
    } else {
      strippedOpts.push(k);
    }
  }
  const asd: any = cleaned.active_speaker_detection;
  if (asd && typeof asd === "object") {
    const hasBoxes =
      Array.isArray(asd.bounding_boxes) ||
      typeof asd.bounding_boxes_url === "string";
    if (hasBoxes) {
      if ("frame_number" in asd) { delete asd.frame_number; strippedAsd.push("frame_number"); }
      if ("coordinates" in asd) { delete asd.coordinates; strippedAsd.push("coordinates"); }
    }
    if (asd.auto_detect === true) {
      // auto_detect must be alone — no coordinates/boxes
      if ("frame_number" in asd) { delete asd.frame_number; strippedAsd.push("frame_number_with_auto_detect"); }
      if ("coordinates" in asd) { delete asd.coordinates; strippedAsd.push("coordinates_with_auto_detect"); }
      if ("bounding_boxes" in asd) { delete asd.bounding_boxes; strippedAsd.push("bounding_boxes_with_auto_detect"); }
      if ("bounding_boxes_url" in asd) { delete asd.bounding_boxes_url; strippedAsd.push("bounding_boxes_url_with_auto_detect"); }
    }
    // unknown ASD keys
    const allowedAsd = new Set([
      "auto_detect", "v3", "frame_number", "coordinates",
      "bounding_boxes", "bounding_boxes_url",
    ]);
    for (const k of Object.keys(asd)) {
      if (!allowedAsd.has(k)) {
        strippedAsd.push(k);
        delete asd[k];
      }
    }
  }
  if (strippedOpts.length > 0 || strippedAsd.length > 0) {
    console.log(
      `[compose-dialog-segments] scene=${ctx.scene} pass=${ctx.pass} speaker=${ctx.speaker} v124_sync3_sanitize stripped_opts=${JSON.stringify(strippedOpts)} stripped_asd=${JSON.stringify(strippedAsd)}`,
    );
  }
  return { options: cleaned, strippedOpts, strippedAsd };
}

/**
 * v124 — Build per-frame `bounding_boxes` array honoring the speaker's
 * voiced windows. Frames inside any voiced window get the speaker's plate
 * box; frames outside get `null`. Per Sync.so docs (Speaker Selection,
 * "null where no box is present"), this prevents sync-3 from animating
 * neighbour faces during turns the speaker is silent — the root cause
 * of "pixelated overlay on other speakers' mouths" in multi-speaker scenes.
 */
function buildPerFrameBoxes(params: {
  box: [number, number, number, number];
  frameCount: number;
  fps: number;
  voicedWindowsSec: Array<[number, number]>;
  padFrames?: number; // small padding to be safe at boundaries
}): Array<[number, number, number, number] | null> {
  const pad = Math.max(0, Math.floor(params.padFrames ?? 2));
  const windows = (params.voicedWindowsSec ?? [])
    .map(([s, e]) => {
      const fs = Math.max(0, Math.floor(s * params.fps) - pad);
      const fe = Math.min(params.frameCount - 1, Math.ceil(e * params.fps) + pad);
      return [fs, fe] as [number, number];
    })
    .filter(([fs, fe]) => Number.isFinite(fs) && Number.isFinite(fe) && fe >= fs);
  const out: Array<[number, number, number, number] | null> =
    new Array(Math.max(1, params.frameCount)).fill(null);
  if (windows.length === 0) {
    // No voiced windows known → preserve legacy behaviour (full-fill) so
    // we don't accidentally produce an all-null array that would silently
    // disable lip-sync entirely.
    return out.map(() => params.box);
  }
  for (const [fs, fe] of windows) {
    for (let i = fs; i <= fe; i++) out[i] = params.box;
  }
  // v201 — strict turn-scoped boxes. Older builds backfilled leading/trailing
  // silence with the target box to satisfy Sync.so's validator, but that let
  // the provider reproject inactive faces outside the spoken turn. Keep every
  // frame outside the voiced windows null; preclips shift most speaker windows
  // to t=0 so this remains provider-safe while eliminating morph bleed.
  return out;
}

/**
 * v82 — Uploads a Sync.so-compliant per-frame bounding_boxes JSON to the
 * `composer-frames` bucket and returns its public URL. Schema:
 *   { bounding_boxes: ([x1,y1,x2,y2] | null)[] }   // length === frame count
 * Per https://sync.so/docs/developer-guides/speaker-selection — preferred
 * over inline `bounding_boxes` for long / multi-speaker videos (no payload
 * size limit, no provider-side rejections).
 */
async function uploadBoundingBoxesJson(
  supabase: any,
  params: {
    userId: string;
    projectId: string;
    sceneId: string;
    passIdx: number;
    box: [number, number, number, number];
    frameCount: number;
    // FA-4 v406 — wenn gesetzt, wird EXAKT dieses (bereits eingefrorene)
    // Array hochgeladen. Kein zweiter Build ⇒ URL-JSON und Retry-Inline sind
    // per Konstruktion identisch.
    boxes?: ([number, number, number, number] | null)[];
    // v124 — when provided, build per-frame array with `null` outside the
    // speaker's voiced windows. Sync.so requires this to avoid animating
    // neighbour faces during turns this speaker is silent.
    voicedWindowsSec?: Array<[number, number]>;
    fps?: number;
  },
): Promise<{ url: string | null; nonNullFrames: number; totalFrames: number }> {
  try {
    const sub = params.projectId || "shared";
    const ts = Date.now();
    const path = `${params.userId}/${sub}/asd/${params.sceneId}-p${params.passIdx + 1}-${ts}.json`;
    const totalFrames = Math.max(1, params.frameCount);
    const boxes = params.boxes
      ? params.boxes
      : params.voicedWindowsSec && params.voicedWindowsSec.length > 0 && params.fps
      ? buildPerFrameBoxes({
          box: params.box,
          frameCount: totalFrames,
          fps: params.fps,
          voicedWindowsSec: params.voicedWindowsSec,
        })
      : new Array(totalFrames).fill(params.box);
    const nonNullFrames = boxes.reduce((acc, v) => acc + (v ? 1 : 0), 0);
    const payload = { bounding_boxes: boxes };
    // v279 — Uint8Array instead of Blob: supabase-js 2.75 in Deno silently
    // rejects Blob payloads on some builds → upload "succeeds" but public URL
    // is unreachable. Bytes path is deterministic + faster.
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const { data: upData, error: upErr } = await supabase.storage
      .from("composer-frames")
      .upload(path, bytes, {
        contentType: "application/json",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) {
      console.warn(`[compose-dialog-segments] v279 bbox-url upload failed path=${path} bytes=${bytes.byteLength} err=${upErr.message}`);
      return { url: null, nonNullFrames, totalFrames };
    }
    const { data: pub } = supabase.storage.from("composer-frames").getPublicUrl(path);
    const url = pub?.publicUrl ?? null;
    console.log(`[compose-dialog-segments] v279 bbox-url uploaded path=${path} bytes=${bytes.byteLength} frames=${totalFrames} voiced=${nonNullFrames} url=${url ? "…" + url.slice(-60) : "null"} upData=${upData ? "ok" : "empty"}`);
    return { url, nonNullFrames, totalFrames };
  } catch (e) {
    console.warn(`[compose-dialog-segments] v279 bbox-url upload threw: ${(e as Error).message}`);
    return { url: null, nonNullFrames: 0, totalFrames: Math.max(1, params.frameCount) };
  }
}


// Pricing: Sync.so lipsync-2-pro = 16 credits/s (raised from 9, 3.5× margin cap
// on ~€0.046/s raw cost). ONE pass over the full clip (regardless of speaker
// count), so cost = ceil(totalSec) * 16 (min 16). Mirrors frontend estimate
// in src/lib/composer/estimateSceneRenderCost.ts.
const LIPSYNC_CREDITS_PER_SEC = 16;
const LIPSYNC_MIN_CREDITS = 16;
const MIN_TURN_DUR_SEC = 0.4;

const computeCost = (durSec: number) =>
  Math.max(LIPSYNC_MIN_CREDITS, Math.ceil(Math.max(0, durSec)) * LIPSYNC_CREDITS_PER_SEC);

const isRetryVariant = (value: unknown): value is RetryVariant =>
  typeof value === "string" && (RETRY_VARIANTS as readonly string[]).includes(value);

const clampSyncCoords = (coords: [number, number] | null | undefined): [number, number] | null => {
  if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  const [x, y] = coords;
  if (x <= 1 && y <= 1) return [Math.round(x * 1280), Math.round(y * 720)];
  return [Math.max(1, Math.round(x)), Math.max(1, Math.round(y))];
};

type CanonicalAsd =
  | { auto_detect: true }
  | { auto_detect: false; frame_number: number; coordinates: [number, number] }
  | { auto_detect: false; bounding_boxes_url: string }
  | { auto_detect: false; bounding_boxes: ([number, number, number, number] | null)[] };

function normalizeCanonicalAsd(input: unknown): CanonicalAsd {
  const asd = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof asd.bounding_boxes_url === "string" && asd.bounding_boxes_url.trim()) {
    return { auto_detect: false, bounding_boxes_url: asd.bounding_boxes_url };
  }
  if (Array.isArray(asd.bounding_boxes) && asd.bounding_boxes.length > 0) {
    return { auto_detect: false, bounding_boxes: asd.bounding_boxes as ([number, number, number, number] | null)[] };
  }
  if (asd.auto_detect === false) {
    const raw = Array.isArray(asd.coordinates) && Array.isArray(asd.coordinates[0])
      ? (asd.coordinates[0] as unknown[])
      : Array.isArray(asd.coordinates)
        ? asd.coordinates
        : [];
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`canonical_asd_missing_coordinates:${JSON.stringify(asd.coordinates ?? null)}`);
    }
    const frame = Number.isFinite(Number(asd.frame_number)) ? Math.max(0, Math.round(Number(asd.frame_number))) : 0;
    return { auto_detect: false, frame_number: frame, coordinates: [Math.round(x), Math.round(y)] };
  }
  return { auto_detect: true };
}

/**
 * v71 — transient fetch errors (Supabase Storage hiccup, edge-runtime
 * AbortSignal timeout) used to be misclassified as "audio is invalid" and
 * burned the entire scene. We classify these explicitly so the caller can
 * retry the dispatch later instead of marking the run failed + refunding
 * + wiping the already-successful Sync.so passes that came before.
 */
const TRANSIENT_FETCH_ERROR_RE =
  /signal timed out|timeoutexception|aborterror|the operation was aborted|network|fetch failed|connection (reset|refused|closed)|econnreset|etimedout|eai_again|http_5\d\d/i;
function isTransientFetchError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err ?? "");
  return TRANSIENT_FETCH_ERROR_RE.test(msg);
}

async function inspectSpeakerAudio(url: string) {
  // v71 — single-attempt fetch with longer timeout (60s) so transient
  // storage lag doesn't get reported as "audio invalid". Retries are now
  // owned by the audio-preflight caller, which can treat repeated transient
  // failures as "retry later" instead of a hard refund/wipe.
  const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!resp.ok) throw new Error(`audio_get_${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const wav = inspectWav(bytes);
  const vad = detectVoicedFrames(bytes);
  return { bytes: bytes.byteLength, wav, vad };
}

async function inspectSpeakerAudioWithRetry(url: string, attempts = 3) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await inspectSpeakerAudio(url);
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err)) throw err;
      // small backoff: 250ms, 750ms
      await new Promise((r) => setTimeout(r, 250 * (i + 1) * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "audio_fetch_failed"));
}

interface Turn { startSec: number; endSec: number; turnId?: string | null }
interface TwoshotSpeaker {
  speaker?: string;
  character_id?: string | null;
  track_url?: string;
  voicedRange?: { turns?: Turn[]; startSec?: number; endSec?: number };
}

interface SegmentItem {
  startTime: number;
  endTime: number;
  speakerIdx: number;
  speakerName: string;
  refId: string;
  /** FA-4/P0 — kanonische `dialog_turns[].id` dieses Turn-Fensters. */
  turnId?: string | null;
}

interface PassState {
  idx: number;
  speaker_idx: number;
  character_id: string | null;
  speaker_name: string;
  /** FA-4/P0 — kanonische Ledger-Segmentidentität (`sync_segment.segment_id`).
   *  Aktive Passes: `dialog_turns[].id`. Stabilizer: deterministische UUID
   *  aus (scene, run, listener). NIEMALS null beim Dispatch. */
  segment_id: string | null;

  audio_url: string;
  coords: [number, number] | null;
  segments: SegmentItem[];
  input_url: string;
  job_id?: string;
  diagnostic_id?: string;
  retry_variant?: RetryVariant;
  reference_frame_number?: number;
  face_repair?: Record<string, unknown>;
  output_url?: string;
  status: "pending" | "rendering_preflight" | "rendering" | "done" | "failed";
  started_at?: string;
  finished_at?: string;
  error?: string;
  // v68 — single-face preclip cache (3+ speaker path). When set, dispatch
  // to Sync.so uses preclip_url as input with auto_detect:true; audio-mux
  // overlays the lipsynced crop back at preclip_crop on the master plate.
  preclip_url?: string;
  preclip_render_id?: string;
  preclip_crop?: { x: number; y: number; size: number; outputSize: number };
  probe_frame_url?: string;
  coords_snapped_at?: string;
  coords_snap_origin?: [number, number] | null;
  preclip_error?: string;
  audio_url_full?: string;
  audio_tight?: { url: string; dur_sec: number; windows_secs: Array<[number, number]>; output_offsets_sec?: number[] };
}

// FA-4/P0 — `isStabilizerPass` / `evaluateTurnPassBinding` leben in
// `_shared/fa4-turn-pass-guard.ts` (siehe Import oben).



interface SegmentsState {
  version: 5;
  engine: "sync-segments";
  status: "queued" | "rendering" | "done" | "failed" | "retrying";
  // Multi-pass per-speaker chain (added May 2026 to fix character swap).
  // Optional for back-compat with in-flight single-pass rows.
  multi_pass?: boolean;
  passes?: PassState[];
  current_pass?: number;
  total_passes?: number;
  sync_job_id?: string;
  source_clip_url: string;
  total_sec: number;
  segments: SegmentItem[];
  cost_credits: number;
  refunded: boolean;
  started_at: string;
  first_started_at?: string;
  retry_count?: number;
  retry_variant?: RetryVariant;
  fallback_history?: Array<Record<string, unknown>>;
  last_diagnostic_id?: string;
  last_error?: string;
  last_error_class?: string;
  finished_at?: string;
  final_url?: string | null;
  error?: string;
  plate_identity?: {
    version: "v153.2" | "v160" | "v242";
    dims: { width: number; height: number } | null;
    bboxes: Array<[number, number, number, number] | null>;
    faces?: unknown[];
    mouths?: Array<[number, number] | null>;
    resolvedCount?: number;
    cached?: boolean;
    sourceClipUrl?: string | null;
    hydratedAt?: string;
    /**
     * v242 — Character Assignment Lock.
     * Persisted map speakerIdx (string) → characterId (stripped) written
     * once a plate-identity run resolved every speaker with match
     * confidence ≥ threshold. Subsequent renders read this lock BEFORE
     * consulting positional bboxes, guaranteeing the same speaker → face
     * assignment across every rerender.
     */
    assignmentLock?: Record<string, string>;
  };
}

/**
 * V524 — the same character-id normalisation the identity helpers use,
 * available at module scope for the registration block. (Two older local
 * copies still live inside the handler; they belong to the persisted-
 * hydration and assignment-lock paths and are reported, not refactored.)
 */
function stripIdPrefixLocalV524(id?: string | null): string {
  return String(id ?? "").toLowerCase().replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
}

function uniqueSortedFrames(frames: number[]): number[] {
  return Array.from(new Set(frames.filter((n) => Number.isFinite(n)).map((n) => Math.max(0, Math.round(n))))).sort((a, b) => a - b);
}

function frameCandidatesForTurn(turn: SegmentItem, totalSec: number, fps: number): number[] {
  const start = Math.max(0, Number(turn.startTime) || 0);
  const end = Math.min(Math.max(start + MIN_TURN_DUR_SEC, Number(turn.endTime) || start), Math.max(totalSec, start + MIN_TURN_DUR_SEC));
  const points = [
    start + Math.min(0.35, Math.max(0.08, (end - start) * 0.2)),
    (start + end) / 2,
    Math.max(start, end - Math.min(0.35, Math.max(0.08, (end - start) * 0.2))),
    Math.max(0, (start + end) / 2 - 1),
    Math.min(totalSec, (start + end) / 2 + 1),
  ];
  return uniqueSortedFrames(points.map((sec) => sec * fps));
}


serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "video" });
  }

  // v33: strict per-scene single-flight lock. Released in `finally` below so
  // every return path (including early 202s, 422s, and thrown errors) frees it.
  let lockSupabase: any = null;
  let lockSceneId: string | null = null;
  let lockHolder: string | null = null;
  let lockPassIdx: number = 0; // v168 Phase 2 — per-pass-lock partition key (0 when flag OFF)
  // v100 — crash-safe envelope: keep sceneId/userId/syncApiKey reachable from
  // the outer catch so an uncaught throw before/after dispatch can immediately
  // mark the scene `failed` (with refund) instead of leaving it `pending` until
  // lipsync-watchdog wakes 4 min later and calls failLipSync("preflight_aborted").
  let crashSceneId: string | null = null;
  let crashUserId: string | null = null;
  let crashSupabase: any = null;
  let crashSyncApiKey: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const syncApiKey = getSyncApiKey();
    if (!syncApiKey) {
      return json(
        {
          error: "missing_sync_api_key",
          checked: ["SYNC_API_KEY", "SYNC_SO_API_KEY", "SYNCSO_API_KEY"],
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sceneId = body?.scene_id;
    const isRetry = body?.retry === true;
    const requestedRetryVariant = isRetryVariant(body?.retry_variant) ? body.retry_variant : null;
    // Set by sync-so-webhook when the official error_code maps to
    // `retry_with_repair` (generation_input_audio_invalid / metadata_missing).
    // Surfaced in dispatch logs + downstream so an upcoming WAV-repair pass
    // (ffmpeg re-encode) can hook in without another routing change.
    const repairAudio = body?.repair_audio === true;
    // `advance: true` is sent by the webhook to chain to the next pass after
    // a successful pass completion. Skips wallet debit + face-gate (already
    // validated on pass 0) and dispatches passes[current_pass].
    const isAdvance = body?.advance === true;
    // v41 — single-call official Sync.so segments retry path (no re-charge,
    // bypasses v5 fan-out, re-dispatches the canonical segments[] payload).
    const isV41Retry = body?.retry_v41 === true;
    // v56 — retry without manual ASD (drop optionsOverride.active_speaker_detection)
    // so Sync.so picks the active speaker automatically per segment. Triggered
    // by sync-so-webhook when the v56 manual-point dispatch returns the opaque
    // "An unknown error occurred." (often caused by anchor-derived coords that
    // sit off-face on the actual Hailuo plate).
    const retryNoAsd = body?.retry_no_asd === true;
    // v58 — Multi-speaker fallback. Set by sync-so-webhook after a v56
    // single-call segments dispatch fails with the opaque
    // `provider_unknown_error` on a multi-speaker (≥3) scene. Forces this
    // dispatcher to skip the v56 segments[] path and use the proven v5
    // per-speaker chained-pass pipeline (each pass = ONE Sync.so call with
    // single-coord ASD, output of pass N feeds pass N+1) — the only payload
    // shape that Sync.so accepts reliably for multi-speaker plates.
    const forceMultipass = body?.force_multipass === true;
    if (!sceneId || typeof sceneId !== "string") {
      return json({ error: "scene_id_required" }, 400);
    }
    if (repairAudio) {
      console.log(`[compose-dialog-segments] scene=${sceneId} repair_audio=true (audio re-encode requested by webhook)`);
    }
    if (isV41Retry) {
      console.log(`[compose-dialog-segments] scene=${sceneId} v41_retry=true (single-call segments re-dispatch, no_asd=${retryNoAsd})`);
    }

    // ── v33: strict single-flight lock ───────────────────────────────────
    // Without this the client + sync-so-webhook + fan-out self-invoke can all
    // fire compose-dialog-segments for the same scene within ~ms, producing
    // duplicate Sync.so jobs that never match the latest passes[] state and
    // burn provider credits. `withDialogLock` falls back to "no lock" on
    // contention which is exactly what we must avoid here.
    //
    // v168 Phase 2 — Per-Pass-Lock. When FEATURE_PER_PASS_LOCK=true, the lock
    // is partitioned by (scene_id, pass_idx) so up to N parallel passes for
    // the same scene can each dispatch concurrently. When OFF, pass_idx
    // defaults to 0 → exact legacy single-flight-per-scene semantics.
    // Initial dispatch from the client has no body.pass_idx → 0.
    // Self-invoke / webhook advance calls carry pass_idx in body.
    {
      // v192 — Default flipped ON. Per-pass lock avoids scene-wide advance-webhook
      // collisions when two Sync.so passes finish nearly simultaneously. Set the
      // env var to "false" explicitly for emergency rollback to legacy scene-lock.
      const perPassLockEnabled = (Deno.env.get("FEATURE_PER_PASS_LOCK") ?? "true")
        .toLowerCase() === "true";
      const bodyPassIdx = Number(body?.pass_idx);
      const earlyPassIdx = perPassLockEnabled && Number.isFinite(bodyPassIdx) && bodyPassIdx >= 0
        ? Math.floor(bodyPassIdx)
        : 0;
      const holder = `compose-dialog-segments-${crypto.randomUUID()}`;
      const { data: acquired, error: lockErr } = await supabase.rpc(
        "try_acquire_dialog_lock",
        // v193 — preclip + provider preflight can legitimately exceed the old
        // 120s TTL. When it expired mid-flight, a webhook advance could acquire
        // the same pass lock and dispatch a duplicate Sync.so job. Keep stale
        // recovery possible, but long enough for one pass preflight.
        { _scene_id: sceneId, _holder: holder, _ttl_seconds: 420, _pass_idx: earlyPassIdx },
      );
      if (lockErr) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${earlyPassIdx} lock rpc error: ${lockErr.message} — proceeding without lock`);
      } else if (acquired !== true) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${earlyPassIdx} BUSY — another dispatcher holds the (scene,pass) lock; skipping`);
        return json({ ok: true, status: "scene_lock_busy", scene_id: sceneId, pass_idx: earlyPassIdx }, 202);
      } else {
        lockSupabase = supabase;
        lockSceneId = sceneId;
        lockHolder = holder;
        lockPassIdx = earlyPassIdx;
        if (perPassLockEnabled) {
          console.log(`[compose-dialog-segments] scene=${sceneId} v168_per_pass_lock ACQUIRED pass=${earlyPassIdx}`);
        }
      }
    }



    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, audio_plan, dialog_script, dialog_turns, character_shots, dialog_shots, clip_url, lip_sync_source_clip_url, lip_sync_applied_at, lip_sync_status, reference_image_url, lock_reference_url, scene_assets, active_run_id, plate_generation",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: "scene_not_found", details: sceneErr?.message }, 404);
    }

    // v431 G2.1 — Run-Snapshot des Dispatch. Wird beim Anlegen eines Pass-Slots
    // EINMALIG eingefroren; `update_dialog_pass_slot` ueberschreibt die beiden
    // Keys danach nie wieder (DB-Contract).
    const passRunStamp: Record<string, unknown> = {
      run_id: (scene as any).active_run_id ?? null,
      plate_generation: Number((scene as any).plate_generation ?? 0),
    };

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "missing_user" }, 403);

    if (
      (scene as any).lip_sync_status === "canceled" ||
      (scene as any).dialog_shots?.status === "canceled"
    ) {
      return json({ ok: true, skipped: "canceled", scene_id: sceneId });
    }

    // v100 — register sceneId/userId/supabase/syncApiKey for the crash-safe
    // outer catch (line ~3107). From this point on, any uncaught throw will
    // mark the scene `failed` + refund immediately so the user does not have
    // to wait for lipsync-watchdog.
    crashSceneId = sceneId;
    crashUserId = userId;
    crashSupabase = supabase;
    crashSyncApiKey = syncApiKey || null;

    // ── Plan v72 — Dispatch-attempt breadcrumb ───────────────────────────
    // Emit a lightweight DISPATCH_ATTEMPT_STARTED log right after lock + scene
    // load. Lets the watchdog and ops queries distinguish three states:
    //   1) no row at all                → dispatcher was never reached
    //   2) DISPATCH_ATTEMPT_STARTED only → reached but preflight blocked/crashed
    //   3) DISPATCHED                    → Sync.so was actually called
    // Best-effort; failures are logged but don't block the run.
    try {
      const entryTurnIdx = typeof body?.pass_idx === "number" && Number.isFinite(body.pass_idx)
        ? Number(body.pass_idx)
        : null;
      await logSyncDispatch(supabase, {
        scene_id: sceneId,
        user_id: userId,
        engine: "sync-segments",
        // v134 §3 — turn_idx populated whenever the caller knows which pass.
        turn_idx: entryTurnIdx,
        sync_status: "DISPATCH_ATTEMPT_STARTED",
        meta: {
          is_retry: isRetry,
          is_advance: isAdvance,
          is_v41_retry: isV41Retry,
          recovery: body?.recovery === true,
          auto: body?.auto === true,
          repair_audio: repairAudio,
          stage_at_entry: (scene as any).twoshot_stage ?? null,
          lip_sync_status_at_entry: (scene as any).lip_sync_status ?? null,
          existing_state_version: (scene as any).dialog_shots?.version ?? null,
          existing_state_status: (scene as any).dialog_shots?.status ?? null,
          // v134 §3 — Forensik-friendly noop tracking
          noop_auto_escalation: body?.noop_auto_escalation === true,
          noop_escalation_step: typeof body?.noop_escalation_step === "number" ? body.noop_escalation_step : null,
          requested_retry_variant: typeof body?.retry_variant === "string" ? body.retry_variant : null,
        },
      });
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} dispatch_attempt_log_failed: ${(e as Error)?.message ?? e}`,
      );
    }

    // ── v128 Phase B1 — Terminal-Transition Guard at dispatch entry ──────
    // Alpha-Plan v3.1 §1.9: a pass that is currently terminal (done /
    // done_suspect / failed / canceled_by_scene_failure) cannot leave
    // terminal unless the caller passes `user_retry_flag=true` + a fresh
    // `new_attempt_id` (and credits were re-debited externally). The
    // automatic webhook retry ladder + Plan-D fan-out used to call us with
    // `advance:true` / `retry:true` on already-terminal passes; the guard
    // logs Sentry-P1 `ILLEGAL_TERMINAL_TRANSITION_BLOCKED` and returns
    // without re-dispatch so the pass stays terminal.
    if ((isAdvance || isRetry) && typeof body?.pass_idx === "number") {
      const guard = await assertSafeDispatchEntry(
        supabase,
        {
          scene_id: sceneId,
          pass_idx: Number(body.pass_idx),
          source: isAdvance ? "compose-dialog-segments:advance" : "compose-dialog-segments:retry",
          user_retry_flag: body?.user_retry_flag === true,
          new_attempt_id: typeof body?.new_attempt_id === "string" ? body.new_attempt_id : null,
          credit_charge_result: body?.user_retry_flag === true ? "success" : "skip",
        },
        isRetry ? "retrying" : "dispatched",
      );
      if (!guard.ok && guard.blocked) {
        return json(
          {
            ok: false,
            status: "terminal_transition_blocked",
            scene_id: sceneId,
            pass_idx: Number(body.pass_idx),
            current_status: guard.currentStatus,
            reason: guard.reason,
            hint: "pass is terminal; only an explicit user-retry with a fresh attempt_id may re-dispatch",
          },
          409,
        );
      }
    }

    // ── Validate audio plan ───────────────────────────────────────────────
    const plan = ((scene as any).audio_plan ?? {}) as Record<string, any>;
    const twoshot = (plan.twoshot ?? {}) as Record<string, any>;
    const speakers = (Array.isArray(twoshot.speakers) ? twoshot.speakers : []) as TwoshotSpeaker[];
    const masterAudioUrl = String(twoshot.url ?? "");
    const totalSec = Number(twoshot.totalSec ?? 0);
    let canonicalDialogTurnsCount = 0;
    let canonicalSpeakerIds: string[] = [];
    let speakersSource = "audio_plan";
    /** FA-4/P0 — kanonische Turn-ID-Menge dieser Szene (Quelle: dialog_turns). */
    let canonicalDialogTurnIds: string[] = [];

    // ══ V537 — THE RUN'S FROZEN TURN IDENTITY ═══════════════════════════
    //
    // Every pass identity below comes from `audio_plan.twoshot` — segments,
    // voiced turn windows, `segment_id`. Deriving the canonical side from
    // `dialog_turns` instead compared two different moments: a stale client
    // save, or the id-only flag flipping between audio generation and
    // dispatch, silently moved one side. Scene 7aa7fc93 is what that looks
    // like in production.
    //
    // When the plan carries the snapshot it IS the authority for this run.
    // `[]` is a decision, not an absence: it says the run was built without
    // canonical turn identity, so FA-4 stays skipped consistently with its
    // own id-less segments. Only a genuinely ABSENT field falls back.
    const v537Frozen = readFrozenCanonicalTurnIds(
      ((scene as any)?.audio_plan?.twoshot ?? null) as { canonical_turn_ids?: unknown } | null,
    );
    if (v537Frozen.state === "malformed") {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v537_frozen_turn_ids_malformed ${v537Frozen.detail}`,
      );
      // Fail closed. Falling back to `dialog_turns` here would answer a
      // question this plan already answered — wrongly — with a value read
      // from a different moment. Runs before any wallet debit (~1688), so
      // no refund path is involved.
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "canonical_turn_snapshot_malformed",
        error_message: v537Frozen.detail,
        meta: { detail: v537Frozen.detail },
      });
      return json(
        { error: "canonical_turn_snapshot_malformed", detail: v537Frozen.detail },
        422,
      );
    }

    if (await readIdOnlyEnabled(supabase)) {
      const ensuredTurns = await ensureDialogTurnsForScene(supabase, scene as any);
      if (ensuredTurns.ok) {
        canonicalDialogTurnsCount = ensuredTurns.turns.length;
        canonicalSpeakerIds = orderedSpeakerIdsFromTurns(ensuredTurns.turns);
        canonicalDialogTurnIds = ensuredTurns.turns
          .map((t) => (typeof t.turnId === "string" ? t.turnId.trim() : ""))
          .filter((id) => id.length > 0);
        speakersSource = "dialog_turns";

        console.log(
          `[compose-dialog-segments] v201_id_only_cast scene=${sceneId} source=${ensuredTurns.source} turns=${canonicalDialogTurnsCount} cast=[${canonicalSpeakerIds.join(",")}]`,
        );

        // v202 — Cast & World ID-registry log marker. Verifies that every
        // canonical dialog speaker is present as an AssetRef(character)
        // in scene_assets. Observability only — never blocks dispatch here.
        try {
          const rawAssets = Array.isArray((scene as any).scene_assets)
            ? ((scene as any).scene_assets as Array<{ type?: string; id?: string }>)
            : [];
          const charSet = new Set(
            rawAssets.filter((a) => a?.type === "character" && typeof a.id === "string").map((a) => a.id as string),
          );
          const locCount = rawAssets.filter((a) => a?.type === "location").length;
          const missing = canonicalSpeakerIds.filter((id) => !charSet.has(id));
          console.log(
            `[compose-dialog-segments] v202_asset_registry_bound scene=${sceneId} assets_total=${rawAssets.length} characters=${charSet.size} locations=${locCount} missing=[${missing.join(",")}]`,
          );
        } catch (e) {
          console.warn(`[compose-dialog-segments] v202 log marker failed: ${(e as Error)?.message ?? e}`);
        }
      } else if (ensuredTurns.reason !== "no_dialog_lines") {
        const hasUuidSpeaker = speakers.some((sp: any) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sp?.character_id ?? "")),
        );
        const hasUuidShot = Array.isArray((scene as any).character_shots) &&
          (scene as any).character_shots.some((shot: any) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(shot?.characterId ?? shot?.character_id ?? "")),
          );
        if (hasUuidSpeaker || hasUuidShot) {
          console.error(
            `[compose-dialog-segments] v201_id_only_required_block scene=${sceneId} reason=${ensuredTurns.reason} details=${JSON.stringify(ensuredTurns.details ?? {})}`,
          );
          await supabase
            .from("composer_scenes")
            .update({
              lip_sync_status: "failed",
              twoshot_stage: "failed",
              clip_error: `id_only_dialog_turns_required:${ensuredTurns.reason}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sceneId);
          return json({ error: "id_only_dialog_turns_required", reason: ensuredTurns.reason, details: ensuredTurns.details ?? null }, 422);
        }
      }
    }

    // V537 — the frozen snapshot overrides ONLY the FA-4 canonical set.
    //
    // Deliberately narrow: `canonicalSpeakerIds`, `canonicalDialogTurnsCount`
    // and `speakersSource` keep their existing derivation, because the v202
    // cast guard pairs the count with the speaker list and would misfire on a
    // count without its speakers. This fence exists to stop FA-4 comparing
    // two moments — it is not a speaker-ordering change.
    if (v537Frozen.state === "present") {
      const legacyIds = canonicalDialogTurnIds;
      const same = legacyIds.length === v537Frozen.ids.length &&
        legacyIds.every((id, i) => id === v537Frozen.ids[i]);
      canonicalDialogTurnIds = v537Frozen.ids;
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v537_frozen_turn_ids ` +
          `frozen=${v537Frozen.ids.length} legacy_would_be=${legacyIds.length} same=${same} ` +
          `— the audio plan is this run's turn-identity authority`,
      );
    }

    if (!masterAudioUrl || speakers.length === 0 || totalSec <= 0) {
      // The clip webhook owns audio preparation and dispatches this function
      // again after audio_plan.twoshot is durably stored. An early/stale client
      // call is therefore a benign wait state: never reset the stage, attach a
      // clip error, or hide the already-rendered master plate.
      return json(
        {
          ok: false,
          waiting_for_audio: true,
          error: "missing_audio_plan",
          message: "Audio-Plan wird serverseitig vorbereitet.",
        },
        202,
      );
    }

    // ── Cast validation (max 4, no duplicate character_id, no overlap) ──
    // Run BEFORE wallet debit / Sync.so dispatch so an invalid cast never
    // costs credits and never reaches the provider.
    {
      const castCheck = validateCast(speakers as any[]);
      if (!castCheck.ok) {
        await failLipSync({
          supabase,
          sceneId,
          userId,
          reason: `${castCheck.reason}: ${castCheck.message ?? "invalid cast"}`,
          syncApiKey: syncApiKey || null,
        });
        return json(
          {
            error: castCheck.reason,
            message: castCheck.message,
            offenders: castCheck.offenders ?? [],
          },
          422,
        );
      }
    }

    // Pick the master plate for lipsync. CRITICAL: for cinematic-sync we
    // must NEVER use a `talking-head-renders/...` URL as the source — that
    // is a HeyGen avatar bust from an earlier engine, and using it as the
    // v5 lipsync input produces the "raw avatar instead of the scene" bug.
    // We check BOTH `clip_url` AND `lip_sync_source_clip_url` and block the
    // dispatch outright if both are talking-head plates.
    const isTalkingHead = (u: unknown) =>
      typeof u === "string" && u.includes("/talking-head-renders/");
    const lipSrcCandidate = (scene as any).lip_sync_source_clip_url ?? null;
    const clipUrlCandidate = (scene as any).clip_url ?? null;
    let sourceClipUrl: string | null = null;
    if (typeof lipSrcCandidate === "string" && !isTalkingHead(lipSrcCandidate)) {
      sourceClipUrl = lipSrcCandidate;
    } else if (typeof clipUrlCandidate === "string" && !isTalkingHead(clipUrlCandidate)) {
      sourceClipUrl = clipUrlCandidate;
    }
    const bothTalkingHead =
      (lipSrcCandidate == null || isTalkingHead(lipSrcCandidate)) &&
      isTalkingHead(clipUrlCandidate);
    if (bothTalkingHead) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} BLOCKED — both clip_url and lip_sync_source_clip_url are raw talking-head plates → resetting clip for re-render`,
      );
      // Self-heal: clear the invalid talking-head master so the next
      // "Alle generieren" / per-scene render produces a real scene plate
      // (Hailuo/HappyHorse i2v) instead of looping back into this block.
      await supabase
        .from("composer_scenes")
        .update({
          clip_url: null,
          clip_status: "pending",
          lip_sync_status: "pending",
          lip_sync_source_clip_url: null,
          lip_sync_applied_at: null,
          twoshot_stage: null,
          dialog_shots: null,
          replicate_prediction_id: null,
          clip_error:
            'raw_talking_head_source_blocked: Cinematic-Sync benötigt eine Scene-Plate (Hailuo/HappyHorse), nicht den rohen Talking-Head-Clip. Clip wurde zurückgesetzt — bitte erneut „Alle generieren" drücken.',
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return json(
        {
          error: "raw_talking_head_source_blocked",
          message:
            "Cinematic-Sync benötigt eine Scene-Plate, nicht den rohen Avatar-Clip. Clip wurde zurückgesetzt — bitte erneut generieren.",
        },
        422,
      );
    }
    if (!sourceClipUrl) {
      return json(
        { error: "missing_source_clip", message: "Scene has no master plate to lipsync onto." },
        422,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} source_kind=scene_plate url=${sourceClipUrl.slice(0, 80)}…`,
    );

    // Idempotency: an active render already exists → nudge and return.
    // On `retry=true` (E.5 webhook retry path) we bypass this guard because
    // the previous job already terminated FAILED.
    // On `advance=true` (multi-pass chain) we bypass too — the previous pass
    // completed and we're now dispatching the NEXT pass on the same scene.
    const existing = (scene as any).dialog_shots as SegmentsState | null;
    const existingStatus = String((existing as any)?.status ?? "");
    const existingError = String((existing as any)?.error ?? (scene as any)?.clip_error ?? "");
    let runtimeRecoveredAnchorFaceLayout: AnchorFaceLayout | null = null;
    const mergeDialogShots = (base: any, patch: Record<string, unknown>) => {
      const safeBase = base && typeof base === "object" && !Array.isArray(base) ? base : {};
      return {
        ...safeBase,
        ...patch,
        // v278.1 — routing artefacts are expensive and must survive terminal
        // error updates. A later failure state may set status/error, but it
        // must not erase the anchor layout that lets the next retry take the
        // Hungarian route instead of falling back to v153 duplicates.
        ...(safeBase.anchor_face_layout && !patch.anchor_face_layout
          ? { anchor_face_layout: safeBase.anchor_face_layout }
          : {}),
        ...(!safeBase.anchor_face_layout && runtimeRecoveredAnchorFaceLayout && !patch.anchor_face_layout
          ? { anchor_face_layout: runtimeRecoveredAnchorFaceLayout }
          : {}),
        ...(safeBase.plate_identity && !patch.plate_identity
          ? { plate_identity: safeBase.plate_identity }
          : {}),
      };
    };
    // ══ V510-P0 — MONOTONIC TERMINALIZATION ════════════════════════════
    //
    // Generation 10, run 58a103cc: passes 0/2/3 dispatched and wrote their
    // job ids per slot; pass 4 failed pre-dispatch and wrote its stale local
    // `passes[]` snapshot back wholesale, erasing passes[2].job_id and
    // passes[3].job_id; pass 1 then dispatched and reset the root to
    // `running` with clip_error=null — resurrecting a run that had already
    // terminalized AND refunded.
    //
    // Both defects are one property: a terminal decision that is neither
    // atomic nor monotonic. `mergeDialogShots` is a shallow spread and the
    // write is a full-column overwrite, so EVERY dialog_shots UPDATE carries
    // this invocation snapshot of `passes` back over its sibling slots.
    //
    // Every terminal write in the per-pass scope now goes through ONE
    // transaction that patches only its own slot; every progress write goes
    // through a monotonic touch that a terminal run refuses.
    const v510RunId = String((scene as any)?.active_run_id ?? "") || null;

    /**
     * Atomic terminalization. `passIdx: null` for failures that happen
     * before any pass owns a slot. `rootPatch` must never contain `passes`;
     * `assertRootPatchSafe` throws rather than let it through silently.
     */
    const v510Terminalize = async (args: {
      passIdx: number | null;
      passPatch: Record<string, unknown> | null;
      rootPatch: Record<string, unknown>;
      scenePatch: Record<string, unknown>;
      reason: string;
    }): Promise<{ ok: boolean; firstTerminal: boolean }> => {
      const rootPatch = assertRootPatchSafe(args.rootPatch);
      const { data, error } = await supabase.rpc("composer_terminalize_dialog_run", {
        _scene_id: sceneId,
        _run_id: v510RunId,
        _pass_idx: args.passIdx,
        _pass_patch: args.passPatch ?? {},
        _root_patch: rootPatch,
        _scene_patch: args.scenePatch,
        _terminal_reason: args.reason,
      });
      if (!error) {
        const firstTerminal = (data as any)?.first_terminal !== false;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v510_terminalized run=${v510RunId ?? "-"} ` +
            `pass=${args.passIdx ?? "-"} reason=${args.reason} first_terminal=${firstTerminal}`,
        );
        return { ok: true, firstTerminal };
      }
      // DEGRADED PATH — the atomic RPC is unreachable. Never fall back to a
      // full-row `passes[]` write: that is the defect. Two sequential
      // server-side merges are not a transaction, but neither of them can
      // carry a stale sibling slot, so this is strictly safer than the
      // behaviour it replaces.
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v510_terminalize_rpc_error reason=${args.reason} ` +
          `err=${error.message ?? error} — degrading to per-slot + root-merge`,
      );
      if (args.passIdx != null && args.passPatch) {
        await supabase.rpc("update_dialog_pass_slot", {
          _scene_id: sceneId, _pass_idx: args.passIdx, _patch: args.passPatch,
        });
      }
      await supabase.rpc("update_dialog_shots_root_merge", {
        _scene_id: sceneId,
        _patch: { ...rootPatch, v510_terminal_degraded: true },
      });
      await supabase.from("composer_scenes").update({
        ...args.scenePatch, updated_at: new Date().toISOString(),
      }).eq("id", sceneId);
      return { ok: false, firstTerminal: true };
    };

    /**
     * Monotonic progress write. Returns `applied: false` when this run has
     * already terminalized — that is the normal, non-error outcome of the
     * generation-10 race, not a failure to report upward.
     */
    const v510TouchProgress = async (
      rootPatch: Record<string, unknown>,
      scenePatch: Record<string, unknown>,
      passLabel: string,
    ): Promise<{ applied: boolean; reason: string }> => {
      const safeRoot = assertRootPatchSafe(rootPatch);
      const { data, error } = await supabase.rpc("composer_touch_dialog_run_progress", {
        _scene_id: sceneId,
        _run_id: v510RunId,
        _root_patch: safeRoot,
        _scene_patch: scenePatch,
      });
      if (!error) {
        const applied = (data as any)?.applied === true;
        const reason = String((data as any)?.reason ?? (applied ? "ok" : "blocked"));
        if (!applied) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${passLabel} ` +
              `v510_progress_blocked reason=${reason} — root stays terminal`,
          );
        }
        return { applied, reason };
      }
      // DEGRADED PATH — re-read and decide client-side. Narrower than the
      // unconditional write it replaces, but NOT atomic; the RPC is the
      // contract and this exists only so an undeployed migration cannot
      // strand a healthy dispatch.
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v510_progress_rpc_error err=${error.message ?? error}`,
      );
      const { data: reRow } = await supabase
        .from("composer_scenes").select("dialog_shots").eq("id", sceneId).maybeSingle();
      const reState: any = (reRow as any)?.dialog_shots ?? null;
      if (isRunTerminal(reState, v510RunId) || isFanoutClosed(reState)) {
        return { applied: false, reason: "run_terminal_degraded" };
      }
      await supabase.rpc("update_dialog_shots_root_merge", { _scene_id: sceneId, _patch: safeRoot });
      await supabase.from("composer_scenes").update({
        ...scenePatch, updated_at: new Date().toISOString(),
      }).eq("id", sceneId);
      return { applied: true, reason: "ok_degraded" };
    };

    /**
     * Non-terminal root write that must not carry `passes`.
     *
     * A `mergeDialogShots` root patch plus a full-column UPDATE looks
     * root-only at the call site but ships the entry snapshot of `passes`
     * with every write. On an `advance`/`retry` invocation siblings already
     * hold bound job ids, so that snapshot is a lost update waiting for the
     * right interleaving. The RPC merges server-side and strips `passes`.
     */
    const v510RootMerge = async (
      rootPatch: Record<string, unknown>,
      scenePatch: Record<string, unknown>,
    ): Promise<void> => {
      const safeRoot = assertRootPatchSafe(rootPatch);
      const { error } = await supabase.rpc("update_dialog_shots_root_merge", {
        _scene_id: sceneId,
        _patch: safeRoot,
      });
      if (error) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v510_root_merge_rpc_error err=${error.message ?? error}`,
        );
      }
      if (Object.keys(scenePatch).length > 0) {
        await supabase.from("composer_scenes").update({
          ...scenePatch, updated_at: new Date().toISOString(),
        }).eq("id", sceneId);
      }
    };

    const isStaleFailedState =
      !isRetry &&
      !isAdvance &&
      !isV41Retry &&
      existing &&
      (existingStatus === "failed" || /v68|v58|v41|v56|recovery refund|provider_unknown/i.test(existingError));
    if (isStaleFailedState) {
      // v100 — Self-heal stale watchdog-killed terminal state on auto-trigger.
      // When the watchdog (or any prior failure) refunded credits and parked
      // dialog_shots in {status:failed, refunded:true}, the previous
      // behaviour returned 409 reset_required, forcing the user to click
      // "Sauber neu starten" manually. For auto-trigger calls we now clear
      // the stale state in-line and continue with a clean dispatch. Manual
      // invocations (auto !== true) still get the 409 so the explicit reset
      // button remains the user's eskalation path.
      const isAutoTrigger = body?.auto === true || body?.recovery === true;
      const existingPasses = Array.isArray((existing as any)?.passes)
        ? ((existing as any).passes as Array<{ status?: string }>)
        : [];
      const hasActivePass = existingPasses.some((p) =>
        ["queued", "rendering", "retrying"].includes(String(p?.status ?? "")),
      );
      const isCleanlyRefunded =
        (existing as any)?.refunded === true && !hasActivePass;
      const canAutoReset =
        isAutoTrigger &&
        existingStatus === "failed" &&
        isCleanlyRefunded;

      if (canAutoReset) {
        console.log(
          `[compose-dialog-segments] v100 auto-reset-stale-failed scene=${sceneId} prev_error=${existingError.slice(0, 120)}`,
        );
        const { error: resetErr } = await supabase
          .from("composer_scenes")
          .update({
            dialog_shots: null,
            lip_sync_status: "pending",
            clip_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
        if (resetErr) {
          console.warn(
            `[compose-dialog-segments] v100 auto-reset write_failed scene=${sceneId} err=${resetErr.message} — falling back to 409`,
          );
          return json(
            {
              error: "reset_required",
              message: "Stale lip-sync failure state detected. Use reset-lipsync-scene before dispatch.",
            },
            409,
          );
        }
        // Continue with a clean slate — `existing` is now logically null.
        (scene as any).dialog_shots = null;
      } else {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} reset_required — refusing stale failed state status=${existingStatus} error=${existingError.slice(0, 160)} auto=${isAutoTrigger} refunded=${(existing as any)?.refunded === true} hasActivePass=${hasActivePass}`,
        );
        return json(
          {
            error: "reset_required",
            message: "Stale lip-sync failure state detected. Use reset-lipsync-scene before v69 dispatch.",
          },
          409,
        );
      }
    }

    if (
      !isRetry &&
      !isAdvance &&
      !isV41Retry &&
      existing &&
      (
        (existing.version === 5 && existing.engine === "sync-segments") ||
        (existing as any).version === 41 || (existing as any).version === 42 || (existing as any).version === 43 || (existing as any).version === 44 || (existing as any).version === 45 || (existing as any).version === 46 || (existing as any).version === 47 || (existing as any).version === 48 || (existing as any).version === 49 || (existing as any).version === 50 || (existing as any).version === 51 || (existing as any).version === 52 || (existing as any).version === 55 || (existing as any).version === 56
      ) &&
      ["queued", "rendering", "retrying"].includes(String(existing.status))
    ) {
      return json({ ok: true, status: "already_running", scene_id: sceneId }, 202);
    }


    // ── Build segments from per-speaker turns ────────────────────────────
    interface RawSegment {
      startTime: number;
      endTime: number;
      speakerIdx: number;
      speakerName: string;
      audioUrl: string;
    }
    const raw: RawSegment[] = [];
    speakers.forEach((sp, sIdx) => {
      const turns: Turn[] = Array.isArray(sp.voicedRange?.turns)
        ? (sp.voicedRange!.turns as Turn[])
        : sp.voicedRange?.startSec != null && sp.voicedRange?.endSec != null
          ? [{ startSec: sp.voicedRange.startSec, endSec: sp.voicedRange.endSec }]
          : [];
      const speakerAudio = String(sp.track_url ?? "").trim() || masterAudioUrl;
      const speakerName = String(sp.speaker ?? `Speaker ${sIdx + 1}`);
      for (const t of turns) {
        const start = Math.max(0, Number(t.startSec));
        const end = Math.max(start + MIN_TURN_DUR_SEC, Number(t.endSec));
        raw.push({
          startTime: start,
          endTime: Math.min(end, totalSec),
          speakerIdx: sIdx,
          speakerName,
          audioUrl: speakerAudio,
        });
      }
    });

    if (raw.length === 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_turns",
        })
        .eq("id", sceneId);
      return json({ error: "no_turns" }, 422);
    }

    raw.sort((a, b) => a.startTime - b.startTime);

    // De-dup audio sources → refIds
    const audioRefMap = new Map<string, string>();
    raw.forEach((r) => {
      if (!audioRefMap.has(r.audioUrl)) {
        audioRefMap.set(r.audioUrl, `audio_${audioRefMap.size + 1}`);
      }
    });

    const rawSegments = raw.map((r) => ({
      startTime: Number(r.startTime.toFixed(3)),
      endTime: Number(r.endTime.toFixed(3)),
      speakerIdx: r.speakerIdx,
      speakerName: r.speakerName,
      refId: audioRefMap.get(r.audioUrl)!,
    }));

    // Stage E.4: validate + auto-repair segments before paying Sync.so.
    const segValidation = validateSegments(rawSegments, totalSec);
    if (!segValidation.ok) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `segments_invalid_${segValidation.reason}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "SEGMENTS_INVALID", error_class: "segments_invalid",
        error_message: segValidation.reason ?? "unknown",
        meta: { repairs: segValidation.repairs, original_count: rawSegments.length },
      });
      return json({ error: "segments_invalid", reason: segValidation.reason, repairs: segValidation.repairs }, 422);
    }
    if (segValidation.repairs.length > 0) {
      console.warn(`[compose-dialog-segments] scene=${sceneId} segments auto-repaired: ${segValidation.repairs.join(", ")}`);
    }
    const segments = segValidation.fixed as typeof rawSegments;
    // v25 Fan-Out pricing: N Sync.so passes (1 per distinct speaker) on the
    // SAME original plate (no chaining). Cost = ceil(totalSec)*9 * speakers.
    // Min 1 to cover the single-speaker case. validateCast() above already
    // capped speakers at 4 distinct character_ids.
    const speakerCount = Math.max(1, speakers.length);
    const totalCost = computeCost(totalSec) * speakerCount;

    // ── Stage F.3 — Circuit Breaker (BEFORE wallet debit) ────────────────
    // If Sync.so is in OPEN state, don't charge the user — defer with retry.
    // v32: for an in-flight retry/advance against an existing v5 state, we
    // MUST NOT flip the scene back to `pending`. That kicked the scene out
    // of the running-scene watchdog scan and created a `pending+circuit_open`
    // loop the client kept re-triggering. Keep `lip_sync_status='running'`
    // so the watchdog can finalize it after TTL.
    const circuit = await evaluateCircuit(supabase, "sync.so");
    if (!circuit.allow) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} CIRCUIT_OPEN state=${circuit.state} reason=${circuit.reason} recent=${circuit.recentFailures} isRetry=${isRetry} isAdvance=${isAdvance}`,
      );
      const retryInMs = circuit.retryInMs ?? 30 * 60_000;
      const hasActiveV5 =
        (existing as any)?.version === 5 &&
        (existing as any)?.engine === "sync-segments" &&
        Array.isArray((existing as any)?.passes);
      const keepRunning = isRetry || isAdvance || hasActiveV5;
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: keepRunning ? "running" : "pending",
          twoshot_stage: "circuit_open",
          clip_error: `syncso_circuit_open:${circuit.reason ?? "unknown"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "CIRCUIT_BLOCKED", error_class: "rate_limited",
        error_message: `circuit ${circuit.state}: ${circuit.reason}`,
        meta: { circuit_state: circuit.state, recent_failures: circuit.recentFailures, retry_in_ms: retryInMs, kept_running: keepRunning },
      });
      return json(
        {
          ok: false,
          status: "circuit_open",
          state: circuit.state,
          retry_in_ms: retryInMs,
          recent_failures: circuit.recentFailures,
          refunded: 0,
          message: "Sync.so ist aktuell instabil — Dispatch pausiert für 30 min.",
        },
        202,
      );
    }

    // E.5: on retry path, wallet was already debited at the original dispatch
    // and the cost is preserved in state.cost_credits. Skip re-charging.
    if (!isRetry && !isV41Retry) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single();
      if (!wallet || Number(wallet.balance) < totalCost) {
        return json(
          {
            error: "INSUFFICIENT_CREDITS",
            required: totalCost,
            have: wallet?.balance ?? 0,
            message: `Sync-Segments benötigt ${totalCost} Credits.`,
          },
          402,
        );
      }
      await supabase
        .from("wallets")
        .update({
          balance: Number(wallet.balance) - totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    } else {
      console.log(`[compose-dialog-segments] scene=${sceneId} RETRY path (no re-charge)`);
    }

    // Stage F.7 — read auto-tuner preferred source kind (best-effort signal only)
    const tunerKind = await readPreferredSyncSourceKind(supabase);
    if (tunerKind) {
      console.log(`[compose-dialog-segments] scene=${sceneId} auto-tuner prefers source_kind=${tunerKind}`);
    }

    // ── Webhook URL ──────────────────────────────────────────────────────
    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/sync-so-webhook?scene_id=${sceneId}`,
    );

    // ── Face-targeting (resolve per-speaker coords) ──────────────────────
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    // v400 — Anchor/Plate-Kohärenz.
    // Die Gesichts-Geometrie MUSS auf genau dem Bild gemessen werden, aus dem
    // die Plate erzeugt wurde. Das ist `reference_image_url` (i2v-First-Frame).
    // `lock_reference_url` ist nur ein Continuity-Lock und kann aus einem
    // früheren Lauf stammen — dann zeigt er eine andere Bildkomposition und
    // jede daraus abgeleitete Crop-Koordinate landet neben dem Gesicht.
    const refAnchorUrl = ((scene as any).reference_image_url || "").trim() || null;
    const lockAnchorUrl = ((scene as any).lock_reference_url || "").trim() || null;
    const anchorUrl = refAnchorUrl || lockAnchorUrl;
    if (refAnchorUrl && lockAnchorUrl && refAnchorUrl !== lockAnchorUrl) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v400_anchor_divergence ` +
        `plate_anchor=${refAnchorUrl.slice(-40)} stale_lock=${lockAnchorUrl.slice(-40)} — using plate anchor`,
      );
    }

    const characterIds = speakers.map((sp) => sp.character_id ?? null);
    const characters = await resolveCharacterPortraits(supabase, userId, characterIds);
    const cachedFaceMap = (twoshot as any).faceMap ?? null;
    let faceMap: Awaited<ReturnType<typeof resolveSceneFaceMap>> | null = null;
    try {
      faceMap = await resolveSceneFaceMap({
        supabase,
        sceneId,
        anchorUrl,
        cachedFaceMap,
        lovableKey,
        characters,
        expectedFaceCount: speakers.length,
      });
    } catch (err) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} faceMap resolve failed: ${(err as Error).message}`,
      );
    }
    // Probe ACTUAL plate dimensions so per-speaker coords are in plate-space.
    // Anchor image (Nano Banana) and Hailuo i2v plate often differ in aspect
    // ratio/crop → coords computed against the anchor land off-face on the
    // plate, Sync.so rejects coords-pro with provider_unknown_error.
    // NOTE: `state` is built later (after prevState/passes setup). Use the
    // already-resolved `sourceClipUrl` (master plate) and any cached dims on
    // the existing dialog_shots row as fallback. This avoids a TDZ crash.
    const platePrimaryUrl =
      sourceClipUrl ||
      (scene as any).clip_url ||
      null;
    let plateDims: { width: number; height: number } | null = null;
    if (platePrimaryUrl) {
      plateDims = await probeMp4Dims(platePrimaryUrl);
    }
    // v33+: HARD-FAIL if we can't measure the plate for 3+ speakers — but
    // first try the anchor-derived dimensions from the cached faceMap. Some
    // Hailuo MP4 muxers write a tkhd with zero dimensions, so probeMp4Dims
    // returns null even though the clip is visually valid. The anchor
    // faceMap was built from the same scene composition so its aspect
    // ratio is a safe trusted fallback for per-speaker coordinates.
    let plateDimsSource: "mp4_probe" | "anchor_facemap_fallback" | "default" = "default";
    if (plateDims) {
      plateDimsSource = "mp4_probe";
    } else if (speakers.length >= 3 && !isAdvance) {
      const fmW = Number((cachedFaceMap as any)?.width);
      const fmH = Number((cachedFaceMap as any)?.height);
      const anchorOk =
        Number.isFinite(fmW) && Number.isFinite(fmH) &&
        fmW >= 256 && fmH >= 256 && fmW <= 8192 && fmH <= 8192;
      if (anchorOk) {
        plateDims = { width: Math.round(fmW), height: Math.round(fmH) };
        plateDimsSource = "anchor_facemap_fallback";
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} probeMp4Dims=null — using anchor faceMap dims ${fmW}x${fmH} as trusted fallback for 3+ speakers`,
        );
      }
    }

    if (!plateDims && speakers.length >= 3 && !isAdvance) {
      const alreadyRefunded = !!(existing as any)?.refunded;
      if (!alreadyRefunded && !isRetry) {
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({ balance: Number(w0?.balance ?? 0) + totalCost, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      // ── V510-P0 — a preflight gate, re-entered by every `advance` and
      // `retry` invocation. The write looked root-only, but
      // `mergeDialogShots` is a shallow spread over the scene read at
      // entry, so the full-column UPDATE shipped `existing.passes` with
      // it — and on a re-entrant invocation the siblings in that snapshot
      // already hold bound job ids. The root merge now happens server-side.
      const v510Root0: Record<string, unknown> = {
        version: 5,
        engine: "sync-segments",
        status: "failed",
        cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
        refunded: !alreadyRefunded,
        error: "plate_probe_failed_3plus_speakers",
        finished_at: new Date().toISOString(),
      };
      await v510Terminalize({
        passIdx: null,
        passPatch: null,
        rootPatch: v510Root0,
        scenePatch: {
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: 'plate_probe_failed_3plus_speakers: Video-Geometrie konnte nicht gelesen werden. Bitte "Sauber neu starten" drücken — beim erneuten Versuch nutzt das System die Anchor-Dimensionen als Fallback.',
        },
        reason: String(v510Root0.error ?? "terminal"),
      });
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "plate_probe_failed",
        error_message: "probeMp4Dims returned null AND no anchor faceMap dims available for 3+ speaker scene",
        meta: { plate_url: platePrimaryUrl, speaker_count: speakers.length, anchor_facemap_present: !!cachedFaceMap },
      });
      return json(
        {
          error: "plate_probe_failed_3plus_speakers",
          message: "Plate dimensions could not be measured. Re-render the scene clip.",
          refunded: alreadyRefunded || isRetry ? 0 : totalCost,
        },
        422,
      );
    }
    // v274 — fallback: if `dialog_shots.plate_identity` is missing (e.g. this
    // is the first dispatch after v274 anchor stage), hydrate from
    // `audio_plan.twoshot.anchor_identity` seeded by compose-video-clips.
    const _anchorIdentitySeed = ((scene as any)?.audio_plan?.twoshot?.anchor_identity ?? null) as any;
    const persistedPlateIdentity = (((existing as any)?.plate_identity) ?? _anchorIdentitySeed ?? null) as any;
    const _persistedAssignmentLock =
      persistedPlateIdentity?.assignmentLock && typeof persistedPlateIdentity.assignmentLock === "object"
        ? persistedPlateIdentity.assignmentLock
        : null;
    const _persistedAssignmentLockSource = String(persistedPlateIdentity?.assignmentLockSource ?? "");
    const _isRekognitionLock = /rekognition/i.test(_persistedAssignmentLockSource) || !!_anchorIdentitySeed?.assignmentLock;
    const anchorRekLockSeed: Record<string, string> | null =
      (_isRekognitionLock && _persistedAssignmentLock && Object.keys(_persistedAssignmentLock).length > 0)
        ? { ...(_persistedAssignmentLock as Record<string, string>) }
        : null;
    const anchorRekLockCount = anchorRekLockSeed ? Object.keys(anchorRekLockSeed).length : 0;
    const anchorRekLockPartial = !!anchorRekLockSeed && anchorRekLockCount > 0 && anchorRekLockCount < speakers.length;
    const anchorRekLockComplete = !!anchorRekLockSeed && anchorRekLockCount >= speakers.length;
    if (anchorRekLockSeed) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v277_anchor_rekognition_seed ` +
        `locked_slots=${anchorRekLockCount}/${speakers.length} status=${persistedPlateIdentity?.status ?? "unknown"}`,
      );
    }
    const persistedPlateDims = persistedPlateIdentity?.dims;
    if (
      !plateDims &&
      Number.isFinite(Number(persistedPlateDims?.width)) &&
      Number.isFinite(Number(persistedPlateDims?.height))
    ) {
      plateDims = {
        width: Math.round(Number(persistedPlateDims.width)),
        height: Math.round(Number(persistedPlateDims.height)),
      };
      plateDimsSource = "anchor_facemap_fallback";
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v153.2_plate_hydration source=persisted-dims dims=${plateDims.width}x${plateDims.height}`,
      );
    }

    const videoDims = plateDims ?? {
      width: Number((existing as any)?.video_width) || 1280,
      height: Number((existing as any)?.video_height) || 720,
    };
    const _clipSource = (scene as any)?.clip_source ?? "unknown";
    const _engineOverride = (scene as any)?.engine_override ?? "auto";
    console.log(
      `[compose-dialog-segments] scene=${sceneId} plateDims source=${plateDimsSource} dims=${videoDims.width}x${videoDims.height} clip_source=${_clipSource} engine=${_engineOverride} plate_url=${platePrimaryUrl ? platePrimaryUrl.slice(-60) : "null"}`,
    );
    // v184 quality-forensics: flag likely-720p sub-HD plates so we can decide
    // to bump provider resolution later. Pure logging — no behavior change.
    if (videoDims.width * videoDims.height < 1280 * 720) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v184_low_res_plate dims=${videoDims.width}x${videoDims.height} clip_source=${_clipSource} — final MP4 will look soft when scaled to preview`,
      );
    }

    const coordSources: string[] = [];
    const speakerCoords: Array<[number, number] | null> = speakers.map((sp, idx) => {
      const picked = pickSpeakerCoordinates({
        speakerIdx: idx,
        characterId: sp.character_id ?? null,
        faceMap,
        videoDims,
        totalSpeakers: speakers.length,
      });
      coordSources.push(picked?.source ?? "none");
      return picked?.coords ?? null;
    });
    // v185 — Anchor-First Truth Snapshot.
    // Freeze the anchor-derived speaker coordinates BEFORE the v183 plate-
    // identity mapping overwrites `speakerCoords`. Used at the end of the
    // mapping block to sanity-check that each assigned plate bbox actually
    // sits on the same face the anchor pipeline identified. If the plate
    // detector (AWS Rekognition on the Hailuo plate) returned a bogus box
    // (e.g. whiteboard scribbles false-positived as a face) and v183
    // Confidence-Ranking still labeled it with the speaker's character_id,
    // the resulting bbox is off-face and Sync.so rejects the dispatch with
    // `generation_input_face_selection_invalid`. Anchor coords never drift
    // more than 5–15 % vs the rendered plate (Hailuo i2v preserves the
    // anchor composition), so an anchor coord that lies OUTSIDE the assigned
    // plate bbox is a deterministic signal that the plate face is wrong.
    const anchorSpeakerCoords: Array<[number, number] | null> = speakerCoords.map(
      (c) => (Array.isArray(c) ? [c[0], c[1]] as [number, number] : null),
    );

    // ── Plate-native identity override (v77, v129.20) ────────────────────
    // Anchor coords drift 5–15 % vs the rendered Hailuo plate. For multi-
    // speaker scenes that drift routinely lands the Sync.so target on the
    // WRONG face. v129.20: also run for SINGLE-speaker scenes — anchor
    // rescale alone produced coords that miss the face (e.g. [204,171] on
    // a plate where the face actually sits upper-right), which then trips
    // our pre-dispatch face-gate. Plate-native detection is now mandatory
    // for every speaker count ≥ 1.
    const speakerPlateBboxes: Array<[number, number, number, number] | null> =
      new Array(speakers.length).fill(null);
    // v160 — Pro-Sprecher Mund-Landmark (AWS Rekognition). Der Landmark ist
    // nur noch der deterministische Identitäts-/Qualitätsanker. Sync.so
    // erwartet bei `bounding_boxes(_url)` eine echte Face-Detection-Box, keine
    // Mini-Lippenregion; zu kleine Mouth-Boxes führten zu No-Lipsync/Morphs.
    const speakerPlateMouths: Array<[number, number] | null> =
      new Array(speakers.length).fill(null);
    let plateIdentityMap: Awaited<ReturnType<typeof resolvePlateFaceIdentities>> | null = null;
    // v436 — explicit reason for every "no usable identity map" outcome.
    const plateIdentityDiag: { reason?: string | null } = { reason: null };
    let plateHydrationSource: "persisted" | "live" | "missing" = "missing";
    const persistedBboxes = Array.isArray(persistedPlateIdentity?.bboxes) && persistedPlateIdentity.bboxes.length > 0
      ? persistedPlateIdentity.bboxes
      : Array.isArray(persistedPlateIdentity?.faces)
        ? persistedPlateIdentity.faces
          .map((face: any) => face?.bbox)
          .filter((bbox: unknown) => Array.isArray(bbox) && (bbox as unknown[]).length === 4)
        : [];
    const v278Enabled = (Deno.env.get("V278_HUNGARIAN_ROUTER_N3") ?? "true").toLowerCase() !== "false";
    let anchorLayoutRaw = ((scene as any)?.dialog_shots?.anchor_face_layout ?? null) as AnchorFaceLayout | null;
    // v400 — Stale-Layout-Guard. Ein persistiertes Face-Layout gilt nur, wenn es
    // auf demselben Anker gemessen wurde, aus dem die aktuelle Plate stammt.
    // Andernfalls verwerfen wir es und lassen es neu aus dem aktuellen Anker
    // rekonstruieren (facemap_recovery).
    if (
      anchorLayoutRaw &&
      anchorUrl &&
      typeof (anchorLayoutRaw as any).anchorUrl === "string" &&
      (anchorLayoutRaw as any).anchorUrl.startsWith("http") &&
      (anchorLayoutRaw as any).anchorUrl !== anchorUrl
    ) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v400_stale_anchor_layout_discarded ` +
        `layout_anchor=${String((anchorLayoutRaw as any).anchorUrl).slice(-40)} plate_anchor=${anchorUrl.slice(-40)}`,
      );
      anchorLayoutRaw = null;
    }
    let anchorLayoutSource: "persisted" | "facemap_recovery" | "missing" = anchorLayoutRaw ? "persisted" : "missing";

    const normalizeCharacterIdForRouting = (id?: string | null) =>
      String(id ?? "")
        .toLowerCase()
        .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
    const layoutCoversSpeakers = (layout: AnchorFaceLayout | null) => {
      if (!layout || !Array.isArray(layout.slots) || layout.slots.length < speakers.length) return false;
      const layoutIds = new Set(
        layout.slots
          .map((slot) => normalizeCharacterIdForRouting(slot.characterId))
          .filter(Boolean),
      );
      const speakerIds = speakers
        .map((sp) => normalizeCharacterIdForRouting(sp.character_id))
        .filter(Boolean);
      return speakerIds.length === speakers.length && speakerIds.every((id) => layoutIds.has(id));
    };
    if (v278Enabled && speakers.length >= 3 && !layoutCoversSpeakers(anchorLayoutRaw)) {
      const fm = (faceMap ?? cachedFaceMap) as any;
      const fmFaces = Array.isArray(fm?.faces) ? fm.faces : [];
      const fmW = Number(fm?.width);
      const fmH = Number(fm?.height);
      const fmDimsOk = Number.isFinite(fmW) && Number.isFinite(fmH) && fmW > 0 && fmH > 0;
      const recoveredFaces = fmFaces
        .map((f: any, idx: number) => {
          const bbox = Array.isArray(f?.bbox) && f.bbox.length === 4
            ? f.bbox.map((n: unknown) => Math.round(Number(n)))
            : null;
          if (!bbox || bbox.some((n: number) => !Number.isFinite(n))) return null;
          const slot = Number.isFinite(Number(f?.slotIndex))
            ? Math.max(0, Math.round(Number(f.slotIndex)))
            : Number.isFinite(Number(f?.slot))
              ? Math.max(0, Math.round(Number(f.slot)))
              : idx;
          const characterId = typeof f?.characterId === "string" && f.characterId.length > 0
            ? f.characterId
            : null;
          return { slot, bbox: bbox as [number, number, number, number], characterId };
        })
        .filter(Boolean) as Array<{ slot: number; bbox: [number, number, number, number]; characterId: string | null }>;
      if (fmDimsOk && recoveredFaces.length >= speakers.length) {
        const recoveredLayout = buildAnchorLayoutFromV274(
          anchorUrl ?? `facemap-recovery:${sceneId}`,
          { width: Math.round(fmW), height: Math.round(fmH) },
          recoveredFaces,
        );
        if (layoutCoversSpeakers(recoveredLayout)) {
          anchorLayoutRaw = recoveredLayout;
          anchorLayoutSource = "facemap_recovery";
          runtimeRecoveredAnchorFaceLayout = recoveredLayout;
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v278_anchor_layout_recovered_from_facemap ` +
            `slots=${recoveredLayout.slots.length}/${speakers.length} dims=${recoveredLayout.dims.width}x${recoveredLayout.dims.height}`,
          );
          // ── V510-P0 — root-only patch, but the full-column write carried
          // `existing.passes` with it. The merge now happens server-side.
          await v510RootMerge(
            {
              anchor_face_layout: recoveredLayout,
              v278_anchor_layout_source: "facemap_recovery",
              v278_anchor_layout_recovered_at: new Date().toISOString(),
            },
            {
            },
          );
        } else {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v278_anchor_layout_facemap_recovery_rejected ` +
            `reason=missing_speaker_ids recovered=${recoveredLayout.slots.length}/${speakers.length}`,
          );
        }
      }
    }
    const hasCompleteV278AnchorLayout = !!(
      v278Enabled &&
      speakers.length >= 3 &&
      anchorLayoutRaw &&
      Array.isArray(anchorLayoutRaw.slots) &&
      anchorLayoutRaw.slots.length >= speakers.length &&
      layoutCoversSpeakers(anchorLayoutRaw)
    );
    // v154 — Geometry sanity gate against the persisted bboxes. The pre-v154
    // detector path occasionally cached torso/upper-body boxes (center y >
    // 0.55 of plate height). If those got persisted into dialog_shots, they
    // would survive "Sauber neu starten" forever. Discard suspect persisted
    // identities so the live re-detect path (with the new gate) runs.
    let persistedGateOk = true;
    if (persistedBboxes.length >= speakers.length && plateDims) {
      const probeFaces = persistedBboxes
        .slice(0, speakers.length)
        .filter((b: unknown) => Array.isArray(b) && (b as unknown[]).length === 4)
        .map((b: number[]) => ({
          bbox: [
            Math.round(Number(b[0])),
            Math.round(Number(b[1])),
            Math.round(Number(b[2])),
            Math.round(Number(b[3])),
          ] as [number, number, number, number],
          center: [
            Math.round((Number(b[0]) + Number(b[2])) / 2),
            Math.round((Number(b[1]) + Number(b[3])) / 2),
          ] as [number, number],
          slot: 0,
        }));
      const gate = validatePlateFacesGeometry(probeFaces, plateDims.width, plateDims.height);
      if (!gate.ok) {
        persistedGateOk = false;
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v154_persisted_identity_evict reason=${gate.reason} ` +
          `detail=${gate.detail ?? "-"} — forcing live plate re-detection`,
        );
      }
    }
    // v242 — ID-first rehydration + Character-Assignment-Lock enforcement.
    //
    // Root cause of the "speaker 2 speaks line 3" bug (scene 53976949…):
    // the legacy code hydrated speakerPlateBboxes[i] from persistedBboxes[i]
    // positionally. persistedBboxes is written in speaker-index order, so
    // if the initial run assigned the wrong bbox to speaker i, the swap was
    // "frozen" and every rerender perpetuated it. persistedFaces[] DID
    // contain the correct characterId → bbox mapping — it just wasn't used.
    //
    // New order of precedence:
    //   (a) assignmentLock (locked characterId per speakerIdx, if present)
    //   (b) persistedFaces[] matched by characterId (with stripIdPrefix)
    //   (c) legacy positional fallback (persistedBboxes[i])
    //
    // Any of the above sets plateHydrationSource="persisted" and short-
    // circuits the live Gemini re-detect below. Consistency (>50 px drift)
    // is checked implicitly: if a locked characterId cannot be found in
    // persistedFaces[] we fall through to live detection.
    const stripIdPrefixLocal = (id?: string | null) =>
      String(id ?? "")
        .toLowerCase()
        .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
    if (persistedGateOk && persistedBboxes.length >= speakers.length && !hasCompleteV278AnchorLayout) {
      const persistedMouths: any[] = Array.isArray(persistedPlateIdentity?.mouths)
        ? persistedPlateIdentity.mouths
        : [];
      const persistedFaces: any[] = Array.isArray(persistedPlateIdentity?.faces)
        ? persistedPlateIdentity.faces
        : [];
      const assignmentLock: Record<string, string> =
        (persistedPlateIdentity as any)?.assignmentLock &&
        typeof (persistedPlateIdentity as any).assignmentLock === "object"
          ? (persistedPlateIdentity as any).assignmentLock
          : {};
      const faceByCharId = new Map<string, any>();
      for (const pf of persistedFaces) {
        const cid = stripIdPrefixLocal((pf as any)?.characterId);
        if (cid && !faceByCharId.has(cid)) faceByCharId.set(cid, pf);
      }
      let mouthHydrated = 0;
      let idMatched = 0;
      let lockMatched = 0;
      let positionalFallback = 0;
      for (let i = 0; i < speakers.length; i++) {
        // (a) Lock: locked characterId for this speakerIdx wins.
        let matchedFace: any = null;
        let matchSource: string | null = null;
        const lockedCid = stripIdPrefixLocal(assignmentLock[String(i)]);
        if (lockedCid && faceByCharId.has(lockedCid)) {
          matchedFace = faceByCharId.get(lockedCid);
          matchSource = "lock";
          lockMatched++;
        }
        // (b) characterId from speakers[i] → persistedFaces[].characterId.
        if (!matchedFace) {
          const speakerCid = stripIdPrefixLocal(speakers[i]?.character_id);
          if (speakerCid && faceByCharId.has(speakerCid)) {
            matchedFace = faceByCharId.get(speakerCid);
            matchSource = "cid";
            idMatched++;
          }
        }
        // (c) Positional fallback (legacy behavior).
        let bboxSource: [number, number, number, number] | null = null;
        let mouthSource: [number, number] | null = null;
        if (matchedFace && Array.isArray(matchedFace.bbox) && matchedFace.bbox.length === 4) {
          bboxSource = [
            Math.round(Number(matchedFace.bbox[0])),
            Math.round(Number(matchedFace.bbox[1])),
            Math.round(Number(matchedFace.bbox[2])),
            Math.round(Number(matchedFace.bbox[3])),
          ];
          if (Array.isArray(matchedFace.mouth) && matchedFace.mouth.length === 2) {
            mouthSource = [
              Math.round(Number(matchedFace.mouth[0])),
              Math.round(Number(matchedFace.mouth[1])),
            ];
          }
        } else {
          const b = persistedBboxes[i];
          if (Array.isArray(b) && b.length === 4 && b.every((n: unknown) => Number.isFinite(Number(n)))) {
            bboxSource = [
              Math.round(Number(b[0])),
              Math.round(Number(b[1])),
              Math.round(Number(b[2])),
              Math.round(Number(b[3])),
            ];
            const snapM = persistedMouths[i];
            if (Array.isArray(snapM) && snapM.length === 2 &&
                Number.isFinite(Number(snapM[0])) && Number.isFinite(Number(snapM[1]))) {
              mouthSource = [Math.round(Number(snapM[0])), Math.round(Number(snapM[1]))];
            }
            matchSource = "positional";
            positionalFallback++;
          }
        }
        if (bboxSource) {
          speakerPlateBboxes[i] = bboxSource;
          const targetCx = Math.round((bboxSource[0] + bboxSource[2]) / 2);
          const targetCy = Math.round((bboxSource[1] + bboxSource[3]) / 2);
          if (mouthSource) {
            speakerPlateMouths[i] = mouthSource;
            speakerCoords[i] = clampSyncCoords([mouthSource[0], mouthSource[1]]);
            coordSources[i] = `plate-persisted-mouth-${matchSource ?? "positional"}`;
            mouthHydrated++;
          } else {
            speakerCoords[i] = clampSyncCoords([targetCx, targetCy]);
            coordSources[i] = `plate-persisted-${matchSource ?? "positional"}`;
          }
        }
      }
      plateHydrationSource = speakerPlateBboxes.every(Boolean) ? "persisted" : "missing";
      if (plateHydrationSource === "persisted") {
        const hydratedBoxes = speakerPlateBboxes
          .map((b, i) => (Array.isArray(b) && b.length === 4 ? { i, b } : null))
          .filter(Boolean) as Array<{ i: number; b: [number, number, number, number] }>;
        const duplicateHydratedIdx: number[] = [];
        for (let a = 0; a < hydratedBoxes.length; a++) {
          for (let c = a + 1; c < hydratedBoxes.length; c++) {
            const ba = hydratedBoxes[a].b;
            const bc = hydratedBoxes[c].b;
            const ca = [(ba[0] + ba[2]) / 2, (ba[1] + ba[3]) / 2];
            const cc = [(bc[0] + bc[2]) / 2, (bc[1] + bc[3]) / 2];
            if (Math.hypot(ca[0] - cc[0], ca[1] - cc[1]) < 8) duplicateHydratedIdx.push(hydratedBoxes[c].i);
          }
        }
        if (duplicateHydratedIdx.length > 0) {
          for (let i = 0; i < speakerPlateBboxes.length; i++) {
            speakerPlateBboxes[i] = null;
            speakerPlateMouths[i] = null;
          }
          plateHydrationSource = "missing";
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v278_persisted_identity_duplicate_evict ` +
            `speakers=[${duplicateHydratedIdx.join(",")}] — forcing Hungarian/live routing instead of frozen cache`,
          );
        }
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v242_persisted_id_first_hydration ` +
        `lock=${lockMatched}/${speakers.length} cid=${idMatched}/${speakers.length} ` +
        `positional=${positionalFallback}/${speakers.length} mouths=${mouthHydrated}/${speakers.length} ` +
        `bboxes=${speakerPlateBboxes.filter(Boolean).length}/${speakers.length} ` +
        `lock_present=${Object.keys(assignmentLock).length > 0}`,
      );
    } else if (persistedBboxes.length >= speakers.length && hasCompleteV278AnchorLayout && anchorLayoutRaw) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v278_skip_legacy_persisted_hydration ` +
        `anchor_layout=${anchorLayoutRaw.slots.length}/${speakers.length} source=${anchorLayoutSource} persisted_boxes=${persistedBboxes.length} — trying Hungarian router first`,
      );
    }
    if (plateHydrationSource !== "persisted" && speakers.length >= 1 && plateDims && sourceClipUrl) {
      // ── v278 FAST-PATH — HUNGARIAN PLATE ROUTER ────────────────────
      // For N ≥ 3 scenes we have a persisted anchor_face_layout from
      // compose-video-clips (v274 Rekognition on the anchor gave us the
      // characterId per anchor slot + normalized centers). Use pure
      // geometric bijection against the rendered plate — no biometric
      // Gemini call needed. This eliminates the "same face assigned to
      // two speakers" duplicate bug and the profile-shot silent-speaker
      // bug, while remaining robust to [CastActions] positional drift
      // via minimum-distance Hungarian assignment.
      //
      // Falls back to the legacy resolvePlateFaceIdentities pipeline
      // when: N < 3 (legacy is cheap and reliable there), the anchor
      // layout is missing (older scenes), face-count mismatch, or the
      // AWS DetectFaces call fails.
      // FA-4 P0 — a CONTRACTUAL geometry failure of the v278/FA-4 router is a
      // confirmed statement about the plate. The legacy identity resolver must
      // NOT take over in that case (it is exactly the path that produced the
      // wrong-face runs). Infrastructure failures keep the legacy recovery.
      let fa4ContractualFailure: {
        reason: string;
        detail: string;
        // V507 — face-size specific telemetry for the customer message.
        faceSizeLimited?: boolean;
        measurements?: unknown;
        dims?: { width: number; height: number };
      } | null = null;

      if (
        hasCompleteV278AnchorLayout &&
        anchorLayoutRaw
      ) {
        try {
          const routed = await routePlateFacesToAnchor({
            // v278.2 — Anchor-First router: AWS Rekognition cannot detect faces
            // from MP4 bytes. Route on the still anchor/reference image, then
            // scale normalized boxes into plate dimensions. This preserves the
            // no-duplicate bijection without falling back to v153 on videos.
            plateUrl: anchorLayoutRaw.anchorUrl?.startsWith("http")
              ? anchorLayoutRaw.anchorUrl
              : (anchorUrl ?? sourceClipUrl),
            anchorLayout: anchorLayoutRaw,
            plateDims,
          });
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v278_router ok=${routed.ok ? 1 : 0} ` +
            `resolved=${routed.resolvedCount}/${routed.expectedCount} faces=${routed.faces.length} ` +
            `mismatch=${routed.countMismatch ? 1 : 0} maxDist=${routed.maxDistance?.toFixed(3) ?? "-"} ` +
            `ms=${routed.msTotal} reason=${routed.reason ?? "-"} class=${routed.failureClass ?? "-"}`,
          );
          if (routed.ok && routed.resolvedCount === speakers.length) {
            // Adapt router output to PlateIdentityMap shape.
            plateIdentityMap = {
              faces: routed.faces.map((f) => ({
                bbox: f.bbox,
                center: [Math.round((f.bbox[0] + f.bbox[2]) / 2), Math.round((f.bbox[1] + f.bbox[3]) / 2)] as [number, number],
                slot: f.slot,
                confidence: f.matchConfidence,
                characterId: f.characterId,
                matchConfidence: f.matchConfidence,
              })),
              width: routed.dims.width || plateDims.width,
              height: routed.dims.height || plateDims.height,
              detector: "v278-rekognition-hungarian",
              cached: false,
              resolvedCount: routed.resolvedCount,
              identityMethod: "per-char-hungarian",
              assignmentLock: routed.assignmentLock,
              assignmentLockSource: "v278_hungarian_plate_router",
              anchorLayoutSource,
              minConfidence: Math.min(...routed.faces.filter((f) => f.characterId).map((f) => f.matchConfidence)),
              minMargin: 1,
              ambiguous: false,
            } as any;
          } else if (routed.failureClass === "contractual") {
            fa4ContractualFailure = {
              reason: routed.reason ?? "fa4_fail_closed:unknown",
              detail:
                `anchor=${routed.expectedCount} detected=${routed.detectedCount ?? routed.faces.length} ` +
                `resolved=${routed.resolvedCount}`,
              faceSizeLimited: Boolean(routed.faceSizeLimited) &&
                String(routed.reason ?? "").includes("faces_too_small_for_lipsync"),
              measurements: routed.sanityMeasurements,
              dims: routed.dims,
            };
          }
        } catch (err) {
          // Thrown router errors are ALWAYS infrastructure → legacy recovery.
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v278_router threw — falling back to legacy: ${(err as Error)?.message}`,
          );
        }
      }
      if (fa4ContractualFailure) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} fa4_contract_b_fail_closed ` +
          `reason=${fa4ContractualFailure.reason} ${fa4ContractualFailure.detail} — ` +
          `legacy resolvePlateFaceIdentities suppressed, no provider dispatch`,
        );
        // V507 — persist the measurement so triage no longer depends on logs.
        try {
          await supabase
            .from("composer_scenes")
            .update({
              preview_audit: {
                v507_face_size_gate: {
                  reason: fa4ContractualFailure.reason,
                  detail: fa4ContractualFailure.detail,
                  face_size_limited: Boolean(fa4ContractualFailure.faceSizeLimited),
                  plate_dims: fa4ContractualFailure.dims ?? null,
                  measurements: fa4ContractualFailure.measurements ?? null,
                  at: new Date().toISOString(),
                },
              },
            })
            .eq("id", sceneId);
        } catch (e) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v507_preview_audit_write_failed: ${(e as Error)?.message}`,
          );
        }
        const failMessage = fa4ContractualFailure.faceSizeLimited
          ? tl({
            de: "Die Gesichter sind in dieser Aufnahme zu klein für Lip-Sync. Bitte die Szene enger kadrieren (Halbtotale statt Totale) und neu erzeugen. Es wurde nichts gerendert, die Credits wurden zurückerstattet.",
            en: "The faces in this shot are too small for lip-sync. Please frame the scene tighter (medium shot instead of a wide shot) and regenerate. Nothing was rendered and the credits have been refunded.",
            es: "Las caras de esta toma son demasiado pequeñas para el lip-sync. Encuadra la escena más cerca (plano medio en lugar de plano general) y vuelve a generarla. No se renderizó nada y los créditos han sido reembolsados.",
          })
          : tl({
            de: "Die Gesichter im Plate lassen sich den Sprechern nicht eindeutig zuordnen. Der Lip-Sync wurde vor dem Start abgebrochen und die Credits wurden zurückerstattet.",
            en: "The faces on the plate cannot be assigned unambiguously to the speakers. Lip-sync was aborted before dispatch and credits have been refunded.",
            es: "Las caras del plano no se pueden asignar de forma inequívoca a los hablantes. El lip-sync se canceló antes de iniciarse y los créditos han sido reembolsados.",
          });
        await failLipSync({
          supabase,
          sceneId,
          // V507 — the customer-visible field is `clip_error`; give it the
          // actionable sentence instead of the raw router code.
          reason: fa4ContractualFailure.faceSizeLimited
            ? failMessage
            : fa4ContractualFailure.reason,
          userId,
          refundCredits: totalCost,
          syncApiKey,
        });

        return json(
          {
            error: fa4ContractualFailure.faceSizeLimited
              ? "plate_faces_too_small_for_lipsync"
              : "plate_identity_geometry_fail_closed",
            reason: fa4ContractualFailure.reason,
            detail: fa4ContractualFailure.detail,
            message: failMessage,
            refunded: totalCost,
          },
          422,
        );
      }

      if (!plateIdentityMap) try {
        plateIdentityMap = await resolvePlateFaceIdentities({
          supabase,
          sceneId,
          projectId: String((scene as any).project_id ?? ""),
          plateUrl: sourceClipUrl,
          plateWidth: plateDims.width,
          plateHeight: plateDims.height,
          midDurationSec: totalSec,
          characters,
          anchorUrl, // v156 — Anchor-First: AWS Rekognition runs on this image
          expectedFaceCount: speakers.length, // v184 — decouple from portrait resolver
          diag: plateIdentityDiag, // v436 — explicit null-reason instrumentation
        });
      } catch (err) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} plate-identity resolve threw: ${(err as Error)?.message}`,
        );
      }

    }
    if (plateIdentityMap && plateIdentityMap.faces.length > 0) {
      // FA-4 Face-Candidate Fix — when the v278 router produced this map, the
      // assignment is already sanity-filtered and globally bijective
      // (Contract A + B). All legacy authoritative selection paths (v183
      // bridge, byIdRanked confidence ranking, v277 first-match lock,
      // unlabeled fallback) are neutralised for that case: they may only act
      // as diagnostics, never override geometry.
      const fa4GeometryAuthoritative =
        (plateIdentityMap as any)?.assignmentLockSource === "v278_hungarian_plate_router";
      if (fa4GeometryAuthoritative) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} fa4_geometry_authoritative faces=${plateIdentityMap.faces.length} ` +
          `resolved=${plateIdentityMap.resolvedCount} — legacy label paths are diagnostics only`,
        );
      }
      // v166 — Anchor-Identity Slot Bridge.

      // If the plate-identity step could not label faces (Gemini probe failed
      // or resolvedCount=0), but the anchor faceMap KNOWS the characterId of
      // every visual slot (sorted L→R), bridge anchor_slot → plate_slot by
      // position. Both detectors sort faces left→right; for N detected faces
      // matching N anchor slots, slot i on plate IS slot i on anchor.
      // Without this bridge, the legacy code falls back to
      // `unlabeled.find(f => f.slot === idx)` where `idx` is the SCRIPT order,
      // which has no relation to visual position → wrong speaker → wrong face
      // animated. (DB-confirmed root cause of "Sprecher 3 wurde von Sprecher 1
      // gesprochen" in scene 0b0b7f78… on 2026-06-21.)
      const anchorFaces = Array.isArray((faceMap as any)?.faces)
        ? ((faceMap as any).faces as Array<{ slotIndex?: number; characterId?: string | null }>)
        : [];
      const anchorHasIdentities =
        anchorFaces.length > 0 &&
        anchorFaces.every((f) => typeof f?.characterId === "string" && (f.characterId as string).length > 0);
      // v183 — Bridge auch bei Ungleichheit: greift solange der Anchor mindestens
      // so viele identifizierte Faces hat wie er Plate-Faces sieht. Damit greift
      // die Bridge auch wenn die HH/Hailuo-Plate mehr Gesichter zeigt als der
      // Anchor kannte (Statisten, Reflexionen). Zuweisung bleibt Visual-L→R,
      // begrenzt auf die Anzahl der Anchor-Slots — der Rest bleibt `unlabeled`.
      if (
        !fa4GeometryAuthoritative &&
        anchorHasIdentities &&
        anchorFaces.length >= 1 &&
        anchorFaces.length <= plateIdentityMap.faces.length &&
        plateIdentityMap.faces.some((f) => !f.characterId)
      ) {
        const platesByVisual = [...plateIdentityMap.faces].sort((a, b) => a.slot - b.slot);
        const anchorByVisual = [...anchorFaces].sort(
          (a, b) => Number(a.slotIndex ?? 0) - Number(b.slotIndex ?? 0),
        );
        const bridgeLimit = Math.min(anchorByVisual.length, platesByVisual.length);
        for (let visualIdx = 0; visualIdx < bridgeLimit; visualIdx++) {
          const pf = platesByVisual[visualIdx];
          if (!pf.characterId) {
            const cid = anchorByVisual[visualIdx]?.characterId ?? null;
            if (cid) {
              pf.characterId = String(cid);
              (pf as any).matchConfidence = 0.85;
            }
          }
        }
        // v222 — Bridge writes characterId onto faces but the original
        // resolvedCount was computed BEFORE the bridge ran. Recompute so
        // downstream guards (haveBboxUrlPathForEdge, preclip eligibility,
        // v107 hard-preclip enforcement, snapshot persistence) see the true
        // number of identified faces. Root cause of DB-verified scene
        // 7d45c852 (2026-07-10): 4 bridged faces, resolvedCount stuck at 0,
        // pipeline fell back to `bbox-url-pro` full-plate single job → only
        // speakers 1 & 2 (left half) lip-synced, 3 & 4 stayed silent.
        plateIdentityMap.resolvedCount = plateIdentityMap.faces.filter(
          (f) => !!f.characterId,
        ).length;
        const partial = anchorByVisual.length < platesByVisual.length ? "_partial" : "";
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v183_anchor_identity_slot_bridge${partial} bridged=${plateIdentityMap.faces.filter((f) => f.characterId).length}/${plateIdentityMap.faces.length} anchor_ids=${anchorByVisual.map((f) => f.characterId).join(",")} resolvedCount_after_bridge=${plateIdentityMap.resolvedCount}`,
        );
      }

      // v170 — Strip variant-id prefixes (outfit:/pose:/wardrobe:/vibe:/prop:/look:)
      // before matching. The Saved-Outfit-Look feature stores speakers with a
      // composite mention-key like `outfit:<base-uuid>`, but plate-face-identity
      // labels faces with the raw `brand_character.id`. Without normalization
      // every single-speaker scene with a saved outfit fell into the v166 hard-
      // fail and showed "kein eindeutiges Gesicht in der Szene".
      const stripIdPrefix = (id?: string | null) =>
        String(id ?? "")
          .toLowerCase()
          .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");

      // v183 — Character-ID-First mit Confidence-Ranking.
      // Statt einer flachen Map<cid, PlateFace> (die Duplikate stillschweigend
      // überschreibt) sammeln wir pro stripped-cid ALLE Kandidaten-Faces,
      // absteigend sortiert nach matchConfidence. So kann bei einer Rekognition-
      // Kollision (zwei Faces mit demselben Char-Label — Reflexion, Statist)
      // der zweite Speaker auf den nächstbesten Kandidaten fallen statt auf
      // dieselbe Box wie Speaker 0.
      const byIdRanked = new Map<string, PlateIdentityFace[]>();
      for (const f of plateIdentityMap.faces) {
        if (!f.characterId) continue;
        const key = stripIdPrefix(f.characterId);
        if (!byIdRanked.has(key)) byIdRanked.set(key, []);
        byIdRanked.get(key)!.push(f);
      }
      for (const arr of byIdRanked.values()) {
        arr.sort((a, b) => {
          const ca = Number((a as any).matchConfidence ?? 0);
          const cb = Number((b as any).matchConfidence ?? 0);
          return cb - ca;
        });
      }

      // Slot-fallback for any face the identity step couldn't label.
      // v129.20: for single-speaker scenes sort unlabeled faces by bbox
      // area (largest first) so spurious detections (mirror, background
      // person) lose to the actual subject.
      const unlabeledPool = plateIdentityMap.faces.filter((f) => !f.characterId);
      if (speakers.length === 1 && unlabeledPool.length > 1) {
        unlabeledPool.sort((a, b) => {
          const areaA = (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
          const areaB = (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
          return areaB - areaA;
        });
      } else if (speakers.length >= 2 && unlabeledPool.length > 1) {
        // Multi-speaker unlabeled fallback läuft Visual-L→R (nach f.slot).
        unlabeledPool.sort((a, b) => a.slot - b.slot);
      }

      // v183 — Cast-Konfig-Guard: mehrere Speaker mit derselben stripped
      // character_id sind ein echter Konfig-Fehler (nicht auto-fixbar).
      // Wir loggen es hier laut; der Preflight-Block weiter unten refunded
      // dann mit der v183_cast_duplicate-Meldung.
      const cidToSpeakerIdxs = new Map<string, number[]>();
      speakers.forEach((sp, idx) => {
        const cid = stripIdPrefix(sp.character_id);
        if (!cid) return;
        if (!cidToSpeakerIdxs.has(cid)) cidToSpeakerIdxs.set(cid, []);
        cidToSpeakerIdxs.get(cid)!.push(idx);
      });
      const castDupCids: string[] = [];
      for (const [cid, idxs] of cidToSpeakerIdxs.entries()) {
        if (idxs.length >= 2) castDupCids.push(`${cid}=[${idxs.join(",")}]`);
      }
      if (castDupCids.length > 0) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v183_cast_duplicate_character_id ${castDupCids.join(" ")} — ` +
          `two or more speakers share the same base character; this cannot resolve to distinct plate faces`,
        );
      }

      // Uniqueness-Enforcement: dieselbe Plate-Face darf nie zwei Sprechern
      // zugewiesen werden. Wir tracken pro (Plate-Face) einen stabilen Key.
      const faceKey = (f: PlateIdentityFace): string =>
        `${f.slot}|${f.bbox[0]},${f.bbox[1]},${f.bbox[2]},${f.bbox[3]}`;
      const assignedFaceKeys = new Set<string>();
      const canFallbackUnlabeled =
        plateIdentityMap.faces.length >= speakers.length;
      const anchorLockedCids = new Set(
        Object.values(anchorRekLockSeed ?? {})
          .map((cid) => stripIdPrefix(cid))
          .filter(Boolean),
      );
      const anchorRekFacesByCid = new Map<string, PlateIdentityFace>();
      if (anchorRekLockSeed) {
        for (const face of plateIdentityMap.faces) {
          const faceCid = stripIdPrefix((face as any)?.characterId);
          if (faceCid && anchorLockedCids.has(faceCid) && !anchorRekFacesByCid.has(faceCid)) {
            anchorRekFacesByCid.set(faceCid, face);
          }
        }
      }

      // FA-4 — geometry-authoritative selection map: characterId → the single
      // plate face the bijective assignment gave that character.
      const fa4FaceByCid = new Map<string, PlateIdentityFace>();
      if (fa4GeometryAuthoritative) {
        for (const face of plateIdentityMap.faces) {
          const fcid = stripIdPrefix((face as any)?.characterId);
          if (fcid && !fa4FaceByCid.has(fcid)) fa4FaceByCid.set(fcid, face);
        }
      }

      speakers.forEach((sp, idx) => {
        const cid = stripIdPrefix(sp.character_id);
        let plateFace: PlateIdentityFace | undefined;
        let source = "plate-identity";

        // FA-4 — bijective geometry result wins. No label ranking, no
        // first-match, no unlabeled fallback for this path.
        if (fa4GeometryAuthoritative && cid) {
          const geoFace = fa4FaceByCid.get(cid);
          if (geoFace && !assignedFaceKeys.has(faceKey(geoFace))) {
            plateFace = geoFace;
            source = "fa4-geometry-bijection";
          } else {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} fa4_geometry_slot_unresolved ` +
              `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid} — slot stays empty (fail-closed)`,
            );
          }
        }

        // v277 — Rekognition-Lock is authoritative per slot, even when only
        // partial (e.g. 3/4). Only unresolved slots may fall through to the
        // older cid/geometry fallback paths.
        const lockedCid = fa4GeometryAuthoritative
          ? ""
          : stripIdPrefix(anchorRekLockSeed?.[String(idx)]);

        if (lockedCid) {
          const lockedFace = anchorRekFacesByCid.get(lockedCid);
          if (lockedFace && !assignedFaceKeys.has(faceKey(lockedFace))) {
            plateFace = lockedFace;
            source = anchorRekLockComplete
              ? "v277-anchor-rekognition-complete"
              : "v277-anchor-rekognition-partial";
          } else {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v277_anchor_lock_face_missing ` +
              `speaker=${sp.speaker ?? `idx${idx}`} cid=${lockedCid} — falling back for this slot only`,
            );
          }
        }

        // 1) Top-Ranked Face für cid nehmen, das noch nicht vergeben ist.
        if (cid && !fa4GeometryAuthoritative) {
          const ranked = byIdRanked.get(cid);
          if (!plateFace && ranked && ranked.length > 0) {
            for (const cand of ranked) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = ranked.indexOf(cand) === 0
                  ? "plate-identity-cid-primary"
                  : "plate-identity-cid-secondary";
                break;
              }
            }
            if (!plateFace) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v183_identity_collision ` +
                `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid} ranked=${ranked.length} ` +
                `reason=all_ranked_already_assigned`,
              );
            }
          }
        }

        // 2) Unlabeled-Fallback per Visual-L→R (nur wenn genug Faces vorhanden).
        if (!plateFace && !fa4GeometryAuthoritative) {
          if (speakers.length === 1 && unlabeledPool.length > 0) {
            for (const cand of unlabeledPool) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = "single-speaker-largest-face";
                console.log(
                  `[compose-dialog-segments] scene=${sceneId} v170_single_speaker_largest_face ` +
                  `character_id=${cid || "?"} unlabeled_plate_faces=${unlabeledPool.length}`,
                );
                break;
              }
            }
          } else if (canFallbackUnlabeled && unlabeledPool.length > 0) {
            for (const cand of unlabeledPool) {
              const k = faceKey(cand);
              if (!assignedFaceKeys.has(k)) {
                plateFace = cand;
                source = "v183-unlabeled-fallback";
                console.log(
                  `[compose-dialog-segments] scene=${sceneId} v183_unlabeled_fallback ` +
                  `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid || "?"} ` +
                  `plate_face_slot=${cand.slot}`,
                );
                break;
              }
            }
          }
          if (!plateFace) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v183_identity_collision ` +
              `speaker=${sp.speaker ?? `idx${idx}`} cid=${cid || "?"} ` +
              `plate_face_count=${plateIdentityMap.faces.length} speakers=${speakers.length} ` +
              `reason=exhausted — slot bleibt leer`,
            );
          }
        }

        if (plateFace) {
          assignedFaceKeys.add(faceKey(plateFace));
          // v155 — Prefer the Rekognition-derived mouth landmark over the
          // bbox center.
          const mouth = (plateFace as any).mouth as [number, number] | undefined;
          if (Array.isArray(mouth) && Number.isFinite(mouth[0]) && Number.isFinite(mouth[1])) {
            speakerCoords[idx] = [mouth[0], mouth[1]];
            const dy = mouth[1] - plateFace.center[1];
            console.log(
              `[compose-dialog-segments] v155_mouth_landmark_used speaker=${idx} ` +
              `mouth=[${mouth[0]},${mouth[1]}] bbox_center=[${plateFace.center[0]},${plateFace.center[1]}] dy=${dy}`,
            );
          } else {
            speakerCoords[idx] = [plateFace.center[0], plateFace.center[1]];
          }
          speakerPlateBboxes[idx] = plateFace.bbox;
          if (Array.isArray((plateFace as any).mouth)) {
            const mLm = (plateFace as any).mouth as [number, number];
            if (Number.isFinite(mLm[0]) && Number.isFinite(mLm[1])) {
              speakerPlateMouths[idx] = [mLm[0], mLm[1]];
            }
          }
          coordSources[idx] = source;
        }
      });
      plateHydrationSource = speakerPlateBboxes.every(Boolean) ? "live" : "missing";
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v183_plate_identity_mapping faces=${plateIdentityMap.faces.length} ` +
        `resolved=${plateIdentityMap.resolvedCount}/${speakers.length} assigned=${assignedFaceKeys.size}/${speakers.length} cast_dup=${castDupCids.length} cached=${plateIdentityMap.cached}`,
      );

      // ── v185 — Anchor-First Plate-Bbox Sanity Gate ──────────────────────
      // For each speaker: the assigned plate bbox MUST contain that
      // speaker's anchor coord (with a small in-frame tolerance). If the
      // anchor coord lies outside the bbox, the plate detector produced a
      // false-positive (spurious detection on background / non-face pixels)
      // that v183 confidence-ranking then confidently mislabeled as this
      // speaker. Repairing this here avoids sending Sync.so a bbox that
      // targets a whiteboard / hand / prop, which is what triggered the
      // `generation_input_face_selection_invalid` REJECTED responses on
      // real 3-speaker Hailuo plates.
      //
      // Repair strategy (no auto-detect, deterministic per v169 §5):
      //   1) Compute the median face bbox size (w, h) from the OTHER
      //      speakers whose plate bbox validly contains their anchor coord.
      //      Fallback to 8% width × 15% height of the plate when no valid
      //      sibling exists.
      //   2) Center that median box on the anchor coord for the bad slot.
      //   3) Rewrite `speakerPlateBboxes[i]`, `speakerCoords[i]`, and
      //      `speakerPlateMouths[i]` from the anchor. Log a clear repair.
      // The repaired bbox is anchor-native so it will always overlap the
      // real face in the Hailuo plate (i2v preserves anchor composition
      // within ±10 % drift). Sync.so's own detector will accept it.
      if (plateDims && speakers.length >= 1) {
        const contains = (
          box: [number, number, number, number],
          pt: [number, number],
          padPx: number,
        ) => {
          const [bx1, by1, bx2, by2] = box;
          const [px, py] = pt;
          return (
            px >= bx1 - padPx &&
            px <= bx2 + padPx &&
            py >= by1 - padPx &&
            py <= by2 + padPx
          );
        };
        // v189 — Widened default pad from 8% → 20% of min plate dim.
        // Hailuo i2v routinely drifts anchor composition by 10-15% vs the
        // rendered plate (DB-confirmed scene 11df951d: Samuel anchor
        // x=461, real plate x=652, drift 9.9% of 1924-wide plate). At
        // 8% pad the anchor coord fell OUTSIDE the correct plate bbox and
        // v185 repaired to the WRONG (anchor-space) coord, destroying
        // the correctly-detected plate-native mouth. 20% pad accepts
        // that natural drift while still catching truly bogus plate
        // detections (whiteboard/hand false-positives sit >30% off).
        const padPx = Math.round(Math.min(plateDims.width, plateDims.height) * 0.20);

        // v239 — Detector-First Trust Gate.
        //
        // Prior versions (v185/v189) only trusted a slot when AWS Rekognition
        // returned matchConfidence >= 0.60. Any slot with lower or missing
        // matchConfidence fell through to the anchor-in-bbox test and was
        // frequently overwritten by anchor-space repair coords — destroying
        // correctly detected plate bboxes for both N=1 (mouth-closed, wrong
        // region) and N>=2 (only low-confidence speakers kipped, high-conf
        // speakers stayed correct → "speakers 3+4 broken while 1+2 work").
        //
        // v239 makes the detector itself authoritative: a slot is trusted
        // when EITHER the native detector confidence is high (>= 0.70) OR
        // the AWS cross-check confidence is at least 0.55. Non-trusted
        // slots are no longer judged by anchor overlap — that test punishes
        // legitimate Hailuo drift. Instead we apply objective sanity
        // criteria on the bbox itself: in-plate, plausible area, plausible
        // aspect ratio. Only bboxes that fail those objective checks are
        // treated as repair candidates.
        const DETECTOR_TRUST_THRESHOLD = 0.70;
        const IDENTITY_TRUST_THRESHOLD = 0.55;
        const plateIdentityFaces = plateIdentityMap?.faces ?? [];
        const trustedSlots: number[] = [];
        const trustReasons: Record<number, string> = {};
        speakers.forEach((_sp, i) => {
          const box = speakerPlateBboxes[i];
          if (!box) return;
          const bx1 = box[0], by1 = box[1], bx2 = box[2], by2 = box[3];
          const match = plateIdentityFaces.find((f) => {
            if (!Array.isArray(f.bbox) || f.bbox.length !== 4) return false;
            return (
              Math.abs(f.bbox[0] - bx1) < 4 &&
              Math.abs(f.bbox[1] - by1) < 4 &&
              Math.abs(f.bbox[2] - bx2) < 4 &&
              Math.abs(f.bbox[3] - by2) < 4
            );
          });
          const detConf = Number((match as any)?.confidence);
          const idConf = Number((match as any)?.matchConfidence);
          if (Number.isFinite(detConf) && detConf >= DETECTOR_TRUST_THRESHOLD) {
            trustedSlots.push(i);
            trustReasons[i] = `detector=${detConf.toFixed(2)}`;
            return;
          }
          if (Number.isFinite(idConf) && idConf >= IDENTITY_TRUST_THRESHOLD) {
            trustedSlots.push(i);
            trustReasons[i] = `identity=${idConf.toFixed(2)}`;
            return;
          }
          // Legacy source-tag fallback — keep the previous whitelist so
          // slots that carry an explicit identity-assign tag stay trusted
          // even if the plate face record lacks a confidence field.
          const sourceTag = coordSources[i] ?? "";
          const identityAssigned =
            sourceTag === "identity" ||
            sourceTag.startsWith("v183-") ||
            sourceTag === "single-speaker-largest-face" ||
            sourceTag === "plate-persisted-mouth" ||
            sourceTag === "plate-persisted";
          if (identityAssigned && Number.isFinite(idConf) && idConf >= 0.60) {
            trustedSlots.push(i);
            trustReasons[i] = `legacy=${idConf.toFixed(2)}`;
          }
        });

        // v239 / FA-4 Contract D — objective bbox sanity check. There is
        // exactly ONE canonical owner of the thresholds: `plateFaceSanity()`
        // in `_shared/plate-face-candidates.ts` (area 0.003..0.25, aspect
        // 0.4..2.5, degenerate, out_of_plate with the 5% in-plate tolerance).
        // This local helper is only a thin wrapper that preserves the existing
        // reason formatting used downstream.
        const bboxSanity = (
          box: [number, number, number, number],
        ): { ok: boolean; reason: string } => {
          const s = plateFaceSanity(box, plateDims);
          if (s.ok) return { ok: true, reason: "ok" };
          if (s.reason === "aspect_invalid") {
            return { ok: false, reason: `aspect=${s.aspect.toFixed(2)}` };
          }
          return { ok: false, reason: s.reason };
        };


        const goodSlots: number[] = [];
        const badSlots: number[] = [];
        const badReasons: Record<number, string> = {};
        speakers.forEach((_sp, i) => {
          const box = speakerPlateBboxes[i];
          const anchor = anchorSpeakerCoords[i];
          if (!box || !anchor) return;
          // FA-4 Contract D — sanity ALWAYS runs after assignment. Trust /
          // confidence is diagnostics only and can no longer skip the
          // objective geometry check (root cause of the S11 tiny-box pass).
          const sanity = bboxSanity(box);
          if (sanity.ok) {
            goodSlots.push(i);
          } else {
            badSlots.push(i);
            badReasons[i] = trustedSlots.includes(i)
              ? `${sanity.reason}_despite_trust`
              : sanity.reason;
          }
        });


        console.log(
          `[compose-dialog-segments] scene=${sceneId} v239_repair_gate ` +
          `trusted=${trustedSlots.length}/${speakers.length} ` +
          `sanity_ok=${goodSlots.length - trustedSlots.length}/${speakers.length - trustedSlots.length} ` +
          `repaired=${badSlots.length}/${speakers.length} ` +
          `trust_reasons=${JSON.stringify(trustReasons)} ` +
          `bad_reasons=${JSON.stringify(badReasons)} ` +
          `det_threshold=${DETECTOR_TRUST_THRESHOLD} id_threshold=${IDENTITY_TRUST_THRESHOLD}`,
        );
        // Legacy log line kept for dashboards that grep on the old tag.
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v189_identity_trust_gate ` +
          `trusted=${trustedSlots.length}/${speakers.length} good=${goodSlots.length} bad=${badSlots.length} ` +
          `pad_pct=20 threshold=${IDENTITY_TRUST_THRESHOLD}`,
        );

        if (badSlots.length > 0) {
          const goodBoxes = goodSlots
            .map((i) => speakerPlateBboxes[i]!)
            .filter(Boolean);
          const median = (arr: number[]) => {
            const s = [...arr].sort((a, b) => a - b);
            const m = Math.floor(s.length / 2);
            return s.length === 0
              ? 0
              : s.length % 2
                ? s[m]
                : Math.round((s[m - 1] + s[m]) / 2);
          };
          const medW = goodBoxes.length > 0
            ? median(goodBoxes.map((b) => b[2] - b[0]))
            : Math.round(plateDims.width * 0.08);
          const medH = goodBoxes.length > 0
            ? median(goodBoxes.map((b) => b[3] - b[1]))
            : Math.round(plateDims.height * 0.15);
          const halfW = Math.max(24, Math.round(medW / 2));
          const halfH = Math.max(24, Math.round(medH / 2));

          for (const i of badSlots) {
            const anchor = anchorSpeakerCoords[i]!;
            const before = speakerPlateBboxes[i];
            const cx = Math.max(halfW, Math.min(plateDims.width - halfW, anchor[0]));
            const cy = Math.max(halfH, Math.min(plateDims.height - halfH, anchor[1]));
            const repaired: [number, number, number, number] = [
              cx - halfW,
              cy - halfH,
              cx + halfW,
              cy + halfH,
            ];
            speakerPlateBboxes[i] = repaired;
            speakerCoords[i] = [cx, cy];
            speakerPlateMouths[i] = [cx, cy];
            coordSources[i] = "v185-anchor-repair";
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v185_anchor_plate_bbox_repair ` +
              `speaker=${speakers[i]?.speaker_name ?? `idx${i}`} anchor=[${anchor[0]},${anchor[1]}] ` +
              `bad_bbox=${JSON.stringify(before)} repaired=${JSON.stringify(repaired)} ` +
              `median_face=${medW}x${medH} good_slots=${goodSlots.length}/${speakers.length}`,
            );
          }
        } else {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v185_anchor_plate_bbox_gate ok=${goodSlots.length}/${speakers.length} — all plate bboxes trusted or contain anchor`,
          );
        }
      }


      // v183 — Cast-Duplicate früh-refund. Wenn zwei Sprecher denselben
      // stripped character_id verwenden, kann die Pipeline das nicht auflösen.
      // Wir refunden hier bevor der generische Preflight-Block feuert, mit
      // einer klaren Meldung.
      if (
        castDupCids.length > 0 &&
        !isAdvance &&
        !isRetry &&
        speakers.length >= 2
      ) {
        const firstDup = castDupCids[0];
        const dupSpeakerIdxs = firstDup
          .split("=")[1]
          .replace(/[\[\]]/g, "")
          .split(",")
          .map((s) => Number(s.trim()));
        const nameA =
          speakers[dupSpeakerIdxs[0]]?.speaker_name ??
          speakers[dupSpeakerIdxs[0]]?.speaker ??
          `Speaker ${dupSpeakerIdxs[0] + 1}`;
        const nameB =
          speakers[dupSpeakerIdxs[1]]?.speaker_name ??
          speakers[dupSpeakerIdxs[1]]?.speaker ??
          `Speaker ${dupSpeakerIdxs[1] + 1}`;
        const msg =
          `Lip-Sync abgebrochen: ${nameA} und ${nameB} verweisen auf denselben Basis-Charakter. ` +
          `Bitte einem der beiden einen anderen Character zuweisen (oder die Rollen zusammenfassen). ` +
          `Credits wurden zurückerstattet.`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v183_cast_duplicate_character_id_refund ${firstDup} — refunding ${totalCost} credits`,
        );
        const alreadyRefundedCD = !!(existing as any)?.refunded;
        if (!alreadyRefundedCD) {
          try {
            const { data: wCD } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wCD?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (e) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v183 cast-dup refund failed: ${(e as Error)?.message}`,
            );
          }
        }
        // ── V510-P0 — a preflight gate, re-entered by every `advance` and
        // `retry` invocation. The write looked root-only, but
        // `mergeDialogShots` is a shallow spread over the scene read at
        // entry, so the full-column UPDATE shipped `existing.passes` with
        // it — and on a re-entrant invocation the siblings in that snapshot
        // already hold bound job ids. The root merge now happens server-side.
        const v510Root2: Record<string, unknown> = {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
          refunded: true,
          error: "v183_cast_duplicate_character_id",
          finished_at: new Date().toISOString(),
        };
        await v510Terminalize({
          passIdx: null,
          passPatch: null,
          rootPatch: v510Root2,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: msg,
          },
          reason: String(v510Root2.error ?? "terminal"),
        });
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED", error_class: "v183_cast_duplicate_character_id",
          error_message: firstDup,
          meta: {
            speakers: speakers.length,
            duplicate_cids: castDupCids,
            refunded_credits: alreadyRefundedCD ? 0 : totalCost,
            compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
          },
        });
        return json(
          {
            error: "v183_cast_duplicate_character_id",
            duplicates: castDupCids,
            refunded: alreadyRefundedCD ? 0 : totalCost,
          },
          422,
        );
      }
    } else if (speakers.length >= 2 && !isAdvance) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} plate-identity unavailable — using anchor-rescale coords (may drift)`,
      );
    }
    // v158 — Persist a per-speaker mouth array directly on the snapshot so
    // advance/retry passes can rehydrate Sync.so face-target boxes without
    // re-running plate-face detection. faces[].mouth still exists for the
    // diagnostic path, but the parallel `mouths[i]` array is the canonical
    // source on the persisted hydration branch above.
    // v242 — Build the Character-Assignment-Lock. When we have a live
    // plate-identity result AND every speaker got a plate-face by
    // characterId (source starts with "plate-identity-cid"), lock the
    // {speakerIdx → characterId} mapping so future rerenders read it
    // BEFORE any positional data. Existing lock is preserved when the
    // current run couldn't produce a fresh, clean assignment.
    const stripLockPrefix = (id?: string | null) =>
      String(id ?? "").toLowerCase().replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
    const existingLock: Record<string, string> =
      (persistedPlateIdentity as any)?.assignmentLock &&
      typeof (persistedPlateIdentity as any).assignmentLock === "object"
        ? { ...(persistedPlateIdentity as any).assignmentLock }
        : {};
    let freshLock: Record<string, string> | null = null;
    if (
      !anchorRekLockComplete &&
      plateIdentityMap &&
      plateIdentityMap.faces.length > 0 &&
      speakers.every((sp) => !!stripLockPrefix(sp.character_id)) &&
      coordSources.every((s) => typeof s === "string" && s.startsWith("plate-identity-cid"))
    ) {
      freshLock = {};
      speakers.forEach((sp, idx) => {
        const cid = stripLockPrefix(sp.character_id);
        if (cid) freshLock![String(idx)] = cid;
      });
    }
    const mergedFallbackLock = { ...(freshLock ?? existingLock) };
    const finalAssignmentLock = anchorRekLockSeed
      ? { ...mergedFallbackLock, ...anchorRekLockSeed }
      : mergedFallbackLock;
    const lockSource = anchorRekLockComplete
      ? "v277_anchor_rekognition_complete"
      : anchorRekLockPartial
        ? "v277_anchor_rekognition_partial"
        : freshLock
          ? "v242_fresh"
          : "existing";
    const v153PlateIdentitySnapshot = {
      version: "v242" as const,
      dims: plateDims,
      bboxes: speakerPlateBboxes,
      mouths: speakerPlateMouths,
      faces: plateIdentityMap?.faces ?? persistedPlateIdentity?.faces ?? [],
      resolvedCount: plateIdentityMap?.resolvedCount ?? persistedPlateIdentity?.resolvedCount ?? 0,
      cached: plateIdentityMap?.cached ?? persistedPlateIdentity?.cached ?? false,
      sourceClipUrl,
      hydratedAt: new Date().toISOString(),
      assignmentLock: finalAssignmentLock,
      assignmentLockSource: lockSource,
    };
    console.warn(
      `[compose-dialog-segments] scene=${sceneId} v277_assignment_lock ` +
      `source=${lockSource} locked_slots=${Object.keys(finalAssignmentLock).length}/${speakers.length}`,
    );
    console.warn(
      `[compose-dialog-segments] scene=${sceneId} v158_plate_hydration source=${plateHydrationSource} speakers=${speakers.length} boxes=${speakerPlateBboxes.filter(Boolean).length}/${speakers.length} mouths=${speakerPlateMouths.filter(Boolean).length}/${speakers.length} advance=${isAdvance} retry=${isRetry}`,
    );

    // ── v129.20 — Single-speaker no-face hard refund ─────────────────────
    // If Hailuo rendered a plate with zero detectable faces (e.g. subject
    // walked out of frame, extreme back-shot), anchor-rescale would just
    // hand Sync.so a coordinate pointing at empty pixels. Refund and ask
    // the user to re-render the plate instead.
    if (
      !isAdvance &&
      !isRetry &&
      speakers.length === 1 &&
      plateIdentityMap &&
      plateIdentityMap.faces.length === 0
    ) {
      const reason = "plate_face_missing_single_speaker";
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v129.20_single_speaker_no_face — refunding ${totalCost} credits`,
      );
      await failLipSync({
        supabase,
        sceneId,
        reason,
        userId,
        refundCredits: totalCost,
        syncApiKey,
      });
      return json(
        {
          error: "plate_face_missing_single_speaker",
          message: "Plate enthält kein erkennbares Gesicht. Bitte Szene neu rendern.",
          refunded: totalCost,
        },
        422,
      );
    }

    // ── v153.1 — Unified Pre-Flight Hard-Fail (N=1..4) ──────────────────
    // SINGLE-PATH-POLICY: jeder Sprecher MUSS eine eigene plate-native Box
    // bekommen — gilt einheitlich für 1, 2, 3 oder 4 Sprecher. Wenn nicht,
    // würde der bbox-url-pro Pfad mehrere Sprecher auf dieselbe Box mappen
    // (N>=2: "Sprecher 1 spricht für 1+2"-Bug) oder bei N=1 still auf eine
    // synthetische Coords-Box zurückfallen. Lieber sofort hart abbrechen
    // + refund + klare Meldung, statt 20 min später ein falsch gemixtes
    // Video zu liefern.
    if (
      speakers.length >= 1
    ) {
      const missingBoxIdx: number[] = [];
      const plateDimsMissing = !plateDims;
      for (let i = 0; i < speakers.length; i++) {
        const b = speakerPlateBboxes?.[i];
        if (!Array.isArray(b) || b.length !== 4) missingBoxIdx.push(i);
      }
      // Zusätzlich: distinkte Boxen verlangen (zwei Speaker dürfen nicht
      // auf exakt dieselben Pixel mappen). Toleranz: center-Distanz <8px.
      const boxes = speakerPlateBboxes
        .map((b, i) => (Array.isArray(b) && b.length === 4 ? { i, b } : null))
        .filter(Boolean) as Array<{ i: number; b: number[] }>;
      const dupeIdx: number[] = [];
      for (let a = 0; a < boxes.length; a++) {
        for (let c = a + 1; c < boxes.length; c++) {
          const ca = [(boxes[a].b[0] + boxes[a].b[2]) / 2, (boxes[a].b[1] + boxes[a].b[3]) / 2];
          const cc = [(boxes[c].b[0] + boxes[c].b[2]) / 2, (boxes[c].b[1] + boxes[c].b[3]) / 2];
          const dx = ca[0] - cc[0];
          const dy = ca[1] - cc[1];
          if (Math.hypot(dx, dy) < 8) {
            dupeIdx.push(boxes[c].i);
          }
        }
      }
      if (plateDimsMissing || missingBoxIdx.length > 0 || dupeIdx.length > 0) {
        const reason = plateDimsMissing
          ? "v153_plate_dims_missing"
          : missingBoxIdx.length > 0
          ? `v153_plate_box_missing_for_speakers=[${missingBoxIdx.join(",")}]`
          : `v153_plate_box_duplicate_for_speakers=[${dupeIdx.join(",")}]`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v153.2_preflight_BLOCK ${reason} hydration=${plateHydrationSource} — refunding ${totalCost} credits, no dispatch`,
        );
        const alreadyRefundedPF = !!(existing as any)?.refunded;
        if (!alreadyRefundedPF) {
          try {
            const { data: wPF } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wPF?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (e) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v153 preflight refund failed: ${(e as Error)?.message}`,
            );
          }
        }
        // ── V510-P0 — a preflight gate, re-entered by every `advance` and
        // `retry` invocation. The write looked root-only, but
        // `mergeDialogShots` is a shallow spread over the scene read at
        // entry, so the full-column UPDATE shipped `existing.passes` with
        // it — and on a re-entrant invocation the siblings in that snapshot
        // already hold bound job ids. The root merge now happens server-side.
        const v510Root3: Record<string, unknown> = {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
          refunded: true,
          error: reason,
          finished_at: new Date().toISOString(),
        };
        await v510Terminalize({
          passIdx: null,
          passPatch: null,
          rootPatch: v510Root3,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: (() => {
            if (speakers.length === 1) {
            return "Lip-Sync abgebrochen: für den Sprecher konnte kein eindeutiges Gesicht in der Szene gefunden werden. " +
            "Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass der Sprecher frontal und unverdeckt sichtbar ist.";
            }
            // v183 — Sprecher-Namen einsetzen wenn Dup-Kollision.
            if (dupeIdx.length >= 1) {
            const primaryIdx = boxes.find((_, a) =>
            boxes.some((__, c) =>
            c > a &&
            Math.hypot(
            (boxes[a].b[0] + boxes[a].b[2]) / 2 - (boxes[c].b[0] + boxes[c].b[2]) / 2,
            (boxes[a].b[1] + boxes[a].b[3]) / 2 - (boxes[c].b[1] + boxes[c].b[3]) / 2,
            ) < 8,
            ),
            )?.i ?? dupeIdx[0];
            const nameA =
            (speakers[primaryIdx] as any)?.speaker_name ??
            speakers[primaryIdx]?.speaker ??
            `Speaker ${primaryIdx + 1}`;
            const nameB =
            (speakers[dupeIdx[0]] as any)?.speaker_name ??
            speakers[dupeIdx[0]]?.speaker ??
            `Speaker ${dupeIdx[0] + 1}`;
            return `Lip-Sync abgebrochen: ${nameA} und ${nameB} wurden auf dasselbe Gesicht in der Szene gemappt. ` +
            `Bitte prüfen, ob im Cast identische Basis-Charaktere oder Saved-Outfit-Look-Varianten desselben Chars mehrfach vertreten sind — ` +
            `oder die Szene neu rendern, sodass alle Sprecher visuell klar getrennt und frontal sichtbar sind. Credits wurden zurückerstattet.`;
            }
            if (missingBoxIdx.length >= 1) {
            const names = missingBoxIdx.map(
            (i) =>
            (speakers[i] as any)?.speaker_name ??
            speakers[i]?.speaker ??
            `Speaker ${i + 1}`,
            );
            return `Lip-Sync abgebrochen: für ${names.join(", ")} konnte kein eindeutiges Gesicht in der Szene gefunden werden. ` +
            `Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass alle Sprecher frontal und unverdeckt sichtbar sind.`;
            }
            return "Lip-Sync abgebrochen: die einzelnen Sprecher konnten auf dem Video nicht eindeutig unterschieden werden " +
            "(jeder Sprecher braucht ein klar getrenntes Gesicht in der Szene). " +
            "Credits wurden zurückerstattet. Bitte die Szene neu rendern, sodass alle Sprecher frontal und getrennt sichtbar sind.";
            })(),
          },
          reason: String(v510Root3.error ?? "terminal"),
        });
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED", error_class: "v153_preflight_block",
          error_message: reason,
          meta: {
            speakers: speakers.length,
              plate_dims_missing: plateDimsMissing,
              plate_hydration_source: plateHydrationSource,
            missing_box_idx: missingBoxIdx,
            duplicate_box_idx: dupeIdx,
            plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
            plate_identity_faces: plateIdentityMap?.faces?.length ?? 0,
            refunded_credits: alreadyRefundedPF ? 0 : totalCost,
          },
        });
        return json(
          {
            error: "v153_preflight_block",
            reason,
            refunded: alreadyRefundedPF ? 0 : totalCost,
          },
          422,
        );
      }
    }



    // ── v133 — Identity-Ambiguity Hard-Fail (3+ speakers) ───────────────
    // Per-character probe + Hungarian assignment runs inside
    // resolvePlateFaceIdentities for N≥3. If the resulting mapping is
    // ambiguous (min-confidence < 0.55 OR margin < 0.15) AND the cross-
    // check Gemini call could neither confirm nor pinpoint a single swap,
    // refuse to dispatch — the alternative is a voice-swap (e.g. char 1
    // speaks with char 4's voice). Refund and surface a clear message.
    if (
      !isAdvance &&
      !isRetry &&
      speakers.length >= 3 &&
      plateIdentityMap &&
      (plateIdentityMap as any).ambiguous === true
    ) {
      const minConf = Number((plateIdentityMap as any).minConfidence ?? 0);
      const minMar = Number((plateIdentityMap as any).minMargin ?? 0);
      const method = String((plateIdentityMap as any).identityMethod ?? "unknown");
      const xc = String((plateIdentityMap as any).crossCheck ?? "skipped");
      console.error(
        `[compose-dialog-segments] scene=${sceneId} v133_identity_ambiguous method=${method} minConf=${minConf.toFixed(2)} minMargin=${minMar.toFixed(2)} crossCheck=${xc} — refunding ${totalCost} credits`,
      );
      await failLipSync({
        supabase,
        sceneId,
        reason: "identity_ambiguous_multi_speaker",
        userId,
        refundCredits: totalCost,
        syncApiKey,
      });
      const userMsg =
        `Lip-Sync wurde nicht gestartet: Die Charaktere auf dem gerenderten Scene-Clip ` +
        `sind nicht eindeutig voneinander unterscheidbar (Identitäts-Confidence ${(minConf * 100).toFixed(0)}%, Margin ${(minMar * 100).toFixed(0)}%). ` +
        `Eine automatische Zuweisung birgt das Risiko, dass Stimmen vertauscht werden. ` +
        tl({ de: `Bitte die Szene neu rendern — mit deutlich unterschiedlichen Posen, Kleidung oder Kamera-Winkeln pro Charakter, sodass jede Person klar identifizierbar ist. `, en: `Please re-render the scene — with distinctly different poses, clothing, or camera angles per character, so that each person is clearly identifiable.`, es: `Por favor, vuelve a renderizar la escena — con poses, ropa o ángulos de cámara claramente diferentes por personaje, para que cada persona sea claramente identificable.` }) +
        `Credits wurden vollständig zurückerstattet.`;
      try {
        // ── V510-P0 — a preflight gate, re-entered by every `advance` and
        // `retry` invocation. The write looked root-only, but
        // `mergeDialogShots` is a shallow spread over the scene read at
        // entry, so the full-column UPDATE shipped `existing.passes` with
        // it — and on a re-entrant invocation the siblings in that snapshot
        // already hold bound job ids. The root merge now happens server-side.
        const v510Root4: Record<string, unknown> = {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: 0,
          refunded: true,
          error: `v133_identity_ambiguous:method=${method},minConf=${minConf.toFixed(2)},minMargin=${minMar.toFixed(2)},crossCheck=${xc}`,
          v133_identity_audit: {
          method,
          minConfidence: minConf,
          minMargin: minMar,
          crossCheck: xc,
          resolvedCount: plateIdentityMap.resolvedCount,
          faces: plateIdentityMap.faces.length,
          scoreMatrix: (plateIdentityMap as any).scoreMatrix ?? null,
          },
          finished_at: new Date().toISOString(),
        };
        await v510Terminalize({
          passIdx: null,
          passPatch: null,
          rootPatch: v510Root4,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: userMsg,
          },
          reason: String(v510Root4.error ?? "terminal"),
        });
      } catch (_) { /* best-effort */ }
      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "PREFLIGHT_BLOCKED",
          error_class: "v133_identity_ambiguous",
          error_message: `method=${method} minConf=${minConf} minMargin=${minMar} crossCheck=${xc}`,
          meta: {
            speakers: speakers.length,
            plate_dims: plateDims,
            plate_url: sourceClipUrl,
            refunded_credits: totalCost,
            identity_method: method,
            min_confidence: minConf,
            min_margin: minMar,
            cross_check: xc,
            score_matrix: (plateIdentityMap as any).scoreMatrix ?? null,
            note:
              "v133 Identity-Gate: per-character probe + Hungarian assignment returned ambiguous mapping; cross-check could not resolve. Refusing dispatch to prevent voice-swap.",
          },
        });
      } catch (_) { /* best-effort */ }
      return json(
        {
          error: "v133_identity_ambiguous",
          message: userMsg,
          identity_method: method,
          min_confidence: minConf,
          min_margin: minMar,
          cross_check: xc,
          refunded: totalCost,
        },
        422,
      );
    }



    // ── v117 — Plate-Quality Gate (soft) for N≥3 ─────────────────────────
    // v116 blocked whenever Gemini Vision failed to *resolve* identities
    // even when all faces were physically present, producing false-positive
    // "plate is bad" refunds on perfectly fine 4-person plates. v117 narrows
    // the block to the only failure mode where Sync.so genuinely cannot
    // recover: fewer detected faces than expected speakers (e.g. Sora
    // out-of-frame bug). When face *count* matches but identity assignment
    // is shaky, the slot-order fallback in resolvePlateFaceIdentities
    // (also v117) already injects a deterministic mapping, so dispatch is
    // safe to proceed.
    //
    // Gate fires only on the FIRST dispatch attempt (not advance/retry) so
    // re-tries that webhook chains in carry forward.
    const PLATE_GATE_DISABLED = (Deno.env.get("FORCE_SKIP_PLATE_GATE") ?? "").toLowerCase() === "true";
    if (
      !PLATE_GATE_DISABLED &&
      !isAdvance &&
      !isRetry &&
      !isV41Retry &&
      speakers.length >= 3 &&
      plateDims
    ) {
      const detectedFaces = plateIdentityMap?.faces?.length ?? 0;
      const resolvedFaces = plateIdentityMap?.resolvedCount ?? 0;
      // v117: only hard-block when faces are physically missing or the
      // plate-side detection failed entirely. Identity-resolution shortfall
      // alone is NOT a block (slot-order fallback covers it).
      //
      // v9 (Jun 19 2026) — Split-Screen-Detector: when N>=3 and detection
      // *did* find all faces but they're arranged in a perfect grid
      // (same y, equal x-spacing, identical box height) the plate is a
      // quad/triptych split-screen layout. Sync.so cannot lipsync isolated
      // panels — block before dispatch with a clear error.
      // V445 — detector logic lives in the pure shared module
      // `_shared/split-screen-layout.ts` (testable, single source of truth).
      // The old conjunction (y<=5% AND gap<=8% AND h<=10%) missed the
      // production S11 panel plate; the V445 rule is
      // y<=5% AND (gap<=15% OR h<=15%).
      const detectSplitScreenLayout = (): string | null => {
        if (!plateDims || !plateIdentityMap?.faces || plateIdentityMap.faces.length < 3) return null;
        // Plate identity faces carry bbox as [x1, y1, x2, y2] pixel tuples.
        const verdict = classifySplitScreenLayout(
          plateIdentityMap.faces.map((f) => {
            const b = (f as { bbox?: unknown }).bbox;
            if (!Array.isArray(b) || b.length !== 4) return null;
            const [x1, y1, x2, y2] = b.map((n) => Number(n));
            if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) return null;
            return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
          }),
          plateDims.width,
          plateDims.height,
        );

        return verdict.isSplitScreen ? verdict.reason : null;
      };

      const splitScreenReason = detectSplitScreenLayout();
      // v436 — restored contract: physical face coverage is authoritative.
      // `!plateIdentityMap` alone no longer blocks; the slot-order /
      // anchor-rescale fallback covers identity-resolution failures as long
      // as box hydration is complete.
      const hydratedBoxes = speakerPlateBboxes.filter(Boolean).length;
      const v117 = evaluateV117Gate({
        speakers: speakers.length,
        detectedFaces,
        resolvedFaces,
        hydratedBoxes,
        identityMapPresent: !!plateIdentityMap,
        splitScreenReason,
        identityNullReason: plateIdentityDiag.reason ?? null,
      });
      if (v117.softPass) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} ` +
          (plateIdentityMap
            ? `v117_soft_pass_identity_partial`
            : `v117_soft_pass_identity_unavailable`) +
          ` reason=${v117.reason} detected=${detectedFaces}/${speakers.length} ` +
          `resolved=${resolvedFaces}/${speakers.length} boxes=${hydratedBoxes}/${speakers.length} ` +
          `hydration=${plateHydrationSource} — dispatch proceeds with slot-order coords`,
        );
      }
      const gateFails = v117.block;
      if (gateFails) {
        const reason = v117.reason;
        const detectedForMessage = v117.detectedForMessage;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate_BLOCK ${reason} — refunding ${totalCost} credits and forcing plate re-render`,
        );
        // Refund the wallet debit (line ~824 already deducted totalCost).
        try {
          const { data: w } = await supabase
            .from("wallets").select("balance").eq("user_id", userId).single();
          await supabase
            .from("wallets")
            .update({
              balance: Number(w?.balance ?? 0) + Number(totalCost ?? 0),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        } catch (refundErr) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} v117_plate_quality_gate refund failed: ${(refundErr as Error)?.message}`,
          );
        }
        // Reset clip so the user / Composer re-renders the plate.
        // ── V510-P0 — a preflight gate, re-entered by every `advance` and
        // `retry` invocation. The write looked root-only, but
        // `mergeDialogShots` is a shallow spread over the scene read at
        // entry, so the full-column UPDATE shipped `existing.passes` with
        // it — and on a re-entrant invocation the siblings in that snapshot
        // already hold bound job ids. The root merge now happens server-side.
        const v510Root5: Record<string, unknown> = {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: 0,
          refunded: true,
          error: `v117_plate_quality_gate:${reason}`,
          finished_at: new Date().toISOString(),
        };
        await v510Terminalize({
          passIdx: null,
          passPatch: null,
          rootPatch: v510Root5,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: splitScreenReason
            ? tl({ de: `Plate-Quality-Gate (v9): Der gerenderte Scene-Clip ist ein Split-Screen/Panel-Layout (${speakers.length} isolierte Einzel-Panels statt einer gemeinsamen Group-Composition). Sync.so kann Einzel-Panels nicht lipsyncen. Bitte die Szene neu rendern — alle ${speakers.length} Personen müssen im selben Raum stehen, in einem durchgehenden Kamera-Frame. Credits wurden zurückerstattet.`, en: `Plate-Quality-Gate (v9): The rendered scene clip is a split-screen/panel layout (${speakers.length} isolated individual panels instead of a common group composition). Sync.so cannot lipsync individual panels. Please re-render the scene — all ${speakers.length} people must be in the same room, in a continuous camera frame. Credits have been refunded.`, es: `Plate-Quality-Gate (v9): El clip de escena renderizado es un diseño de pantalla dividida/panel (${speakers.length} paneles individuales aislados en lugar de una composición de grupo común). Sync.so no puede sincronizar los labios de paneles individuales. Por favor, vuelve a renderizar la escena — las ${speakers.length} personas deben estar en la misma habitación, en un encuadre de cámara continuo. Los créditos han sido reembolsados.` })
            : tl({ de: `Plate-Quality-Gate (v117): Auf dem aktuellen Scene-Clip sind nicht alle ${speakers.length} Charaktere als Gesichter erkennbar (erkannt: ${detectedForMessage} von ${speakers.length}). Sync.so kann fehlende Personen nicht animieren. Bitte die Szene neu rendern — alle ${speakers.length} Personen müssen frontal sichtbar im Bild sein, keine angeschnittenen Köpfe. Credits wurden zurückerstattet.`, en: `Plate-Quality-Gate (v117): Not all ${speakers.length} characters are recognizable as faces in the current scene clip (recognized: ${detectedForMessage} of ${speakers.length}). Sync.so cannot animate missing people. Please re-render the scene — all ${speakers.length} people must be visibly frontal in the image, no cropped heads. Credits have been refunded.`, es: `Plate-Quality-Gate (v117): No todos los ${speakers.length} personajes son reconocibles como caras en el clip de escena actual (reconocidos: ${detectedForMessage} de ${speakers.length}). Sync.so no puede animar a personas que faltan. Por favor, vuelve a renderizar la escena — las ${speakers.length} personas deben estar frontalmente visibles en la imagen, sin cabezas cortadas. Los créditos han sido reembolsados.` }),
          },
          reason: String(v510Root5.error ?? "terminal"),
        });
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v117_plate_quality_gate",
            error_message: reason,
            meta: {
              speakers: speakers.length,
              detected_faces: detectedFaces,
              resolved_faces: resolvedFaces,
              plate_url: sourceClipUrl,
              plate_dims: plateDims,
              refunded_credits: totalCost,
            },
          });
        } catch (_) { /* best-effort */ }
        return json(
          {
            error: "v117_plate_quality_gate",
            message: tl({ de: `Plate enthält ${detectedFaces} Gesichter, erwartet ${speakers.length}. Bitte Szene neu rendern.`, en: `Plate contains ${detectedFaces} faces, expected ${speakers.length}. Please re-render scene.`, es: `La placa contiene ${detectedFaces} caras, se esperaban ${speakers.length}. Por favor, vuelve a renderizar la escena.` }),
            detected_faces: detectedFaces,
            resolved_faces: resolvedFaces,
            expected: speakers.length,
            refunded: totalCost,
          },
          422,
        );
      }
    }


    // ── v132 — Turn-Visibility Pre-Gate (root-cause fix) ──────────────────
    // BEFORE rendering any per-pass preclip (3 × Lambda, ~3 min each) and
    // BEFORE dispatching to Sync.so, validate that every speaker is actually
    // visible AT THEIR OWN TURN TIMESTAMP on the plate. The historical
    // failure mode this catches: pass 1–3 render fine, then pass 4's preclip
    // returns `face_gate_failed:count=0 (after 2 v116 repair attempts)` →
    // the entire scene fails with `v107_preclip_required_for_multispeaker`
    // after wasting 10+ minutes of Lambda time and Watchdog ticks.
    //
    // We probe the plate at each speaker's turn-mid timestamp using
    // `validate-frame-face` (same Gemini Vision detector used downstream).
    // A speaker whose face is undetectable in their own turn frame will
    // also fail downstream; refunding now is cheaper for both the user
    // (no 10-min wait) and the platform (no 3-Lambda × 4-pass burn).
    //
    // Permissive on probe errors (validator returns ok:false): we never
    // block on a flaky vision model, only on confirmed faceCount===0.
    // First-attempt only; advance/retry skips the gate (already validated).
    const TURN_GATE_DISABLED =
      (Deno.env.get("FORCE_SKIP_TURN_VISIBILITY_GATE") ?? "").toLowerCase() === "true";
    if (
      !TURN_GATE_DISABLED &&
      !isAdvance &&
      !isRetry &&
      !isV41Retry &&
      speakers.length >= 2 &&
      plateDims &&
      sourceClipUrl
    ) {
      const FPS = 30;
      const failures: Array<{
        speaker: string;
        character_id: string | null;
        turn_sec: number;
        frame: number;
        face_count: number;
      }> = [];
      const probes: Array<{
        speaker: string;
        turn_sec: number;
        face_count: number | null;
        ok: boolean;
      }> = [];
      // v192 — Parallelisiert. Vorher: serielle for-Schleife über N Sprecher,
      // jede mit bis zu 5 Gemini-Vision-Probes (cold cache 1–5s each) →
      // ~4–20s Preflight-Overhead bei 4 Sprechern. Jetzt läuft der Gate pro
      // Sprecher parallel via Promise.all; die inneren Sample-Offset-Probes
      // bleiben seriell, weil sie via early-exit auf face_count>=1 optimieren.
      const speakerResults = await Promise.all(
        speakers.map(async (spRaw: any, i: number) => {
          const sp = spRaw as any;
          const turns = Array.isArray(sp?.voicedRange?.turns) ? sp.voicedRange.turns : [];
          if (turns.length === 0) return null;
          const t0 = turns[0];
          const startSec = Math.max(0, Number(t0?.startSec) || 0);
          const endSec = Math.max(startSec + 0.2, Number(t0?.endSec) || startSec + 0.5);
          const midSec = (startSec + endSec) / 2;
          const frameNum = Math.max(1, Math.round(midSec * FPS));

          // v188 — Nearest-Window Snap (siehe Original-Kommentar): sample the
          // turn window at up to 5 timestamps (mid, ±25%, ±50% incl. ±0.5s
          // padding beyond turn edges). If ANY frame in the window shows ≥1
          // face, treat the turn as recoverable.
          const turnDur = Math.max(0.2, endSec - startSec);
          const padSec = 0.5;
          const sampleOffsets = [
            0,
            -turnDur * 0.25,
            +turnDur * 0.25,
            -(turnDur * 0.5 + padSec),
            +(turnDur * 0.5 + padSec),
          ];
          let bestFaceCount = 0;
          let bestSampleSec = midSec;
          let bestOk = false;
          let anyProbeSucceeded = false;
          const sampleTrail: Array<{ sec: number; frame: number; faces: number | null; ok: boolean }> = [];
          for (const off of sampleOffsets) {
            const sampleSec = Math.max(0, midSec + off);
            const sampleFrame = Math.max(1, Math.round(sampleSec * FPS));
            try {
              const v = await validateFrameFace({
                supabaseUrl,
                serviceKey,
                videoUrl: sourceClipUrl,
                frameNumber: sampleFrame,
                fps: FPS,
                targetCoords: null,
              });
              const faceCount = Number(v.faceCount ?? 0);
              sampleTrail.push({
                sec: Math.round(sampleSec * 100) / 100,
                frame: sampleFrame,
                faces: v.ok ? faceCount : null,
                ok: !!v.ok,
              });
              if (v.ok) {
                anyProbeSucceeded = true;
                if (faceCount > bestFaceCount) {
                  bestFaceCount = faceCount;
                  bestSampleSec = sampleSec;
                  bestOk = true;
                }
                if (faceCount >= 1) break;
              }
            } catch (e) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v188_snap probe threw speaker=${i} off=${off}: ${(e as Error)?.message}`,
              );
            }
          }

          return {
            i,
            sp,
            midSec,
            frameNum,
            bestFaceCount,
            bestSampleSec,
            bestOk,
            anyProbeSucceeded,
            sampleTrail,
          };
        }),
      );

      for (const res of speakerResults) {
        if (!res) continue;
        const { i, sp, midSec, frameNum, bestFaceCount, bestSampleSec, bestOk, anyProbeSucceeded, sampleTrail } = res;
        probes.push({
          speaker: String(sp?.speaker ?? `Speaker ${i + 1}`),
          turn_sec: Math.round(midSec * 100) / 100,
          face_count: bestOk ? bestFaceCount : null,
          ok: anyProbeSucceeded,
        });

        if (anyProbeSucceeded && bestFaceCount < 1) {
          failures.push({
            speaker: String(sp?.speaker ?? `Speaker ${i + 1}`),
            character_id: sp?.character_id ?? null,
            turn_sec: Math.round(midSec * 100) / 100,
            frame: frameNum,
            face_count: 0,
          });
        } else if (anyProbeSucceeded && bestFaceCount >= 1) {
          const snapOffsetMs = Math.round((bestSampleSec - midSec) * 1000);
          if (Math.abs(snapOffsetMs) > 5) {
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v188_turn_visibility_snap speaker=${i} snapped_from=${midSec.toFixed(2)}s snapped_to=${bestSampleSec.toFixed(2)}s offset=${snapOffsetMs}ms faces=${bestFaceCount} trail=${JSON.stringify(sampleTrail)}`,
            );
          }
        }
      }
      if (failures.length > 0) {
        const detail = failures
          .map((f) => `${f.speaker}@${f.turn_sec}s(faces=${f.face_count})`)
          .join(", ");
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v132_turn_visibility_BLOCK ${detail} — refunding ${totalCost} credits and forcing plate re-render`,
        );
        // Refund wallet (debit happened at ~line 1024).
        const alreadyRefunded = !!(existing as any)?.refunded;
        if (!alreadyRefunded) {
          try {
            const { data: w } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(w?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (refundErr) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v132 refund failed: ${(refundErr as Error)?.message}`,
            );
          }
        }
        const speakerList =
          failures.length === 1
            ? tl({ de: `Sprecher „${failures[0].speaker}" ist bei Sekunde ${failures[0].turn_sec} (Dialog-Turn) nicht im Bild`, en: `Speaker "${failures[0].speaker}" is not in the picture at second ${failures[0].turn_sec} (dialog turn)`, es: `El orador "${failures[0].speaker}" no está en la imagen en el segundo ${failures[0].turn_sec} (turno de diálogo)` })
            : `${failures.length} Sprecher sind während ihres Dialog-Turns nicht im Bild: ${failures.map((f) => `${f.speaker} @ ${f.turn_sec}s`).join(", ")}`;
        const userMsg =
          tl({ de: `Lip-Sync wurde nicht gestartet: ${speakerList}. `, en: `Lip-sync did not start: ${speakerList}.`, es: `La sincronización labial no se inició: ${speakerList}.` }) +
          tl({ de: `Sync.so kann ein Gesicht nur animieren, wenn es in genau diesem Moment sichtbar ist. `, en: `Sync.so can only animate a face if it is visible at that exact moment.`, es: `Sync.so solo puede animar una cara si es visible en ese preciso momento.` }) +
          tl({ de: `Bitte die Szene neu rendern — alle Sprecher müssen während ihres Dialog-Turns frontal und unverdeckt im Bild sein (keine Kameraschwenks weg, keine Cuts, keine angeschnittenen Köpfe). `, en: `Please re-render the scene — all speakers must be frontal and uncovered in the picture during their dialog turn (no camera pans away, no cuts, no cropped heads).`, es: `Por favor, vuelve a renderizar la escena — todos los oradores deben estar frontales y descubiertos en la imagen durante su turno de diálogo (sin movimientos de cámara, sin cortes, sin cabezas cortadas).` }) +
          `Credits wurden vollständig zurückerstattet.`;
        // ── V510-P0 — a preflight gate, re-entered by every `advance` and
        // `retry` invocation. The write looked root-only, but
        // `mergeDialogShots` is a shallow spread over the scene read at
        // entry, so the full-column UPDATE shipped `existing.passes` with
        // it — and on a re-entrant invocation the siblings in that snapshot
        // already hold bound job ids. The root merge now happens server-side.
        const v510Root6: Record<string, unknown> = {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: 0,
          refunded: true,
          error: `v132_turn_visibility:${detail}`,
          v132_turn_gate: { failures, probes },
          finished_at: new Date().toISOString(),
        };
        await v510Terminalize({
          passIdx: null,
          passPatch: null,
          rootPatch: v510Root6,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "needs_clip_rerender",
            clip_status: "pending",
            clip_url: null,
            lip_sync_source_clip_url: null,
            clip_error: userMsg,
          },
          reason: String(v510Root6.error ?? "terminal"),
        });
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v132_turn_visibility",
            error_message: detail,
            meta: {
              failures,
              probes,
              speakers: speakers.length,
              plate_dims: plateDims,
              plate_url: sourceClipUrl,
              refunded_credits: totalCost,
              note:
                "Turn-Visibility-Gate: speaker not detectable at their own dialog turn frame on the plate. Re-render required.",
            },
          });
        } catch (_) {
          /* best-effort */
        }
        return json(
          {
            error: "v132_turn_visibility",
            message: userMsg,
            failures,
            probes,
            refunded: alreadyRefunded ? 0 : totalCost,
          },
          422,
        );
      }
      if (probes.length > 0) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v132_turn_visibility OK probes=${JSON.stringify(probes)}`,
        );
      }
    }


    // Final safety fallback: evenly spaced along the horizontal midline so
    // 3+ speakers never collide on the same x.
    for (let i = 0; i < speakerCoords.length; i++) {
      if (!speakerCoords[i]) {
        const total = Math.max(speakers.length, 2);
        const t = 0.2 + (0.6 * i) / (total - 1);
        speakerCoords[i] = [
          Math.round(videoDims.width * t),
          Math.round(videoDims.height * 0.5),
        ];
      }
      speakerCoords[i] = clampSyncCoords(speakerCoords[i]);
      if (speakerCoords[i] && plateDims) {
        const margin = 0.05;
        const minX = Math.round(plateDims.width * margin);
        const maxX = Math.round(plateDims.width * (1 - margin));
        const minY = Math.round(plateDims.height * margin);
        const maxY = Math.round(plateDims.height * (1 - margin));
        const [cx, cy] = speakerCoords[i]!;
        speakerCoords[i] = [
          Math.min(Math.max(cx, minX), maxX),
          Math.min(Math.max(cy, minY), maxY),
        ];
      }
    }
    const ASSUMED_FPS = 24;
    console.log(
      `[compose-dialog-segments] scene=${sceneId} faceMap=${faceMap?.source ?? "none"} faces=${faceMap?.faces?.length ?? 0} ` +
      `anchor=${faceMap?.width ?? "?"}x${faceMap?.height ?? "?"} plate=${plateDims ? `${plateDims.width}x${plateDims.height}` : "probe-failed"} ` +
      `plate_identity=${plateIdentityMap ? `${plateIdentityMap.resolvedCount}/${plateIdentityMap.faces.length}` : "off"} ` +
      `speakers=${speakers.length} coords=${JSON.stringify(speakerCoords)} sources=${JSON.stringify(coordSources)}`,
    );

    // ── v87 — Block heuristic centre-grid dispatch (multi-speaker only) ──
    // Root cause of "alle Münder zu" bug (June 9 2026): when Gemini anchor-
    // faces aren't cached yet AND plate-identity resolve fails (e.g. Hailuo
    // MP4 still warming in CDN), every coordSource falls back to "heuristic"
    // / "none" — the safety grid plants y at plate.height * 0.5, which on a
    // portrait plate (faces at y≈0.3) lands mid-torso. Sync.so then animates
    // nothing because there's no face under the coordinate → user sees every
    // speaker with closed mouth. Refuse to dispatch in that state; refund &
    // mark the scene `pending` so the auto-trigger retries once anchor data
    // is available. Hard-fail only after 3 awaiting cycles.
    const coordsAreHeuristicOnly = speakers.length >= 2 && coordSources.every(
      (s) => !s || s === "none" || s === "heuristic",
    );
    if (coordsAreHeuristicOnly && !isAdvance && !isRetry) {
      // Retry counter is persisted inside dialog_shots — composer_scenes has
      // no `meta` column (PostgREST validates select/update keys, so any
      // reference to a missing column hard-fails the request with a 404
      // scene_not_found that masked the real bug for weeks).
      const existingDs = (scene as any)?.dialog_shots ?? {};
      const prevRetryCount = Number(existingDs?.face_detect_retry_count ?? 0);
      const nextRetryCount = prevRetryCount + 1;
      const giveUp = nextRetryCount >= 3;

      // Refund the wallet debit we already took at line ~741.
      const { data: wHeur } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(wHeur?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      await supabase
        .from("composer_scenes")
        .update(
          giveUp
            ? {
                lip_sync_status: "failed",
                twoshot_stage: "failed",
                clip_error:
                  tl({ de: "no_face_map_after_3_retries: Gesichts­erkennung für die Plate lieferte keine Treffer. Bitte Plate (Hailuo-Clip) neu rendern oder eine andere Szene wählen.", en: "no_face_map_after_3_retries: Face detection for the plate yielded no results. Please re-render plate (Hailuo clip) or choose a different scene.", es: "no_face_map_after_3_retries: La detección de rostros para la placa no arrojó resultados. Por favor, vuelve a renderizar la placa (clip de Hailuo) o elige una escena diferente." }),
                dialog_shots: mergeDialogShots(existingDs, { face_detect_retry_count: 0 }),
              }
            : {
                lip_sync_status: "pending",
                twoshot_stage: "pending",
                clip_error: `awaiting_face_detection_retry_${nextRetryCount}_of_3`,
                dialog_shots: mergeDialogShots(existingDs, { face_detect_retry_count: nextRetryCount }),
              },
        )
        .eq("id", sceneId);

      await logSyncDispatch(supabase, {
        scene_id: sceneId,
        user_id: userId,
        engine: "sync-segments",
        sync_status: "HEURISTIC_BLOCKED",
        error_class: "coords_heuristic_unverified",
        error_message: giveUp
          ? `no_face_map_after_3_retries (speakers=${speakers.length}, plate=${plateDims ? `${plateDims.width}x${plateDims.height}` : "probe-failed"})`
          : `awaiting_face_detection_retry_${nextRetryCount}_of_3 (speakers=${speakers.length})`,
        meta: {
          speakers: speakers.length,
          plate_dims: plateDims ?? null,
          face_map_source: faceMap?.source ?? "none",
          face_map_faces: faceMap?.faces?.length ?? 0,
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
          retry_count: nextRetryCount,
          gave_up: giveUp,
        },
      });

      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v87 HEURISTIC_BLOCKED ` +
        `speakers=${speakers.length} sources=${JSON.stringify(coordSources)} ` +
        `retry=${nextRetryCount}/3 giveUp=${giveUp} refunded=${totalCost}`,
      );

      return json(
        {
          ok: !giveUp,
          status: giveUp ? "failed" : "awaiting_face_detection",
          error: giveUp ? "no_face_map_after_3_retries" : "awaiting_face_detection_retry",
          message: giveUp
            ? "Face detection still empty after 3 retries — scene marked failed."
            : `Anchor face map not ready yet — refunded ${totalCost} credits and will retry automatically (${nextRetryCount}/3).`,
          retry_count: nextRetryCount,
          refunded: totalCost,
        },
        202,
      );
    }

    // ── v110 — Soft Coords-Close Warning (no longer a blocker) ───────────
    // v107 used to hard-fail the entire scene when two speaker face coords
    // were closer than max(120 px, plate.width × 0.08). That guard was
    // written for the legacy v69 single-face-preclip pipeline where a close
    // sibling collapsed the crop to a useless tiny square. With v109
    // native-resolution preclip a smaller crop is no longer destructive —
    // Sync.so either lip-syncs cleanly or returns a per-pass closed-mouth
    // no-op for that single speaker. The remaining N-1 speakers must not be
    // killed alongside. We keep the measurement as a warning only.
    if (speakers.length >= 2 && plateDims && !isAdvance && !isRetry) {
      const pts: Array<[number, number, number]> = speakerCoords
        .map((c, i) => (c ? [Number(c[0]), Number(c[1]), i] as [number, number, number] : null))
        .filter((p): p is [number, number, number] => !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      let minDist = Infinity;
      let collisionPair: [number, number] | null = null;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d < minDist) {
            minDist = d;
            collisionPair = [pts[i][2], pts[j][2]];
          }
        }
      }
      const softThreshold = Math.max(120, Math.round(plateDims.width * 0.08));
      if (collisionPair && minDist < softThreshold) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v110_coords_close ` +
          `speakers=${speakers.length} minDist=${Math.round(minDist)}px ` +
          `threshold=${softThreshold}px pair=${collisionPair[0]}_${collisionPair[1]} — proceeding (no block)`,
        );
      }
    }







    // ─────────────────────────────────────────────────────────────────────
    // v60+ — Unified per-speaker chained pipeline for ALL N (1..4)
    // ─────────────────────────────────────────────────────────────────────
    // The legacy `segments[]`-based single-call dispatch (v41/v54/v56) was
    // removed in v79 (2026-06-09). It was already gated behind a debug-only
    // body flag (`force_v56`) that no production code ever set, and the
    // Sync.so `sync-3 + segments[]` path returns `An unknown error occurred.`
    // on real plates regardless of ASD shape (see v58/v59 memory docs).
    //
    // The only stable path is the per-speaker chained pipeline below: one
    // Sync.so call per speaker, single-coord ASD, pass-N output feeds
    // pass-N+1. v69 extended this to ALL speaker counts via single-face
    // preclip renders. The `retry_v41` / `force_multipass` / `retry_no_asd`
    // body flags are still accepted from older webhook callers but are now
    // no-ops — the chained pipeline is the only dispatch path.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.1, I.2, I.9)




    // ── Build PASSES (one per speaker that has turns) ────────────────────
    // MAY 2026 pivot: instead of one Sync.so call with segments[]+ASD (which
    // crashes lipsync-2-pro), we chain N per-speaker calls where each pass:
    //  • takes prev pass output as video input (pass 0 = master plate)
    //  • takes that speaker's pre-mixed audio track (with silence between
    //    their turns — compose-twoshot-audio guarantees this)
    //  • locks ASD to that speaker's single-coord face
    //  • NO segments[] → no crash
    //
    // Result: each pass only modifies its own speaker's mouth. After the
    // final pass, every speaker is correctly lip-synced.
    const passSpeakers = speakers
      .map((sp, originalIdx) => ({ sp, originalIdx }))
      .filter(({ sp }) => {
        const turns = Array.isArray(sp.voicedRange?.turns) ? sp.voicedRange!.turns! : [];
        return turns.length > 0 && !!String(sp.track_url ?? "").trim();
      });

    // v86 — Defense-in-depth: if speakerTracks collapsed upstream (e.g. two
    // distinct cast members shared a name slug and compose-twoshot-audio's
    // ambiguity guard didn't catch it), distinct character_ids across
    // `speakers` must equal `speakers.length`. Otherwise two speakers point at
    // the same character_id → Sync.so would lipsync the same face twice while
    // another character stays silent. Fail-fast BEFORE the wallet debit.
    const distinctCharIds = new Set(
      speakers
        .map((sp) => String(sp.character_id || sp.speaker || "").trim().toLowerCase())
        .filter((s) => s.length > 0),
    );
    if (distinctCharIds.size > 0 && distinctCharIds.size < speakers.length) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} speaker_count_mismatch speakers=${speakers.length} distinct_ids=${distinctCharIds.size}`,
      );
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: tl({ de: "speaker_count_mismatch: Zwei Cast-Mitglieder teilen denselben Character-Slot. Bitte vollen Namen verwenden oder eindeutige Cast-IDs zuweisen, dann 'Sauber neu starten'.", en: "speaker_count_mismatch: Two cast members share the same character slot. Please use full names or assign unique cast IDs, then 'Clean Restart'.", es: "speaker_count_mismatch: Dos miembros del elenco comparten el mismo espacio de personaje. Por favor, usa nombres completos o asigna IDs de elenco únicos, luego 'Reiniciar Limpio'." }),
        })
        .eq("id", sceneId);
      return json(
        {
          error: "speaker_count_mismatch",
          message: tl({ de: `${speakers.length} Sprecher, aber nur ${distinctCharIds.size} eindeutige Character-IDs. Pipeline würde Speaker-Pass kollidieren.`, en: `${speakers.length} speakers, but only ${distinctCharIds.size} unique character IDs. Pipeline would collide speaker pass.`, es: `${speakers.length} oradores, pero solo ${distinctCharIds.size} IDs de personaje únicos. La tubería colisionaría el pase de orador.` }),
          speakers: speakers.length,
          distinct_character_ids: distinctCharIds.size,
        },
        400,
      );
    }

    // If we can't build per-speaker passes (missing track_url), bail with a
    // clear error rather than silently swap speakers.
    if (passSpeakers.length === 0) {
      // Refund the wallet debit we just took.
      const { data: wErr } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(wErr?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: "dialog_pipeline_no_per_speaker_tracks",
        })
        .eq("id", sceneId);
      return json(
        {
          error: "no_per_speaker_tracks",
          message: "Per-speaker audio tracks missing. Re-run compose-twoshot-audio.",
          refunded: totalCost,
        },
        422,
      );
    }

    // v95 — Per-Turn Pass Split (flag-gated, default ON).
    // Background: v94 made the per-pass preclip span the union of all turns
    // of the speaker so Sync.so (sync_mode=cut_off) wouldn't truncate the
    // output below the tight-WAV length. That fixed length but exposed a
    // second problem: the preclip now also covers the PLATE-SILENT region
    // between turn 1 and turn 2. Sync.so tries to animate turn-2 audio onto
    // plate frames with a closed/idle mouth → minimal lip movement.
    // Fix: split each multi-turn pass into N single-turn passes. Each pass
    // gets a short preclip covering only that turn's mouth-active plate
    // region and a short tight-WAV covering only that turn's audio →
    // Sync.so animates the full output. v94 union-window logic still runs
    // but becomes a no-op (min=max=turn window).
    const splitMultiTurnFlagOn = await (async () => {
      try {
        const { data } = await supabase
          .from("system_config")
          .select("value")
          .eq("key", "composer.split_multi_turn_passes")
          .maybeSingle();
        // Default ON when row missing or value not explicitly false.
        if (data?.value === false || data?.value === "false") return false;
        return true;
      } catch { return true; }
    })();

    const builtPassesRaw: PassState[] = passSpeakers.map(({ sp, originalIdx }, passIdx) => {
      const turns = sp.voicedRange!.turns! as Turn[];
      const passSegments: SegmentItem[] = turns.map((t) => ({
        startTime: Number(Math.max(0, t.startSec).toFixed(3)),
        endTime: Number(Math.min(totalSec, Math.max(t.startSec + MIN_TURN_DUR_SEC, t.endSec)).toFixed(3)),
        speakerIdx: originalIdx,
        speakerName: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        refId: "a1",
        // FA-4/P0 — Turn↔Pass-Bindung entsteht hier, nicht später über Namen.
        turnId: t.turnId ? String(t.turnId) : null,
      }));
      return {
        idx: passIdx,
        speaker_idx: originalIdx,
        character_id: sp.character_id ?? null,
        speaker_name: String(sp.speaker ?? `Speaker ${originalIdx + 1}`),
        // Mehr-Turn-Pass vor dem Split: erst der Split erzeugt die
        // 1:1-Identität. Wird direkt darunter gesetzt.
        segment_id: passSegments.length === 1 ? (passSegments[0].turnId ?? null) : null,
        audio_url: String(sp.track_url),
        coords: speakerCoords[originalIdx] ?? [0.5, 0.5],
        segments: passSegments,
        input_url: "", // filled per pass below
        status: "pending",
        // v137 — per-pass mapping forensics. Surface what the
        // speaker→face resolver decided so the cockpit can show why
        // a given pass got those coordinates without joining
        // syncso_dispatch_log.
        v137_mapping: {
          coord_source: coordSources[originalIdx] ?? "unknown",
          plate_bbox: speakerPlateBboxes[originalIdx] ?? null,
            plate_mouth: speakerPlateMouths[originalIdx] ?? null,
          plate_face_count: plateIdentityMap?.faces?.length ?? null,
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? null,
          plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
          plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
          plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
          plate_dims: plateDims ?? null,
        },
      };
    });


    const builtPasses: PassState[] = splitMultiTurnFlagOn
      ? builtPassesRaw.flatMap((p) => {
          if (!Array.isArray(p.segments) || p.segments.length <= 1) return [p];
          // Expand into N single-turn passes; preserves all identity fields.
          // FA-4/P0: jeder Split-Pass erbt exakt die `segment_id` SEINES Turns.
          return p.segments.map((seg) => ({
            ...p,
            segments: [seg],
            segment_id: seg.turnId ?? null,
          }));
        }).map((p, i) => ({ ...p, idx: i }))
      : builtPassesRaw;


    if (splitMultiTurnFlagOn && builtPasses.length !== builtPassesRaw.length) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v95_per_turn_split raw=${builtPassesRaw.length} → expanded=${builtPasses.length} ` +
        `(${builtPassesRaw.map((p) => `${p.speaker_name}:${p.segments.length}t`).join(", ")})`,
      );
    }

    // ── v194 Silent-Speaker-Pass fan-out ────────────────────────────────
    // For each listener speaker (M ≥ 2), append one "silent stabilizer"
    // pass that dispatches Sync.so with a deterministic silence WAV against
    // that listener's own bbox. The Sync.so output lipsyncs a CLOSED mouth
    // that follows head motion → composites over the plate ONLY during
    // OTHER speakers' turn windows (segments = complement of this
    // listener's own turns). Result: no ghost faces, no freeze patches, no
    // static-plate look — background and all faces stay alive, only the
    // mouths of non-speakers are stilled by the same lipsync engine that
    // moves the active speaker's mouth.
    //
    // Hard constraint: every stabilizer pass uses `bounding_boxes_url`
    // (bbox-only, no `auto_detect`), same code path as active passes.
    try {
      const { data: v194Row } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "composer.silent_speaker_pass_v194")
        .maybeSingle();
      const rawV194 = (v194Row as any)?.value;
      const v194Enabled = rawV194 === true || rawV194 === "true" || String(rawV194).toLowerCase() === "true";

      // Collect unique speaker indices that appear as an active pass.
      const activeSpeakerIdxs = Array.from(
        new Set(builtPasses.map((p) => Number(p.speaker_idx))),
      ).filter((i) => Number.isFinite(i));

      if (v194Enabled && activeSpeakerIdxs.length >= 2) {
        // Fetch a scene-length silence track. Deterministic per duration →
        // idempotent across retries and other scenes of the same length.
        let silenceUrl: string | null = null;
        try {
          const silResp = await fetch(
            `${supabaseUrl}/functions/v1/generate-silence-track`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ duration_sec: Math.max(0.5, Math.min(60, totalSec + 0.2)) }),
            },
          );
          if (silResp.ok) {
            const j = await silResp.json();
            silenceUrl = typeof j?.url === "string" ? j.url : null;
          }
        } catch (silErr) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v194_silence_track_fetch_failed: ${(silErr as Error)?.message ?? silErr}`,
          );
        }

        if (!silenceUrl) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_SKIPPED reason=no_silence_url speakers=${activeSpeakerIdxs.length}`,
          );
        } else {
          // For each listener, its silent-stabilizer covers all turns
          // where SOMEONE ELSE is speaking (union of other-speaker
          // segments). Turns where the listener speaks are excluded
          // (their active-pass overlay wins in those windows anyway).
          const stabilizers: PassState[] = [];
          // FA-4/P0 — Stabilizer haben keinen eigenen dialog_turn, brauchen
          // aber eine stabile, kollisionsfreie Segmentidentität. Deterministisch
          // aus (scene, listener) abgeleitet → Retries adoptieren dieselbe Zeile.
          const stabilizerSegmentId = async (listenerIdx: number): Promise<string> => {
            const bytes = new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(`v194-stabilizer:${sceneId}:${listenerIdx}`),
              ),
            ).slice(0, 16);
            bytes[6] = (bytes[6] & 0x0f) | 0x50; // Version 5-artig
            bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC-4122-Variante
            const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
          };

          for (const listenerIdx of activeSpeakerIdxs) {
            const bbox = (speakerPlateBboxes as any)?.[listenerIdx] ?? null;
            const coord = speakerCoords[listenerIdx];
            const bboxOk =
              Array.isArray(bbox) &&
              bbox.length === 4 &&
              bbox.every((n: number) => Number.isFinite(Number(n)));
            const coordOk =
              Array.isArray(coord) &&
              coord.length === 2 &&
              Number.isFinite(Number(coord[0])) &&
              Number.isFinite(Number(coord[1]));
            if (!bboxOk || !coordOk) {
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v194_stabilizer_SKIP listener=${listenerIdx} reason=no_bbox_or_coord — that listener will fall back to raw plate motion`,
              );
              continue;
            }
            const otherSegs: SegmentItem[] = builtPasses
              .filter((p) => Number(p.speaker_idx) !== listenerIdx)
              .flatMap((p) => (Array.isArray(p.segments) ? p.segments : []))
              .map((s) => ({
                startTime: Number(s.startTime),
                endTime: Number(s.endTime),
                speakerIdx: listenerIdx,
                speakerName: `stabilizer_${listenerIdx}`,
                refId: "silence",
              }))
              .filter((s) => Number.isFinite(s.startTime) && Number.isFinite(s.endTime) && s.endTime > s.startTime);
            if (otherSegs.length === 0) continue;
            const listenerSpeaker = speakers[listenerIdx] as any;
            stabilizers.push({
              idx: builtPasses.length + stabilizers.length,
              speaker_idx: listenerIdx,
              character_id: listenerSpeaker?.character_id ?? null,
              speaker_name: `stabilizer_${listenerSpeaker?.speaker ?? listenerIdx}`,
              segment_id: await stabilizerSegmentId(listenerIdx),

              audio_url: silenceUrl,
              coords: [Number(coord[0]), Number(coord[1])] as [number, number],
              segments: otherSegs,
              input_url: "",
              status: "pending",
              v137_mapping: {
                coord_source: `v194_stabilizer_${(coordSources as any)?.[listenerIdx] ?? "unknown"}`,
                plate_bbox: bbox,
                plate_mouth: (speakerPlateMouths as any)?.[listenerIdx] ?? null,
                plate_face_count: plateIdentityMap?.faces?.length ?? null,
                plate_identity_resolved: plateIdentityMap?.resolvedCount ?? null,
                plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
                plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
                plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
                plate_dims: plateDims ?? null,
              },
              // v194 markers — read by SILENT_AUDIO_GATE bypass and by the
              // mux logger. Non-charging, non-refunding.
              is_silent_stabilizer: true,
              silent_for_turn_of_pass_idx: null,
              stabilizer_pass: true,
            } as unknown as PassState);
          }
          if (stabilizers.length > 0) {
            builtPasses.push(...stabilizers);
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_INJECTED active=${activeSpeakerIdxs.length} stabilizers=${stabilizers.length} total_passes=${builtPasses.length} silence_url=${silenceUrl.slice(0, 80)}`,
            );
          } else {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_NO_STABILIZERS speakers=${activeSpeakerIdxs.length} (all listeners lacked bbox/coord)`,
            );
          }
        }
      } else if (v194Enabled) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_SKIPPED reason=single_speaker speakers=${activeSpeakerIdxs.length}`,
        );
      }
    } catch (v194Err) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v194_silent_speaker_pass_ERROR ${(v194Err as Error)?.message ?? v194Err} — falling back to plain active-only passes`,
      );
    }

    // ── FA-4/P0 — Turn↔Pass-Kardinalitäts-Guard ──────────────────────────
    // Läuft NACH vollständigem Pass-Aufbau inkl. Stabilizer-Injektion und
    // VOR dem allerersten turn-backed Ledger-Acquire.
    // Invariante: set(turn_backed_sync_segment.segment_id) == set(dialog_turns.id)
    // (NICHT über alle sync_segment-Rows — Stabilizer zählen separat).
    if (!isAdvance && canonicalDialogTurnIds.length > 0) {
      const violations = evaluateTurnPassBinding(
        builtPasses as unknown as TurnPassCandidate[],
        canonicalDialogTurnIds,
      );
      const turnBackedCount = violations.turn_backed_count;
      const stabilizerCount = violations.stabilizer_count;

      if (!violations.ok) {

        console.error(
          `[compose-dialog-segments] scene=${sceneId} FA4_P0_TURN_PASS_MISMATCH ${JSON.stringify(violations)}`,
        );
        const { data: wGuard } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wGuard?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: "fa4_p0_turn_pass_mismatch",
          })
          .eq("id", sceneId);
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: sourceClipUrl,
          sync_status: "PREFLIGHT_BLOCKED",
          error_class: "fa4_p0_turn_pass_mismatch",
          error_message: JSON.stringify(violations).slice(0, 900),
        });
        return json({
          error: "fa4_p0_turn_pass_mismatch",
          details: violations,
          refunded: totalCost,
        }, 422);
      }

      console.log(
        `[compose-dialog-segments] scene=${sceneId} fa4_p0_turn_pass_guard_OK turn_backed=${turnBackedCount} stabilizers=${stabilizerCount}`,
      );
    }



    // ── Stufe B: HEAD-probe inputs once before paying Sync.so ────────────
    const audioUrls = builtPasses.map((p) => p.audio_url);
    const probes = await Promise.all([
      probeAsset(sourceClipUrl, "video", 50_000),
      ...audioUrls.map((u) => probeAsset(u, "audio", 5_000)),
    ]);
    const videoProbe = probes[0];
    const audioProbes = probes.slice(1);
    const badProbe =
      (!videoProbe.ok ? `video:${videoProbe.error}` : null) ??
      audioProbes
        .map((p, i) => (p.ok ? null : `audio[${i}]:${p.error}`))
        .find(Boolean);
    if (badProbe && !isAdvance) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} PREFLIGHT BLOCK ${badProbe}`,
      );
      const { data: w0 } = await supabase
        .from("wallets").select("balance").eq("user_id", userId).single();
      await supabase
        .from("wallets")
        .update({
          balance: Number(w0?.balance ?? 0) + totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_segments_preflight_${badProbe}`,
        })
        .eq("id", sceneId);
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: sourceClipUrl,
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: badProbe.startsWith("video") ? "video_head_fail" : "audio_head_fail",
        error_message: badProbe,
      });
      return json({ error: "preflight_failed", details: badProbe, refunded: totalCost }, 422);
    }

    // ── Deep audio preflight: Sync.so often reports only "unknown error" for
    // malformed, silent, or shorter-than-video WAV inputs. Validate the real
    // bytes before dispatch so failures become actionable and refundable here.
    const audioDiagnostics = await Promise.all(
      builtPasses.map(async (p) => {
        try {
          const diag = await inspectSpeakerAudioWithRetry(p.audio_url, 3);
          const durMismatch = diag.wav.durSec + 0.35 < totalSec;
          const silent = diag.vad.voicedSec < 0.15 && diag.vad.longestVoicedRun < 0.12;
          return { pass: p.idx, speaker: p.speaker_name, ok: !durMismatch && !silent, durMismatch, silent, ...diag };
        } catch (err) {
          const transient = isTransientFetchError(err);
          return {
            pass: p.idx,
            speaker: p.speaker_name,
            ok: false,
            transient,
            error: (err as Error).message,
          } as any;
        }
      }),
    );
    const badAudio = audioDiagnostics.find((d: any) => !d.ok) as any;
    if (badAudio) {
      // ── v71 — Transient fetch error handling ──────────────────────────
      // If the preflight failed ONLY because we couldn't fetch the WAV
      // (storage hiccup / signal timeout), this is NOT proof the audio is
      // invalid. Marking the scene `failed` here wipes the already-successful
      // v69 passes for the other speakers and refunds the full cost — which
      // is exactly the bug the user reported on the 4-speaker scene where
      // passes 1–3 finished and only pass 4 hit a 30s fetch timeout.
      //
      // Instead: leave dialog_shots untouched (so the chained webhook can
      // still advance), do NOT refund, and return 202 so the auto-trigger
      // re-invokes us on the next 8s tick. The single-flight lock release
      // happens in the outer `finally`.
      const allBadAreTransient = audioDiagnostics
        .filter((d: any) => !d.ok)
        .every((d: any) => d?.transient === true);
      if (allBadAreTransient) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} AUDIO PREFLIGHT TRANSIENT — keeping pass state, will retry on next tick (isAdvance=${isAdvance})`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_status: "PREFLIGHT_TRANSIENT", error_class: "audio_fetch_transient",
          error_message: badAudio.error ?? "transient_audio_fetch_failure",
          meta: { audio_diagnostics: audioDiagnostics, expected_total_sec: totalSec, is_advance: isAdvance },
        });
        // v71 — when this is a webhook-driven `advance` call, the auto-trigger
        // will NOT re-pick the scene (it only re-invokes pending scenes). Self-
        // reschedule the same advance call after a short delay so pass N+1
        // gets dispatched as soon as Storage settles.
        if (isAdvance) {
          try {
            EdgeRuntime.waitUntil((async () => {
              // v167 speedup #3 — was 8_000ms; 2s is enough for Storage propagation
              // and saves 6s per transient audio-preflight self-retry. Single-shot,
              // not a loop — Folge-Fail führt sauber in den Hard-Fail-Pfad mit Refund.
              await new Promise((r) => setTimeout(r, 2_000));
              try {
                await supabase.functions.invoke("compose-dialog-segments", {
                  body: { scene_id: sceneId, advance: true },
                });
              } catch (e) {
                console.warn(
                  `[compose-dialog-segments] scene=${sceneId} self-retry after transient preflight failed: ${(e as Error)?.message ?? e}`,
                );
              }
            })());
          } catch { /* EdgeRuntime not available in some test contexts */ }
        }
        return json(
          { ok: true, status: "preflight_transient_retry_later", scene_id: sceneId, audio_diagnostics: audioDiagnostics },
          202,
        );
      }


      const reason = badAudio.error
        ? `audio_invalid_${badAudio.error}`
        : badAudio.silent
          ? "audio_silent_no_voice_detected"
          : `audio_too_short_${Number(badAudio.wav?.durSec ?? 0).toFixed(2)}s_expected_${totalSec}s`;
      console.error(`[compose-dialog-segments] scene=${sceneId} AUDIO PREFLIGHT BLOCK ${reason}`);
      const alreadyRefunded = !!(existing as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({ balance: Number(w0?.balance ?? 0) + totalCost, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }
      // ── V510-P0 — a preflight gate, re-entered by every `advance` and
      // `retry` invocation. The write looked root-only, but
      // `mergeDialogShots` is a shallow spread over the scene read at
      // entry, so the full-column UPDATE shipped `existing.passes` with
      // it — and on a re-entrant invocation the siblings in that snapshot
      // already hold bound job ids. The root merge now happens server-side.
      const v510Root7: Record<string, unknown> = {
        version: 5,
        engine: "sync-segments",
        status: "failed",
        cost_credits: Number((existing as any)?.cost_credits ?? totalCost),
        refunded: !alreadyRefunded,
        error: reason,
        audio_diagnostics: audioDiagnostics,
        finished_at: new Date().toISOString(),
      };
      await v510Terminalize({
        passIdx: null,
        passPatch: null,
        rootPatch: v510Root7,
        scenePatch: {
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: `syncso_audio_preflight_${reason}`,
        },
        reason: String(v510Root7.error ?? "terminal"),
      });
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED", error_class: "audio_invalid",
        error_message: reason,
        meta: { audio_diagnostics: audioDiagnostics, expected_total_sec: totalSec },
      });
      return json({ error: "audio_preflight_failed", reason, refunded: alreadyRefunded ? 0 : totalCost }, 422);
    }

    // ── Face-gate per pass (one frame check per speaker's first turn) ────
    // For 1- and 2-speaker scenes: keep the legacy "any face visible" check
    // unchanged (those flows were stable). For 3+ speakers we additionally
    // validate that a face actually exists at the per-speaker target
    // coordinates BEFORE paying Sync.so — otherwise Sync.so returns the
    // opaque "An unknown error occurred." and burns credits / time.
    if (!isAdvance) {
      // v78 (June 9 2026) — Strict gate is now CONDITIONAL on plate identity.
      // v77 made the gate unconditional for 3+ speakers, which blocked
      // every scene whenever `resolvePlateFaceIdentities` failed (e.g.
      // Hailuo MP4 without moov-atom → plate frame extract crashes →
      // `plateIdentityMap=off` → anchor-rescale coords drift 5-15% from
      // real plate faces → strict gate hard-rejects everything → user
      // sees "Lip-Sync hat keinen Avatar getroffen". Now: only enforce
      // strict per-coordinate matching when we actually have plate-pixel
      // coords (i.e. plate identity resolved at least one speaker).
      // Otherwise fall back to v76 soft-pass + face-repair behaviour.
      const havePlateIdentity =
        !!plateIdentityMap && plateIdentityMap.resolvedCount > 0;
      const strictTargetCheck =
        speakers.length >= 3 && !!plateDims && havePlateIdentity;
      if (speakers.length >= 3 && !havePlateIdentity) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v78 soft-pass: ` +
          `plateIdentity unavailable for ${speakers.length} speakers — ` +
          `falling back to face-repair instead of hard-block`,
        );
      }

      // ══ V533-OBS — GATE / CANDIDATE BOUNDARY TELEMETRY ═══════════════
      //
      // Purely additive forensics for the Gen31 WORKER_RESOURCE_LIMIT kill:
      // the isolate died somewhere inside the gate fan-out with no persisted
      // marker. These three verdicts bracket the fan-out and every V530
      // candidate so an absence becomes readable evidence. No business
      // branch may consume any of these fields.
      const v533T0 = Date.now();
      const v533Memory = (): Record<string, number> => {
        try {
          const m = (Deno as any)?.memoryUsage?.();
          if (!m) return {};
          const out: Record<string, number> = {};
          if (Number.isFinite(m.rss)) out.rss = Number(m.rss);
          if (Number.isFinite(m.heapUsed)) out.heap_used = Number(m.heapUsed);
          if (Number.isFinite(m.external)) out.external = Number(m.external);
          return out;
        } catch {
          return {};
        }
      };
      const v533Observe = async (
        verdict: string,
        details: Record<string, unknown>,
      ): Promise<void> => {
        try {
          await recordCallbackObservation(supabase, {
            handler: "compose-dialog-segments",
            verdict,
            stage: "dialog_dispatch",
            pipelineJobId: null,
            sceneId: sceneId ?? null,
            runId: v510RunId ?? null,
            plateGeneration: Number((scene as any)?.plate_generation ?? 0),
            externalJobId: null,
            details,
          });
        } catch {
          // doubly fail-open: telemetry never reaches the dispatcher
        }
      };

      // v97 (Juni 10 2026) — Face-Gate-Repair PARALLEL statt seriell.
      // Vorher: 4 Sprecher × ~12 s Gemini-Frame-Detect = ~50 s wallclock.
      // Jetzt: alle Passes laufen via Promise.all (frame_face_cache dedupliziert
      // identische Frames automatisch) → ~12-15 s wallclock.
      type GateOutcome =
        | { ok: true; pass: any }
        | {
          ok: false;
          pass: any;
          reason: string;
          strict: boolean;
          hadFaces: boolean;
          frames: number[];
          lastValidationFrame?: number;
          // V523 — an identity refusal is never demoted to a soft pass.
          identityHardFail?: boolean;
          identityDetail?: Record<string, unknown> | null;
        };

      const gateOne = async (pass: any): Promise<GateOutcome> => {
        const firstTurn = pass.segments[0];
        if (!firstTurn) return { ok: true, pass };
        const frames = strictTargetCheck
          ? frameCandidatesForTurn(firstTurn, totalSec, ASSUMED_FPS)
          : uniqueSortedFrames([((firstTurn.startTime + firstTurn.endTime) / 2) * ASSUMED_FPS]);
        let accepted = false;
        let lastValidation: any = null;
        // V523 — the last identity refusal, kept so a block can name the
        // real cause instead of a generic validation failure.
        let v523LastRefusal: {
          frame: number;
          reference: IdentityReference | null;
          repair: IdentityRepairResult | null;
        } | null = null;
        // V533-OBS — candidate ordinal, telemetry only.
        let v533CandidateIdx = -1;
        for (const frame of frames) {
          v533CandidateIdx++;
          let targetCoordsForCheck: [number, number] | null = null;
          if (strictTargetCheck && plateDims) {
            const c = pass.coords;
            if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
              targetCoordsForCheck = [
                Math.min(1, Math.max(0, Number(c[0]) / plateDims.width)),
                Math.min(1, Math.max(0, Number(c[1]) / plateDims.height)),
              ];
            }
          }
          const v = await validateFrameFace({
            supabaseUrl, serviceKey,
            videoUrl: sourceClipUrl,
            frameNumber: frame, fps: ASSUMED_FPS,
            targetCoords: targetCoordsForCheck,
          });
          lastValidation = { ...v, frame, targetCoordsForCheck };
          if (v.ok && !v.faceVisible) continue;

          const faceBoxes = Array.isArray(v.faceBoxes) ? [...v.faceBoxes] : [];
          const sortedBoxes = faceBoxes
            .filter((b: any) => Number(b?.w) > 0.02 && Number(b?.h) > 0.02)
            .sort((a: any, b: any) => Number(a.x) - Number(b.x));
          const enoughFaces = sortedBoxes.length >= Math.max(1, speakers.length);
          const speakerHasOwnSlot = pass.speaker_idx < sortedBoxes.length;
          const canRepair = speakerHasOwnSlot && (speakers.length < 3 || enoughFaces);
          const slot = canRepair ? pass.speaker_idx : -1;
          const box = slot >= 0 ? sortedBoxes[slot] : null;

          // ══ V523 — IDENTITY IS THE REPAIR AUTHORITY ══════════════════
          //
          // `sortedBoxes[speaker_idx]` above is a left-to-right ordinal.
          // It answers WHERE a face is standing on this frame, never WHO
          // it is. Generation 19, Sarah: the ordinal picked a face at
          // [91,471] while her assignment-locked identity sat at
          // [108,280,178,386] — 52 px left and 138 px down. The tracker
          // followed that region, V520 rejected all six samples as
          // scale-incoherent, and the scene terminalized on
          // `no_coherent_track_samples`. Every gate downstream was right
          // about a face that was never hers.
          //
          // For 3+ speakers the ordinal is now telemetry. The face is
          // chosen by the SAME continuation rule the turn tracker uses,
          // against the characterId-locked reference — IoU floor, centre
          // drift, sibling veto, ambiguity refusal, all pre-existing. If
          // no candidate is a provable continuation, there is no repair.
          //
          // 1- and 2-speaker scenes keep the legacy path byte for byte.
          const v523NeedsIdentity = speakers.length >= 3 && !!plateDims;
          let v523Ref: IdentityReference | null = null;
          let v523Repair: IdentityRepairResult | null = null;
          // V530 — which picture, which clock, which detector answered.
          let v530Telemetry: Record<string, unknown> | null = null;
          if (v523NeedsIdentity && box && plateDims) {
            // V524 — this character's face as measured on the actual base
            // video, found by characterId and fenced to this scene, run,
            // generation and base-video URL. When it exists it outranks
            // every anchor-derived box; when it does not and the legacy
            // geometry is anchor-native, V523 refuses with
            // `reference_space_mismatch` instead of comparing two
            // different pictures.
            const v524Own = findPlateNativeRecord(
              v524Records,
              speakers[pass.speaker_idx]?.character_id ?? null,
              v524Fence,
            );
            v523Ref = resolveLockedIdentityReference({
              speakerIdx: pass.speaker_idx,
              assignmentLock: finalAssignmentLock,
              speakerCharacterId: speakers[pass.speaker_idx]?.character_id ?? null,
              plateFaces: (plateIdentityMap?.faces ??
                (persistedPlateIdentity as any)?.faces ?? null) as any,
              hydratedBbox: speakerPlateBboxes[pass.speaker_idx],
              hydratedMouth: speakerPlateMouths[pass.speaker_idx],
              hydratedSource: coordSources[pass.speaker_idx] ?? null,
              plateNativeBbox: v524Own?.bbox ?? null,
              referenceSpace: v524LegacySpace,
            });
            // The sibling veto tests the assignment-locked cast, the same
            // identity map Contract E.3 uses. Identity outranks proximity.
            // V524 — the exclusivity check compares boxes, so the siblings
            // must be measured on the same picture as the target. Mixing a
            // plate-native target with anchor-native siblings would make
            // the cross-claim test meaningless in exactly the way the
            // target comparison was.
            const v523Siblings: Array<[number, number]> = [];
            const v523SiblingRefs: Array<[number, number, number, number]> = [];
            const v524TargetIsPlateNative = v523Ref?.space === "plate_native";
            for (let si = 0; si < speakers.length; si++) {
              if (si === pass.speaker_idx) continue;
              const sibPlate = v524TargetIsPlateNative
                ? findPlateNativeRecord(
                  v524Records,
                  speakers[si]?.character_id ?? null,
                  v524Fence,
                )?.bbox ?? null
                : null;
              const sb = v524TargetIsPlateNative ? sibPlate : speakerPlateBboxes[si];
              if (Array.isArray(sb) && sb.length === 4) {
                v523Siblings.push(centerOfBox(sb as [number, number, number, number]));
                v523SiblingRefs.push(sb as [number, number, number, number]);
              }
            }
            // ══ V530 — SAME PICTURE, SAME DETECTOR, SAME CLOCK ═══════════
            //
            // `frame` counts in ASSUMED_FPS because the surrounding gate
            // and its legacy validation still do. The still authority
            // counts in STILL_FPS. Reinterpreting 54 as a 30-fps frame
            // would move the sample 0.45 s earlier, so the TIME is carried
            // across instead and re-quantised with the same rounding
            // `uniqueSortedFrames` and V526-A already use.
            const v530SampleSec = frame / ASSUMED_FPS;
            const v530Frame = Math.max(0, Math.round(v530SampleSec * STILL_FPS));
            const v530 = await v530TargetFaces(v530Frame);
            // V533-OBS — bounded scalars only; absence of this row means the
            // isolate died inside fetch/decode. Never consumed by business code.
            await v533Observe("v530_candidate_done", {
              pass_idx: Number.isFinite(pass?.idx) ? Number(pass.idx) : null,
              candidate_index: v533CandidateIdx,
              gate_frame: frame,
              v530_frame: v530Frame,
              v530_ok: v530.ok === true,
              decode_completed: (v530 as any).decodeCompleted === true,
              still_bytes: Number.isFinite((v530 as any).stillBytes)
                ? Number((v530 as any).stillBytes)
                : null,
              still_w: Number.isFinite(v530.stillDims?.width) ? Number(v530.stillDims?.width) : null,
              still_h: Number.isFinite(v530.stillDims?.height) ? Number(v530.stillDims?.height) : null,
              decode_ms: Number.isFinite((v530 as any).decodeMs)
                ? Number((v530 as any).decodeMs)
                : null,
              elapsed_ms: Date.now() - v533T0,
              ...v533Memory(),
            });
            v530Telemetry = {
              gate_frame: frame,
              fps_authority: STILL_FPS,
              sample_time_sec: Number(v530SampleSec.toFixed(3)),
              still_frame: v530Frame,
              candidate_source: "plate_native_aws_detect_faces",
              candidate_count: v530.candidates.length,
              still_cache_hit: v530.cacheHit ?? false,
              requested_raster: v530.requestedRaster ?? null,
              actual_raster: v530.actualRaster ?? null,
              reason: v530.reason ?? null,
            };
            console.log(
              `[compose-dialog-segments] scene=${sceneId} pass=${pass.idx} v530_target ` +
                `gate_frame=${frame} fps_authority=${STILL_FPS} sample_sec=${v530SampleSec.toFixed(3)} ` +
                `still_frame=${v530Frame} ok=${v530.ok} candidates=${v530.candidates.length} ` +
                `source=plate_native_aws_detect_faces cache_hit=${v530.cacheHit ?? false} ` +
                `requested_raster=${v530.requestedRaster ?? "-"} actual_raster=${v530.actualRaster ?? "-"} ` +
                `reason=${v530.reason ?? "-"}`,
            );
            if (!v530.ok) {
              // Fail closed. There is no second measurement to fall back to:
              // the Gemini/MediaPipe boxes are exactly what V530 removed from
              // this authority, and a positional slot was never one.
              v523Repair = {
                ok: false,
                reason: "identity_unresolved",
                candidatesConsidered: 0,
                positionalWouldHavePicked: null,
                detail: v530.reason ?? "v530_target_unavailable",
              };
            } else {
              v523Repair = resolveIdentityLockedRepair({
                reference: v523Ref,
                // V530 — AWS DetectFaces boxes on the V528 raster-fenced
                // still, converted by the same `stillBoxToSource` the turn
                // tracker uses. The same kind of measurement as the
                // reference, so IoU and centre drift mean something.
                candidates: v530.candidates,
                siblingCenters: v523Siblings,
                siblingReferences: v523SiblingRefs,
                // The diagnostic now derives from the SAME candidate set it
                // is compared against; it never sourced authority and now
                // cannot imply a detector that no longer feeds this path.
                positionalSlot: slot >= 0 ? slot : null,
                pick: pickAssignedFace,
              });
            }
          }

          // v96 — Multi-speaker: prefer plate-derived coords over anchor rescale.
          const shouldForceRepair =
            speakers.length >= 3 && !!plateDims && !!box && enoughFaces;

          if (!shouldForceRepair && (!strictTargetCheck || v.coordsMatch !== false)) {
            pass.reference_frame_number = frame;
            accepted = true;
            break;
          }
          if (box && plateDims) {
            // ══ V538 B — THE ANCHOR IS THE AUTHORITY AGAIN ═══════════════
            //
            // v400's invariant is that geometry is measured on
            // `reference_image_url`. V524–V530 moved the measurement onto
            // stills of the GENERATED plate, which makes every dispatch
            // depend on the i2v result being biometrically resolvable in a
            // single frame. Any camera move or head turn then terminalizes
            // the scene (`face_repair_identity_unresolved`) although the
            // identity itself was never in doubt.
            //
            // The V523/V524/V526/V530 chain stays exactly where it is and
            // keeps measuring — it simply loses its VETO. When it cannot
            // prove a continuation, the anchor-locked reference box (the
            // assignment lock, i.e. the v400 authority) drives the repair,
            // and only if that is missing does the legacy positional slot
            // answer. The refusal is recorded as telemetry either way.
            let v538IdentityDowngrade: Record<string, unknown> | null = null;
            const v538AnchorBox =
              Array.isArray(v523Ref?.bbox) && (v523Ref!.bbox as number[]).length === 4
                ? (v523Ref!.bbox as [number, number, number, number])
                : null;
            if (v523NeedsIdentity && !v523Repair?.ok) {
              v523LastRefusal = { frame, reference: v523Ref, repair: v523Repair };
              v538IdentityDowngrade = {
                repair_reason: v523Repair?.reason ?? "no_result",
                repair_detail: v523Repair?.detail ?? null,
                candidates_considered: v523Repair?.candidatesConsidered ?? 0,
                reference_ok: v523Ref?.ok ?? false,
                reference_space: v523Ref?.space ?? "unknown",
                fallback: v538AnchorBox ? "anchor_reference_bbox" : "plate_positional_slot",
                frame,
              };
              console.warn(
                `[compose-dialog-segments] scene=${sceneId} v538_identity_veto_downgraded ` +
                  `pass=${pass.idx} speaker=${pass.speaker_name} frame=${frame} ` +
                  `reason=${v523Repair?.reason ?? "no_result"} detail=${v523Repair?.detail ?? "-"} ` +
                  `ref=${v523Ref?.ok ? v523Ref.source : (v523Ref?.reason ?? "none")} ` +
                  `candidates=${v523Repair?.candidatesConsidered ?? 0} ` +
                  `fallback=${v538AnchorBox ? "anchor_reference_bbox" : "plate_positional_slot"} ` +
                  `positional_would_have=${JSON.stringify(v523Repair?.positionalWouldHavePicked ?? null)}`,
              );
            }
            const v523Box = v523Repair?.ok
              ? (v523Repair.bbox ?? null)
              : v538AnchorBox;
            // Same 0.45 face-height mouth ratio as before; only the box it
            // is measured on changed, from an ordinal to an identity.
            const repaired: [number, number] = v523Box
              ? [
                Math.round((v523Box[0] + v523Box[2]) / 2),
                Math.round(v523Box[1] + (v523Box[3] - v523Box[1]) * 0.45),
              ]
              : [
                Math.round((Number(box.x) + Number(box.w) / 2) * plateDims.width),
                Math.round((Number(box.y) + Number(box.h) * 0.45) * plateDims.height),
              ];
            const original = pass.coords;
            pass.coords = clampSyncCoords(repaired);
            pass.reference_frame_number = frame;
            pass.face_repair = {
              source: v538IdentityDowngrade
                ? (v523Box ? "v538_anchor_reference_repair" : "v538_positional_downgrade")
                : v523Box
                ? "v523_identity_locked_repair"
                : shouldForceRepair
                ? "v96_plate_frame_force_repair"
                : "plate_frame_left_to_right",
              // V538 B — non-null whenever the plate-native chain refused and
              // the anchor took over. Telemetry; nothing branches on it.
              v538_identity_downgraded: v538IdentityDowngrade,
              frame_number: frame,
              original_coords: original,
              repaired_coords: pass.coords,
              face_count: sortedBoxes.length,
              slot,
              strict_gate: strictTargetCheck,
              // V523 — identity provenance, and what the retired
              // left-to-right rule would have answered instead.
              v523_character_id: v523Ref?.characterId ?? null,
              v523_reference_source: v523Ref?.ok ? v523Ref.source : null,
              v523_reference_bbox: v523Ref?.bbox ?? null,
              // V524 — which picture the reference was measured on.
              v524_reference_space: v523Ref?.space ?? "unknown",
              v524_registration_frame: v524Registration?.frameNumber ?? null,
              v524_legacy_space: v524LegacySpace,
              v523_iou: v523Repair?.iou ?? null,
              // V530 — the diagnostic now derives from the SAME AWS
              // candidate set V523 judged, not from a different detector.
              v523_positional_would_have: v523Repair?.positionalWouldHavePicked ?? null,
              v530_target: v530Telemetry,
              // V532-A — telemetry only: did this speaker resolve on any
              // earlier registration attempt? Read by nothing.
              v532a_target_partial: v532aTargetPartial(
                v523Ref?.characterId ?? speakers[pass.speaker_idx]?.character_id ?? null,
              ),
            };
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} FACE-GATE REPAIR (${shouldForceRepair ? "v96-force" : "strict"}) pass=${pass.idx} speaker=${pass.speaker_name} frame=${frame} original=${JSON.stringify(original)} repaired=${JSON.stringify(pass.coords)} faces=${sortedBoxes.length}`,
            );
            accepted = true;
            break;
          }
          if (!strictTargetCheck) {
            pass.reference_frame_number = frame;
            accepted = true;
            break;
          }
        }
        if (!accepted) {
          const hadFaces = !!lastValidation?.faceVisible;
          // V523 — when every candidate frame refused on identity, that IS
          // the cause. Reporting `face_validation_failed` would repeat the
          // generation-18 mistake of letting a consequence name the fault.
          if (v523LastRefusal) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v523_FACE_REPAIR_IDENTITY_UNRESOLVED ` +
                `pass=${pass.idx} speaker=${pass.speaker_name} ` +
                `character=${v523LastRefusal.reference?.characterId ?? "unknown"} ` +
                `reason=${v523LastRefusal.repair?.reason ?? "no_result"} ` +
                `ref=${v523LastRefusal.reference?.ok ? v523LastRefusal.reference.source : (v523LastRefusal.reference?.reason ?? "none")} ` +
                `frames=${frames.join(",")} — refund + block, no provider dispatch`,
            );
            return {
              ok: false,
              pass,
              reason:
                `face_repair_identity_unresolved_pass_${pass.idx}_speaker_${pass.speaker_name}`,
              strict: strictTargetCheck,
              hadFaces: true,
              frames,
              lastValidationFrame: v523LastRefusal.frame,
              identityHardFail: true,
              identityDetail: {
                character_id: v523LastRefusal.reference?.characterId ?? null,
                reference_ok: v523LastRefusal.reference?.ok ?? false,
                reference_source: v523LastRefusal.reference?.ok
                  ? v523LastRefusal.reference.source
                  : null,
                reference_reason: v523LastRefusal.reference?.ok
                  ? null
                  : (v523LastRefusal.reference?.reason ?? null),
                reference_bbox: v523LastRefusal.reference?.bbox ?? null,
                reference_space: v523LastRefusal.reference?.space ?? "unknown",
                v524_registration_ok: v524Registration?.ok ?? false,
                v524_registration_reason: v524Registration?.reason ?? null,
                v524_registration_frame: v524Registration?.frameNumber ?? null,
                v524_legacy_space: v524LegacySpace,
                repair_reason: v523LastRefusal.repair?.reason ?? null,
                repair_detail: v523LastRefusal.repair?.detail ?? null,
                candidates_considered: v523LastRefusal.repair?.candidatesConsidered ?? 0,
                positional_would_have: v523LastRefusal.repair?.positionalWouldHavePicked ?? null,
                frame: v523LastRefusal.frame,
                // V532-A — telemetry only, attached to the refusal report.
                v532a_target_partial: v532aTargetPartial(
                  v523LastRefusal.reference?.characterId ??
                    speakers[pass.speaker_idx]?.character_id ?? null,
                ),
              },
            };
          }
          const reason = strictTargetCheck && hadFaces
            ? `plate_target_face_missing_pass_${pass.idx}_speaker_${pass.speaker_name}`
            : `face_validation_failed_pass_${pass.idx}_frame_${lastValidation?.frame ?? frames[0] ?? 0}`;
          // v139 — Defer the log emission. v119 may demote this to SOFT_WARN
          // below when plate-identity is authoritative. Logging "BLOCK" here
          // first and then "SOFT_WARN proceed" later confused forensics on
          // scene b1ee2ede… The single, truthful log is emitted after the
          // v119 decision below.
          return {
            ok: false, pass, reason,
            strict: strictTargetCheck, hadFaces, frames,
            lastValidationFrame: lastValidation?.frame,
          };
        }
        return { ok: true, pass };
      };

      // ══ V524 — REGISTER IDENTITY IN PLATE-NATIVE GEOMETRY ════════════
      //
      // Generation 20: V523 refused Sarah's repair with
      // `identity_unresolved`, and it was right to. The reference it was
      // handed was [269,84,343,204]; her actual face on the probed frame
      // was [87,192,275,378]. Centre distance 188 px, IoU 0.002, width 74
      // against 188. The identity was correct and the picture was not.
      //
      // The v278 router's own comment says why: Rekognition cannot read
      // MP4 bytes, so it detects on the ANCHOR STILL and scales the boxes
      // into plateDims. That is anchor composition wearing plate units,
      // and it stops being true the moment the generated video reframes.
      //
      // Rekognition does read a JPEG. The pipeline already extracts stills
      // from a video and already matches faces to characters
      // biometrically; pointing the second at the first measures identity
      // AND geometry on the same actual plate frame. No new detector and
      // no new frame authority — the candidates are frames the gate
      // already probes, capped at three.
      // ══ V526-A — LOOK AT THE SCENE, NOT AT ONE SECOND OF IT ══════════
      //
      // Generation 23: V525 delivered three real stills and V524 resolved
      // 3/4 on every one — Matthew missing at frames 6 and 8, Kay missing
      // at 30. The reading that suggests itself is that demanding 4/4 in
      // one frame is too strict. The measurement says otherwise.
      //
      // All three candidates came from `frameCandidatesForTurn` over the
      // FIRST TURN of the FIRST PASS. At the renderer's real 30 fps that
      // is 0.20 s, 0.27 s and 1.00 s of a fifteen-second plate: three
      // looks at the same single second. In a four-person shot with
      // blocking, nobody should expect all four to be well-posed there.
      //
      // That selector answers a per-pass question — "is this speaker
      // visible around their turn". Registration asks a scene question.
      // Answering the second with the first is the same shape of error
      // this pipeline has been closing since V516: correct arithmetic
      // over the wrong object, here the wrong stretch of time.
      //
      // Second defect in the same line: the conversion used
      // `ASSUMED_FPS = 24` while the still composition runs at 30, so
      // every requested frame arrived ~20 % earlier than intended.
      //
      // Still three frames, still 4/4 in ONE of them, still no
      // aggregation and no mixed-frame geometry. Only the clock changed.
      const v526Selection = selectSceneIdentityFrames({
        totalSec,
        fps: STILL_FPS,
        maxFrames: 3,
        turnLocalFallback: () =>
          builtPasses.length > 0 && builtPasses[0]?.segments?.[0]
            ? frameCandidatesForTurn(builtPasses[0].segments[0], totalSec, ASSUMED_FPS)
            : [],
      });
      const v524Frames = v526Selection.frames;
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v526_scene_frame_authority ` +
          JSON.stringify(buildSceneFrameTelemetry(v526Selection)),
      );
      let v524Registration: PlateIdentityRegistration | null = null;
      let v524Records: PlateNativeIdentityRecord[] = [];
      // V526-B — accepted biometric records per attempted frame.
      // V532-A — hoisted from the registration block for TELEMETRY SCOPE
      // ONLY, so the gate can report what earlier attempts saw. Its writes
      // and business reads are unchanged.
      const v526bEvidence: FrameAttemptEvidence[] = [];
      /**
       * V532-A — OBSERVABILITY ONLY.
       *
       * Did the target speaker resolve biometrically on ANY attempted
       * registration frame (not just the last one)? Pure read over the
       * existing V526-B evidence; no branch, guard, dispatch decision,
       * V523 input, sibling set or candidate selection may consume it.
       */
      const v532aTargetPartial = (characterId?: string | null) => {
        const want = String(characterId ?? "")
          .toLowerCase()
          .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
        if (!want) {
          return { target_partial_present: false, target_partial_similarity: null, target_partial_frame: null };
        }
        for (const att of v526bEvidence) {
          for (const rec of att?.records ?? []) {
            const got = String((rec as any)?.characterId ?? "")
              .toLowerCase()
              .replace(/^(outfit|pose|wardrobe|vibe|prop|look):/, "");
            if (got === want) {
              return {
                target_partial_present: true,
                target_partial_similarity: (rec as any)?.similarity ?? null,
                target_partial_frame: att?.frame ?? (rec as any)?.frameNumber ?? null,
              };
            }
          }
        }
        return { target_partial_present: false, target_partial_similarity: null, target_partial_frame: null };
      };
      // What the LEGACY identity geometry was measured on. `anchor_native`
      // is the generation-20 case and is no longer usable as plate
      // geometry, however cleanly it is scaled.
      const v524LegacySpace: PlateGeometrySpace = classifyIdentityMapSpace({
        detector: (plateIdentityMap as any)?.detector ??
          (persistedPlateIdentity as any)?.detector ?? null,
        assignmentLockSource: (plateIdentityMap as any)?.assignmentLockSource ??
          (persistedPlateIdentity as any)?.assignmentLockSource ?? null,
      });
      const v524BaseVideoUrl = sourceClipUrl ?? null;
      const v524PlateGeneration = Number((scene as any)?.plate_generation ?? 0);
      const v524Fence: PlateNativeFence = {
        sceneId,
        runId: v510RunId,
        plateGeneration: v524PlateGeneration,
        baseVideoUrl: String(v524BaseVideoUrl ?? ""),
        plateDims: plateDims ?? { width: 0, height: 0 },
      };
      // ══ V530 — ONE PLATE-NATIVE STILL AUTHORITY FOR THE WHOLE GATE ══
      //
      // Generation 28: V528 delivered a 1284x718 plate raster, V529/V524
      // registered all four characters on frame 23 with AWS CompareFaces —
      // Sarah at [240,116,335,254], similarity 97.62 — and V523 then
      // refused her at its repair frame. The reference was an AWS face box
      // measured on the V528 still. The candidates came from
      // `validate-frame-face`, whose persisted cache row names the
      // validator: google/gemini-2.5-flash. Sarah's box is 95x138; the
      // candidate a language model estimated is 321x431 — 10.55x the area,
      // IoU 0.0948, centre 152 px away. Both continuation gates refused,
      // correctly. The arithmetic was right; the two boxes are measurements
      // of different things.
      //
      // So the acquisition moves up one scope and serves the whole gate.
      // Nothing about it changes: same source-fenced cache, same raster
      // fence, same single call site into `extractPlateFrame`.
      // V528 — the raster the identity stills were actually rendered at.
      // Kept outside the per-attempt holder so the persisted snapshot can
      // still name it after the bounded loop has cleared `last`.
      const v528Raster: { requested: string | null; actual: string | null } = {
        requested: null,
        actual: null,
      };
      const v525RenderStill = (() => {
        try {
          return defaultRenderStill();
        } catch (e) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v525_still_renderer_unavailable ` +
              `reason=${(e as Error)?.message ?? e}`,
          );
          return null;
        }
      })();
      // V525/V526-B — ONE acquisition path. Both the registration loop and
      // the common-frame completion go through it, so every still comes
      // from the same source-fenced cache and a frame already rendered is
      // never rendered twice.
      const v525Acquire = async (frameNumber: number): Promise<PlateFrameExtractResult> => {
        if (!v525RenderStill) {
          return {
            ok: false,
            frameNumber,
            reason: "probe_cache_miss",
            detail: "still renderer unavailable",
          };
        }
        const r = await extractPlateFrame({
          userId,
          projectId: String((scene as any)?.project_id ?? ""),
          sceneId,
          baseVideoUrl: v524BaseVideoUrl,
          totalSec,
          // V528 — the raster the still must be rendered at. Same probe
          // that feeds the V524 fence, so the still and the plate end up
          // being measurements of one picture rather than two.
          plateDims,
          frameNumber,
          timeoutMs: 30_000,
          fingerprint: async (value) => {
            const d = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(value) as unknown as BufferSource,
            );
            return Array.from(new Uint8Array(d))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")
              .slice(0, 32);
          },
          readCache: async (path) => {
            const signed = await supabase.storage
              .from("composer-frames")
              .createSignedUrl(path, 60 * 30);
            if (signed.error || !signed.data?.signedUrl) return null;
            const head = await fetch(signed.data.signedUrl, {
              method: "HEAD",
              signal: AbortSignal.timeout(3_000),
            }).catch(() => null);
            return head?.ok ? signed.data.signedUrl : null;
          },
          renderStill: v525RenderStill,
          writeCache: async (path, bytes) => {
            const up = await supabase.storage
              .from("composer-frames")
              .upload(path, bytes, {
                contentType: "image/jpeg",
                upsert: true,
              });
            if (up.error) return null;
            const signed = await supabase.storage
              .from("composer-frames")
              .createSignedUrl(path, 60 * 30);
            return signed.data?.signedUrl ?? null;
          },
        });
        const rr = r.requestedRaster;
        const ar = r.actualRaster;
        if (rr) v528Raster.requested = `${rr.width}x${rr.height}`;
        if (ar) v528Raster.actual = `${ar.width}x${ar.height}`;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v525_plate_frame_extract ` +
            `frame=${r.frameNumber} ok=${r.ok} source=${r.source ?? "-"} ` +
            `cache_hit=${r.cacheHit ?? false} bytes=${r.bytes ?? 0} ` +
            `requested_raster=${rr ? `${rr.width}x${rr.height}` : "-"} ` +
            `actual_raster=${ar ? `${ar.width}x${ar.height}` : "-"} ` +
            `reason=${r.reason ?? "-"} detail=${r.detail ?? "-"}`,
        );
        return r;
      };

      /**
     * V530 — THE REPAIR FRAME, MEASURED THE SAME WAY AS THE REFERENCE.
     *
     * The V524 reference is an AWS DetectFaces box on a V528 raster-fenced
     * still. Until now the V523 candidates came from `validate-frame-face`,
     * which in generation 28 answered with google/gemini-2.5-flash — a
     * language model asked to estimate normalized boxes. Comparing the two
     * by IoU is the referent split V524, V527 and V528 each closed one layer
     * lower: correct arithmetic on incommensurable measurements.
     *
     * So the repair frame is acquired through the SAME `v525Acquire` and
     * read by the SAME detector, then converted by the SAME
     * `stillBoxToSource` the turn tracker and V526-B already use. No new
     * geometry, no second cache, no threshold.
     *
     * `mouth` stays null exactly as V526-B leaves it: the V456 tiebreak is
     * unreachable in this path and V530 does not pretend otherwise.
     */
      const v530Detect = (() => {
        try {
          return defaultDetectFaces();
        } catch (e) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} v530_detector_unavailable ` +
              `reason=${(e as Error)?.message ?? e}`,
          );
          return null;
        }
      })();
      type V530Target = {
        ok: boolean;
        candidates: Array<{ bbox: [number, number, number, number]; mouth: [number, number] | null }>;
        reason?: string;
        cacheHit?: boolean;
        requestedRaster?: string | null;
        actualRaster?: string | null;
        stillDims?: { width: number; height: number } | null;
        /** V533-OBS — diagnostic only; omitted means "unknown", never a business condition. */
        stillBytes?: number | null;
        decodeMs?: number | null;
        decodeCompleted?: boolean;
      };
      const v530TargetFaces = async (frameNumber: number): Promise<V530Target> => {
        if (!plateDims) return { ok: false, candidates: [], reason: "v530_plate_dims_unavailable" };
        if (!v530Detect) return { ok: false, candidates: [], reason: "v530_detector_unavailable" };
        const got = await v525Acquire(frameNumber);
        const rr = got.requestedRaster ? `${got.requestedRaster.width}x${got.requestedRaster.height}` : null;
        const ar = got.actualRaster ? `${got.actualRaster.width}x${got.actualRaster.height}` : null;
        if (!got.ok || !got.imageUrl) {
          return {
            ok: false,
            candidates: [],
            reason: `v530_target_still_failed:${got.reason ?? "no_url"}`,
            cacheHit: got.cacheHit ?? false,
            requestedRaster: rr,
            actualRaster: ar,
          };
        }
        // V533-OBS — diagnostic only, never read by a business branch.
        let v533StillBytes: number | null = null;
        let v533DecodeMs: number | null = null;
        let v533DecodeCompleted = false;
        try {
          const res = await fetch(got.imageUrl, { signal: AbortSignal.timeout(20_000) });
          if (!res.ok) {
            return { ok: false, candidates: [], reason: `v530_target_still_http_${res.status}`, cacheHit: got.cacheHit ?? false, requestedRaster: rr, actualRaster: ar };
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          v533StillBytes = bytes.byteLength;
          const v533DecodeStart = performance.now();
          const img = jpegDecodeV526.decode(bytes, { useTArray: true });
          v533DecodeMs = performance.now() - v533DecodeStart;
          v533DecodeCompleted = true;
          const faces = await v530Detect(bytes, img.width, img.height, 20_000);
          return {
            ok: true,
            candidates: faces.map((f: any) => ({
              bbox: stillBoxToSource(
                f.bbox,
                plateDims!.width,
                plateDims!.height,
                img.width,
                img.height,
              ) as [number, number, number, number],
              mouth: null,
            })),
            cacheHit: got.cacheHit ?? false,
            requestedRaster: rr,
            actualRaster: ar,
            stillDims: { width: img.width, height: img.height },
            stillBytes: v533StillBytes,
            decodeMs: v533DecodeMs,
            decodeCompleted: v533DecodeCompleted,
          };
        } catch (e) {
          return {
            ok: false,
            candidates: [],
            reason: `v530_target_detect_failed:${(e as Error)?.message ?? e}`,
            cacheHit: got.cacheHit ?? false,
            requestedRaster: rr,
            actualRaster: ar,
            stillBytes: v533StillBytes,
            decodeMs: v533DecodeMs,
            decodeCompleted: v533DecodeCompleted,
          };
        }
      };

      const v524Needed = speakers.length >= 3 && !!plateDims && !!v524BaseVideoUrl &&
        characters.length > 0 && v524Frames.length > 0;
      if (v524Needed) {
        const v524Chars = characters
          .map((c: any) => ({
            characterId: String(c.characterId),
            portraitUrl: String(c.portraitUrl),
            speakerIdx: speakers.findIndex((sp: any) =>
              stripIdPrefixLocalV524(sp?.character_id) === stripIdPrefixLocalV524(c.characterId)
            ),
          }))
          .filter((c: any) => c.speakerIdx >= 0 && c.portraitUrl.length > 0);
        // ── V524-P0 — ONE REGISTRATION PER RUN, NOT PER DISPATCH ───────
        //
        // The face gate runs on every non-advance invocation: the initial
        // dispatch, and every retry or re-dispatch of the same run. The
        // picture has not changed between them, so neither has the answer
        // — and repeating it costs a frame extract, a DetectFaces and one
        // CompareFaces per character each time.
        //
        // A hit demands the whole set: the stored attempt succeeded, every
        // requested character has exactly one record, and each passes the
        // same scene/run/generation/base-video/dims fence a fresh one
        // would. A failed, partial or ambiguous attempt is never a hit;
        // caching a refusal as an answer is how a fail-closed gate stops
        // being one.
        const v524Stored = (persistedPlateIdentity as any)?.plateNative ?? null;
        const v524Reuse = reuseStoredRegistration({
          stored: v524Stored,
          characterIds: v524Chars.map((c: any) => c.characterId),
          fence: v524Fence,
        });
        if (v524Reuse.hit) {
          v524Records = v524Reuse.records;
          v524Registration = {
            ok: true,
            records: v524Reuse.records,
            frameNumber: v524Reuse.frameNumber ?? -1,
            frameUrl: null,
            diagnostics: {
              requested: v524Chars.length,
              resolved: v524Reuse.records.length,
              detected: v524Reuse.records.length,
              minSimilarity: v524Reuse.records.reduce<number | null>(
                (m, r) =>
                  r.similarity == null ? m : (m === null ? r.similarity : Math.min(m, r.similarity)),
                null,
              ),
              detectorDims: plateDims,
              rescaled: false,
            },
          };
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v524_plate_identity_reuse ` +
              `run=${v510RunId ?? "-"} gen=${v524PlateGeneration} ` +
              `frame=${v524Reuse.frameNumber ?? "-"} records=${v524Reuse.records.length} ` +
              `— no frame extract, no Rekognition call`,
          );
        }
        // ══ V525 — A REAL RASTER FROM THE ACTUAL PLATE ════════════════
        //
        // Generation 21 failed all three attempts on `frame_extract_failed`
        // before identity detection ever ran. V524 had been wired to
        // `extractFrameForFaceProbe`, which its own header describes as
        // cache-only — "No Replicate. No lucataco. No ffmpeg calls.
        // Ever." — and the probe cache for this scene was empty. It could
        // never have succeeded.
        //
        // The renderer that CAN do this already ships: `plate-face-track`
        // has rendered Remotion Lambda stills against the plate video for
        // every V452 track sample since V452. V525 reuses it verbatim and
        // writes the result to a namespace fenced by a fingerprint of the
        // base-video URL, so a generation-20 frame is unreachable here
        // rather than merely rejected.
        const v525Attempts: RegistrationAttempt[] = [];
        // V532-A — `v526bEvidence` is now declared above, at the same scope
        // as `v524Registration`. Behaviour unchanged.
        // A holder rather than a bare `let`: the value is written inside the
        // injected closure and read after it, and narrowing a closure-assigned
        // local to `never` is a TypeScript artefact, not a real invariant.
        const v525Extract: { last: PlateFrameExtractResult | null } = { last: null };
        // Bounded: stop at the first frame that can place EVERY character.
        // A partial registration is not evidence about where anybody is.
        for (const frame of v524Reuse.hit ? [] : v524Frames) {
          const reg = await registerPlateNativeIdentities({
            sceneId,
            runId: v510RunId,
            plateGeneration: v524PlateGeneration,
            baseVideoUrl: v524BaseVideoUrl!,
            plateDims: plateDims!,
            frameNumber: frame,
            registeredAt: new Date().toISOString(),
            characters: v524Chars,
            extractFrame: async (i) => {
              const r = await v525Acquire(i.frameNumber);
              v525Extract.last = r;
              return { ok: r.ok, frameUrl: r.imageUrl ?? null, reason: r.reason ?? null };
            },
            detectIdentities: async (i) => {
              // The SAME biometric matcher v274 already uses on the anchor,
              // pointed at a still of the actual plate. `anchorUrl` is the
              // parameter's name, not its meaning: it takes an image URL.
              const r = await resolveIdentityViaRekognition({
                anchorUrl: i.imageUrl,
                characters: i.characters,
              });
              return {
                ok: r.ok,
                dims: r.dims,
                faces: r.faces.map((f) => ({
                  characterId: f.characterId,
                  bbox: f.bbox,
                  similarity: f.similarity,
                })),
                resolvedCount: r.resolvedCount,
                reason: r.reason ?? null,
                // V529 — one bounded row per requested character.
                characterDiagnostics: r.characterDiagnostics,
              };
            },
          });
          v524Registration = reg;
          // V526-B — the characters that DID resolve on this frame. They
          // are real biometric statements about the current plate and,
          // until now, were discarded the moment the frame failed.
          if (!reg.ok && Array.isArray(reg.partialRecords) && reg.partialRecords.length > 0) {
            v526bEvidence.push({ frame, records: reg.partialRecords });
          }
          // V525 — one row per attempt, so a failure names every frame it
          // tried instead of only the last one.
          v525Attempts.push({
            frame,
            extract_ok: v525Extract.last?.ok ?? false,
            extract_reason: v525Extract.last?.reason ?? null,
            extract_source: v525Extract.last?.source ?? null,
            extract_cache_hit: v525Extract.last?.cacheHit ?? null,
            registration_ok: reg.ok,
            registration_reason: reg.reason ?? null,
            registration_detail: reg.detail ?? null,
            resolved: reg.diagnostics.resolved,
            requested: reg.diagnostics.requested,
            // V529 — generation 27 could say that Sarah and Kay failed on
            // all three frames and nothing more. These three fields are
            // the difference between that and knowing why.
            detected: reg.diagnostics.detected,
            unresolved: reg.unresolved,
            character_diagnostics: reg.characterDiagnostics,
            // V532-A — OBSERVABILITY ONLY. How many detector candidates
            // this attempt carried no character id for, and which
            // characters DID resolve. Nothing branches on these.
            unassigned_face_count: Array.isArray((reg as any).unassignedFaceBoxes)
              ? (reg as any).unassignedFaceBoxes.length
              : 0,
            unassigned_face_boxes: (reg as any).unassignedFaceBoxes ?? [],
            partial_record_count: Array.isArray(reg.partialRecords)
              ? reg.partialRecords.length
              : 0,
            partial_character_ids: (reg.partialRecords ?? []).map((r) => r.characterId),
          } as RegistrationAttempt);
          v525Extract.last = null;
          if (reg.ok) {
            v524Records = reg.records;
            break;
          }
        }
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v524_plate_identity_registration ` +
            `source=${v524Reuse.hit ? "reused" : "registered"} miss=${v524Reuse.miss ?? "-"} ` +
            `ok=${v524Registration?.ok ?? false} frame=${v524Registration?.frameNumber ?? "-"} ` +
            `resolved=${v524Registration?.diagnostics.resolved ?? 0}/${v524Registration?.diagnostics.requested ?? 0} ` +
            `detected=${v524Registration?.diagnostics.detected ?? 0} ` +
            `min_similarity=${v524Registration?.diagnostics.minSimilarity ?? "-"} ` +
            `rescaled=${v524Registration?.diagnostics.rescaled ?? false} ` +
            `legacy_space=${v524LegacySpace} reason=${v524Registration?.reason ?? "-"} ` +
            `detail=${v524Registration?.detail ?? "-"}`,
        );
        // ══ V526-B — COMPLETE THE CAST ON ONE COMMON FRAME ═══════════
        //
        // Generation 24: every character was biometrically resolvable
        // somewhere in this plate, and no single sampled frame carried
        // all four. Frame 23 missed Sarah, frame 225 missed Matthew.
        //
        // Unioning those frames would hand V523 a target and siblings
        // measured six seconds apart — the same referent split V522 and
        // V524 closed, one level down. So identity evidence may cross
        // frames and geometry may not: one frame is the target, whoever
        // is missing there is carried to it by the identity-locked
        // continuity rule the V452 tracker already uses, and every box
        // handed on is measured or proven at that one frame.
        //
        // No threshold moves. If six seconds cannot be proven under the
        // existing picker, this fails closed — and that failure is the
        // first hard measurement of how much this cast actually moves.
        let v526bPlan: ReturnType<typeof planCommonFrameCompletion> | null = null;
        let v526bResult: Awaited<ReturnType<typeof completeCommonFrameCohort>> | null = null;
        if (!v524Registration?.ok && v526bEvidence.length > 0 && plateDims && v524BaseVideoUrl) {
          v526bPlan = planCommonFrameCompletion({
            attempts: v526bEvidence,
            requestedCharacterIds: v524Chars.map((c: any) => c.characterId),
            fence: v524Fence,
            fps: STILL_FPS,
            maxSteps: TRACK_SAMPLE_COUNT_MAX,
            sampleTimes: trackSampleTimes,
          });
          if (v526bPlan.ok && v525RenderStill) {
            const v526bDetect = defaultDetectFaces();
            v526bResult = await completeCommonFrameCohort({
              plan: v526bPlan,
              fence: v524Fence,
              registeredAt: new Date().toISOString(),
              pick: pickAssignedFace,
              detectAtFrame: async (frame) => {
                // Through the V525 source-fenced cache, never around it:
                // the target is already one of the sampled frames and
                // should normally cost nothing to re-acquire.
                const got = await v525Acquire(frame);
                if (!got.ok || !got.imageUrl) {
                  return { ok: false, candidates: [], reason: got.reason ?? "extract_failed" };
                }
                try {
                  const res = await fetch(got.imageUrl, { signal: AbortSignal.timeout(20_000) });
                  if (!res.ok) return { ok: false, candidates: [], reason: `still_http_${res.status}` };
                  const bytes = new Uint8Array(await res.arrayBuffer());
                  const img = jpegDecodeV526.decode(bytes, { useTArray: true });
                  const faces = await v526bDetect(bytes, img.width, img.height, 20_000);
                  return {
                    ok: true,
                    candidates: faces.map((f: any) => ({
                      bbox: stillBoxToSource(f.bbox, plateDims!.width, plateDims!.height, img.width, img.height),
                      mouth: null,
                    })),
                  };
                } catch (e) {
                  return { ok: false, candidates: [], reason: (e as Error)?.message ?? "detect_failed" };
                }
              },
            });
            if (v526bResult.ok) {
              v524Records = v526bResult.records;
              v524Registration = {
                ok: true,
                records: v526bResult.records,
                frameNumber: v526bResult.targetFrame ?? -1,
                frameUrl: null,
                diagnostics: {
                  requested: v524Chars.length,
                  resolved: v526bResult.records.length,
                  detected: v526bResult.records.length,
                  minSimilarity: null,
                  detectorDims: plateDims,
                  rescaled: false,
                },
              };
            }
          }
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v526b_common_frame ` +
              JSON.stringify(buildCommonFrameTelemetry(v526bPlan, v526bResult)),
          );
        }
        // Bounded persistence into the EXISTING plate_identity JSONB — the
        // snapshot is written to dialog_shots after this block, so no
        // schema change and no second write path. Records only: no frames,
        // no tracks, no images.
        (v153PlateIdentitySnapshot as any).plateNative = {
          ok: v524Registration?.ok ?? false,
          // V524-P0 — a reused set is rewritten unchanged, so a later
          // dispatch of this run keeps hitting the same record.
          registration_source: v524Reuse.hit ? "reused" : "registered",
          reuse_miss: v524Reuse.miss ?? null,
          frame_number: v524Registration?.frameNumber ?? null,
          reason: v524Registration?.reason ?? null,
          detail: v524Registration?.detail ?? null,
          legacy_space: v524LegacySpace,
          // V526-A — which stretch of time the candidates came from.
          frame_authority: buildSceneFrameTelemetry(v526Selection),
          // V526-B — whether the cast had to be completed on one frame.
          common_frame: v526bPlan
            ? buildCommonFrameTelemetry(v526bPlan, v526bResult)
            : null,
          // V528 — the raster the identity stills were rendered at, next
          // to the plate they must match. Gen26 read 1280x720 vs 656x1406.
          still_raster: {
            plate: plateDims ?? null,
            requested: v528Raster.requested,
            actual: v528Raster.actual,
          },
          base_video_url: v524BaseVideoUrl,
          plate_generation: v524PlateGeneration,
          run_id: v510RunId,
          diagnostics: v524Registration?.diagnostics ?? null,
          // V525 — bounded, at most three rows.
          attempts: boundAttempts(v525Attempts),
          records: v524Records,
        };
      }

      // V533-OBS — fan-out boundary markers, telemetry only.
      await v533Observe("gate_fanout_start", {
        pass_count: Array.isArray(builtPasses) ? builtPasses.length : null,
        elapsed_ms: Date.now() - v533T0,
        ...v533Memory(),
      });
      const gateResults = await Promise.all(builtPasses.map((p: any) => gateOne(p)));
      await v533Observe("gate_fanout_done", {
        pass_count: Array.isArray(builtPasses) ? builtPasses.length : null,
        elapsed_ms: Date.now() - v533T0,
        ...v533Memory(),
      });

      // ── v119 — Soft-pass when plate-identity is already authoritative ──
      // If `plateIdentityMap` already resolved >= speakers.length faces, the
      // pass already carries plate-pixel-space coords + bbox from the real
      // rendered plate (see plate-face-identity block above). The strict
      // mid-turn Gemini frame check is then only a diagnostic. Hard-failing
      // here (e.g. because the speaker briefly turned their head on the
      // probed frame) blocks a perfectly dispatchable Sync.so call with
      // `bounding_boxes_url` — the exact false positive the user is hitting
      // on scene 90116518…  Demote it to a soft warning and dispatch on.
      // v283 — nach v282 (Size-Floor) sind Rekognition-Halluzinationen weg.
      // Partielle plate-identity (≥1) ist verlässlicher als ein Hard-Block
      // auf Anchor-Fallback-Coords. Nur bei resolvedCount===0 hart blocken.
      const plateIdentityAuthoritative =
        !!plateIdentityMap &&
        (plateIdentityMap.resolvedCount ?? 0) >= 1;
      // ══ V523 — AN IDENTITY REFUSAL IS NOT SOFT-PASSABLE ═══════════════
      //
      // v119/v283 demote a gate rejection when plate identity is
      // authoritative, because a speaker briefly turning their head is not
      // a reason to burn a scene. An unprovable repair is a different
      // statement: the pipeline could not establish WHICH face belongs to
      // this character on any candidate frame. Dispatching past that is
      // exactly how generation 19 put Sarah's voice on someone else's
      // geometry. It surfaces first, and it blocks.
      const v523IdentityReject = gateResults.find(
        (r) => !r.ok && (r as Extract<GateOutcome, { ok: false }>).identityHardFail,
      ) as Extract<GateOutcome, { ok: false }> | undefined;
      const firstReject = (v523IdentityReject ??
        gateResults.find((r) => !r.ok)) as Extract<GateOutcome, { ok: false }> | undefined;
      if (firstReject && plateIdentityAuthoritative && !v523IdentityReject) {
        const blockedNames = gateResults
          .filter((r) => !r.ok)
          .map((r) => (r as Extract<GateOutcome, { ok: false }>).pass.speaker_name);
        const resolvedNames = new Set(
          (plateIdentityMap?.faces ?? [])
            .filter((f: any) => f.characterId)
            .map((f: any) => String(f.characterId)),
        );
        const unresolvedBlocked = blockedNames.filter(
          (n) => !resolvedNames.has(String(n)),
        );
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v283_face_gate_SOFT_WARN strict_blocks=${blockedNames.join(",")} unresolved_soft_pass=${unresolvedBlocked.join(",") || "none"} plate_identity_resolved=${plateIdentityMap?.resolvedCount}/${speakers.length} — proceeding with plate-identity coords + bbox-url dispatch`,
        );
        for (const r of gateResults) {
          if (!r.ok) {
            const rr = r as Extract<GateOutcome, { ok: false }>;
            if (rr.pass && rr.pass.reference_frame_number == null) {
              rr.pass.reference_frame_number = rr.lastValidationFrame ?? rr.frames?.[0] ?? 0;
            }
          }
        }
      } else if (firstReject) {
        // v139 — only NOW emit the hard BLOCK log; v119 did not demote.
        const { reason: blockReason } = firstReject;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} FACE-GATE BLOCK (hard) pass=${firstReject.pass.idx} speaker=${firstReject.pass.speaker_name} reason=${blockReason}`,
        );
        const { pass, reason, strict, hadFaces } = firstReject;
        // V523 — the identity refusal carries its own class and its own
        // evidence, so an operator sees WHICH character could not be
        // resolved instead of a generic face-validation message.
        const v523Block = firstReject.identityHardFail === true;
        if (v523Block) {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "face_repair_identity_unresolved",
            error_message: reason,
            meta: {
              v523: firstReject.identityDetail ?? null,
              // V525 — the upstream cause, durably, on the one write that
              // cannot clobber a sibling's terminal state.
              v524: (v153PlateIdentitySnapshot as any)?.plateNative ?? null,
              speaker_name: pass.speaker_name,
              speaker_idx: pass.speaker_idx,
              pass_idx: pass.idx,
            },
          });
        }
        const { data: w0 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(w0?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        // ── V525 — WHERE THE DIAGNOSIS IS PERSISTED, AND WHY NOT HERE ──
        //
        // Generation 21 persisted no `plate_identity.plateNative`: the
        // snapshot is written further down the dispatch path and this
        // branch returns 422 long before reaching it.
        //
        // The obvious repair — merge the record into `dialog_shots` on the
        // update happening anyway — is the exact pattern V510 removed. A
        // full write built from the ENTRY snapshot clobbers whatever a
        // concurrent sibling terminalized in between, which is why the
        // eight preflight gates that did it are gone and a contract test
        // counts the survivors.
        //
        // So the evidence goes to `syncso_dispatch_log` instead: durable,
        // append-only, queryable, and incapable of overwriting anybody's
        // terminal state. See the `v523Block` log above, which now carries
        // the V524 registration outcome and every V525 attempt.
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_error: reason,
          })
          .eq("id", sceneId);
        return json(
          {
            error: v523Block
              ? "face_repair_identity_unresolved"
              : strict && hadFaces
              ? "plate_target_face_missing"
              : "face_validation_failed",
            details: v523Block
              ? `the face belonging to ${pass.speaker_name} could not be identified on any tested frame — no substitute face was used, credits have been refunded`
              : strict && hadFaces
              ? `target face for ${pass.speaker_name} is not reliably visible on the final scene plate — re-render with all faces in frame`
              : `no face for ${pass.speaker_name} in tested frames`,
            refunded: totalCost,
            hint: v523Block
              ? "re_render_scene_clip"
              : strict && hadFaces
              ? "re_render_scene_clip"
              : "switch_to_cinematic_sync_engine",
            ...(v523Block ? { v523: firstReject.identityDetail ?? null } : {}),
          },
          422,
        );
      }
    }



    // ── Concurrency guard ────────────────────────────────────────────────
    const MAX_INFLIGHT = 4; // v98: raised from 3 so 4-speaker scenes dispatch in one wave
    const inflightCount = await countInflightSyncJobs(supabase, 10);
    if (inflightCount >= MAX_INFLIGHT) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} DEFER inflight=${inflightCount}/${MAX_INFLIGHT}`,
      );
      // Only refund on initial dispatch (advance path keeps the existing charge).
      if (!isAdvance && !isRetry) {
        const { data: wDef } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wDef?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      const jitterMs = 5_000 + Math.floor(Math.random() * 10_000);
      // For advance/retry (fan-out): leave the scene in `running` with the
      // existing dialog_shots untouched. The pass row keeps status='pending'
      // and the lipsync-watchdog poller will dispatch it when a Sync.so slot
      // frees. Previously we wrote `syncso_segments_advance_deferred` here
      // which the client filter never advanced — pending passes hung forever.
      if (isAdvance || isRetry) {
        await supabase
          .from("composer_scenes")
          .update({
            // Status unchanged. Just touch updated_at + leave a soft marker
            // so we can debug from clip_error without changing routing.
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      } else {
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "pending",
            twoshot_stage: "deferred",
            clip_error: `syncso_concurrency_deferred:${inflightCount}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sceneId);
      }
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "DEFERRED", error_class: "rate_limited",
        error_message: `inflight ${inflightCount} >= ${MAX_INFLIGHT}`,
        meta: { inflight_count: inflightCount, retry_in_ms: jitterMs, is_advance: isAdvance, is_retry: isRetry },
      });
      return json(
        { ok: false, status: "deferred", inflight: inflightCount, retry_in_ms: jitterMs },
        202,
      );
    }

    // ── Determine which pass to dispatch (v25 Fan-Out) ───────────────────
    // CRITICAL: every pass uses the ORIGINAL source plate as input. We no
    // longer feed pass N-1's Sync.so output back into Sync.so for pass N —
    // that's exactly what caused the "An unknown error occurred." failures
    // on pass 2+ (Sync.so lipsync-2-pro rejects its own redirected outputs
    // in coords-pro mode). Instead, every pass produces a full-frame
    // lipsync of its own speaker on the pristine plate; the final compositor
    // (render-sync-segments-audio-mux) overlays them via face-mask circles.
    const prevState = (existing && (existing as any).version === 5) ? (existing as SegmentsState) : null;
    let passes: PassState[];
    let currentPassIdx: number;
    const passInputUrl: string = sourceClipUrl;

    if (isAdvance && prevState?.passes && typeof prevState.current_pass === "number") {
      // Webhook fan-in advance: dispatch the next pending pass (or the
      // explicitly requested one). Each pass is independent of all others.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      if (Number.isFinite(requested) && requested >= 0 && requested < passes.length) {
        currentPassIdx = requested;
      } else {
        // Pick first pending/failed-without-job pass, else advance the cursor.
        const pendingIdx = passes.findIndex((p) => p.status === "pending" && !p.job_id);
        currentPassIdx = pendingIdx >= 0 ? pendingIdx : prevState.current_pass;
      }
      if (!passes[currentPassIdx]) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} v170_advance_missing_slot idx=${currentPassIdx} have=${passes.length} total_passes=${(prevState as any)?.total_passes ?? "?"} — sibling skeleton was never seeded`);
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "ADVANCE_MISSING_SLOT",
            error_class: "pass_skeleton_missing",
            error_message: `advance pass_idx=${currentPassIdx} but passes.length=${passes.length}`,
            meta: { pass_idx: currentPassIdx, have: passes.length, total_passes: (prevState as any)?.total_passes ?? null },
          });
        } catch { /* best-effort */ }
        return json({ ok: true, skipped: "no_pass_at_cursor", pass_idx: currentPassIdx, have: passes.length }, 200);
      }
      const candidatePass: any = passes[currentPassIdx];
      const candidateStatus = String(candidatePass?.status ?? "");
      const candidateHasJob = typeof candidatePass?.job_id === "string" && candidatePass.job_id.length > 0;
      const candidatePreflightStarted = candidatePass?.preflight_started_at
        ? Date.parse(String(candidatePass.preflight_started_at))
        : NaN;
      const candidatePreflightFresh = Number.isFinite(candidatePreflightStarted)
        ? Date.now() - candidatePreflightStarted < 10 * 60_000
        : true;
      if (
        candidateStatus === "done" ||
        (candidateStatus === "rendering" && candidateHasJob) ||
        (candidateStatus === "rendering_preflight" && candidatePreflightFresh)
      ) {
        return json({ ok: true, skipped: `pass_${currentPassIdx}_already_${passes[currentPassIdx].status}` }, 200);
      }
    } else if (isRetry && prevState?.passes && typeof prevState.current_pass === "number") {
      // Retry the same pass that just failed — still against original plate.
      passes = prevState.passes.map((p) => ({ ...p }));
      const requested = Number(body?.pass_idx);
      currentPassIdx = Number.isFinite(requested) && requested >= 0 && requested < passes.length
        ? requested
        : prevState.current_pass;
    } else {
      // Fresh dispatch: start at pass 0.
      passes = builtPasses;
      currentPassIdx = 0;
    }

    // ── v87 — Coords refresh on advance/retry ────────────────────────────
    // Bug (verified in edge logs, scene 4c310576…): pass 1 dispatched with
    // heuristic [x, plateH*0.5] because anchor faceMap wasn't cached yet.
    // Those bad coords got baked into prevState.passes and every subsequent
    // isAdvance call cloned them verbatim — even though the freshly computed
    // `speakerCoords` now had real plate-identity / anchor coords. Refresh
    // pass.coords whenever the fresh source is *better* than what's stored.
    // "Better" = anything that isn't "heuristic"/"none". Heuristic coords
    // are blocked outright on the fresh path (above guard), so this only
    // upgrades — it never silently downgrades an already-good coord.
    if ((isAdvance || isRetry) && Array.isArray(speakerCoords) && speakerCoords.length > 0) {
      for (const p of passes) {
        const idx = Number(p.speaker_idx);
        if (!Number.isFinite(idx) || idx < 0 || idx >= speakerCoords.length) continue;
        // v139 (Fix C7) — Scope the refresh to ONLY the pass we are about
        // to dispatch. Previously this loop touched every sibling pass and
        // nulled their already-rendered preclips on every advance — see
        // forensic report scene b1ee2ede… 09:08:50 where Matthew/Kailee/
        // Sarah preclips were invalidated mid-flight although `source` was
        // already `identity`. A sibling pass's coords are refreshed in its
        // own dispatch turn; there is no need to mutate them here.
        if (p.idx !== currentPassIdx) continue;
        const freshCoord = speakerCoords[idx];
        const freshSource = coordSources[idx] ?? "none";
        if (!freshCoord) continue;
        if (freshSource === "heuristic" || freshSource === "none") continue;
        const oldCoord = Array.isArray(p.coords) ? [p.coords[0], p.coords[1]] : null;
        // v139 (Fix C7) — Raise the change threshold from sub-pixel (round)
        // to 8 px Manhattan. Sub-pixel drift from a re-probed identity map
        // was triggering full preclip re-renders for no visible gain.
        const dx = oldCoord ? Math.abs(Number(oldCoord[0]) - Number(freshCoord[0])) : Infinity;
        const dy = oldCoord ? Math.abs(Number(oldCoord[1]) - Number(freshCoord[1])) : Infinity;
        const changed = !oldCoord || dx > 8 || dy > 8;
        if (changed) {
          // v128 — Alpha-Plan v3.1 §1.8: terminal coord-refresh guard.
          // v134 §2 — Exception: if THIS pass is currently in an active
          // NOOP-retry cycle (status was reset to pending by sync-so-webhook
          // and a fresh noop_retry_attempt_id was issued), then the pass
          // is no longer terminal — it's just been re-opened for the
          // explicit purpose of changing the input vector. Block the
          // refresh only for truly terminal (done/failed without an active
          // retry) passes, where flipping coords would silently mutate
          // a finished result.
          const isTerminal = p.status === "done" || p.status === "failed";
          const inActiveNoopRetry =
            !!(p as any).noop_retry_attempt_id &&
            Number((p as any).noop_escalation_step ?? 0) > 0 &&
            p.status === "pending";
          // v405 P1-A — an active NOOP retry is FROZEN: the replacement
          // attempt must reuse the EXACT same preclip / audio / Contract-E
          // box. A coords refresh here would null the preclip fields (below)
          // and, because `v161PreclipEligible` never re-renders on a NOOP
          // escalation, the retry would die on the v204 preclip guard.
          // The preservation decision therefore runs BEFORE any invalidation.
          if (isFrozenNoopRetryPass(p as any) || (isTerminal && !inActiveNoopRetry)) {
            const frozenNoopRetry = isFrozenNoopRetryPass(p as any);
            (p as any).candidate_coords = [freshCoord[0], freshCoord[1]];
            (p as any).candidate_coords_at = new Date().toISOString();
            (p as any).candidate_coords_source = freshSource;
            try {
              await logSyncDispatch(supabase, {
                scene_id: sceneId,
                user_id: userId,
                engine: "sync-segments",
                sync_status: "COORD_REFRESH_SKIPPED",
                error_class: frozenNoopRetry
                  ? "coord_refresh_noop_retry_preserved"
                  : "coord_refresh_terminal_blocked",
                meta: {
                  v128_guard: !frozenNoopRetry,
                  v405_noop_retry_preserved: frozenNoopRetry,
                  pass_idx: p.idx,
                  speaker_idx: idx,
                  speaker_name: p.speaker_name,
                  old_coord: oldCoord,
                  new_coord: [freshCoord[0], freshCoord[1]],
                  source: freshSource,
                  terminal_status: p.status,
                  noop_escalation_step: (p as any).noop_escalation_step ?? null,
                  dispatch_source: "coord-refresh-skipped",
                },
              });
            } catch { /* best-effort */ }
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} ${frozenNoopRetry ? "v405 COORD-REFRESH-SKIPPED (noop retry frozen)" : "v128 COORD-REFRESH-SKIPPED"} ` +
              `pass=${p.idx} speaker=${p.speaker_name} status=${p.status} (candidate stored, preclip preserved)`,
            );
            continue;
          }

          // Non-terminal: legacy v123 stale-preclip invalidation path.
          (p as any).preclip_url = null;
          (p as any).preclip_crop = null;
          (p as any).preclip_render_id = null;
          (p as any).preclip_bbox_drift_rejected = false;
          (p as any).preclip_error = null;
          (p as any).preclip_face_count = null;
          p.coords = [freshCoord[0], freshCoord[1]];
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v128 ADVANCE COORDS REFRESH (non-terminal) + PRECLIP INVALIDATE ` +
            `pass=${p.idx} speaker=${p.speaker_name} old=${JSON.stringify(oldCoord)} new=${JSON.stringify(p.coords)} source=${freshSource}`,
          );
        }
      }
    }

    // ── v87 — Sanity guard: never dispatch a multi-speaker pass with
    // heuristic-only coords. Belt-and-suspenders behind the fresh-path
    // guard above; covers any future code path that could reach here with
    // an unverified coord (e.g. retry after a successful pass 1 if the
    // faceMap regressed). 1-speaker scenes are exempt (centre-of-frame is
    // a sane single-face fallback).
    if (speakers.length >= 2) {
      const pSrc = coordSources[Number(passes[currentPassIdx]?.speaker_idx ?? -1)] ?? "none";
      if (pSrc === "heuristic" || pSrc === "none") {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v87 SANITY-BLOCK pass=${currentPassIdx} ` +
          `speaker_idx=${passes[currentPassIdx]?.speaker_idx} source=${pSrc} — skipping dispatch, awaiting retry`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "HEURISTIC_BLOCKED",
          error_class: "coords_heuristic_unverified",
          error_message: `pass=${currentPassIdx} speaker_idx=${passes[currentPassIdx]?.speaker_idx} source=${pSrc}`,
          meta: { speakers: speakers.length, pass_idx: currentPassIdx, is_advance: isAdvance, is_retry: isRetry },
        });
        return json(
          {
            ok: true,
            status: "awaiting_face_detection",
            skipped: `pass_${currentPassIdx}_heuristic_coord_unverified`,
          },
          202,
        );
      }
    }


    const pass = passes[currentPassIdx];
    // v254 — Dispatch-pass retry counter. Keep this initialized at the top of
    // the per-pass scope so every preflight/face-gate/logging path can safely
    // stamp retry_count before the provider retry loop starts.
    let attempt = 0;

    // ── v193 — Pass-level dedupe/claim before expensive preflight ────────
    // The Plan-D fanout and webhook advance can race when a sibling pass is
    // still rendering its preclip and has no provider job_id yet. Persist a
    // lightweight `rendering_preflight` claim before Lambda/Sync.so work; any
    // second invocation for the same pass now short-circuits instead of
    // dispatching a duplicate provider job.
    {
      const { data: freshClaimRow } = await supabase
        .from("composer_scenes")
        .select("dialog_shots")
        .eq("id", sceneId)
        .maybeSingle();
      const freshClaimState: any = (freshClaimRow as any)?.dialog_shots ?? null;
      // V459 — Fan-out-Fence. Hat der Watchdog den Run bereits terminalisiert,
      // darf ab hier KEIN Provider-Call mehr entstehen (sonst Geld für Arbeit,
      // die nie reconciled wird).
      //
      // ══ V520 P1-A — THE SAME AUTHORITY THE LATE GATE USES ═══════════════
      //
      // This checkpoint asked only `isFanoutClosed`. The late gate before the
      // provider call asks `mayDispatchProvider`, which ALSO consults
      // `isRunTerminal` — so a run terminalized by a sibling pass, before the
      // fan-out flag is visible, passed here and did the whole preflight.
      // Generation 17: Sarah terminalized at 15:12:10 and Samuel still spent
      // preflight time, only to fail on `bbox_zero_voiced_frames`.
      //
      // Same helper, same evidence, earliest safe point. Already-dispatched
      // provider jobs are untouched and still reconcile; this only stops work
      // that has not yet reached the provider.
      const v520EarlyGate = mayDispatchProvider({
        dialogShots: freshClaimState,
        runId: v510RunId,
        fanoutClosed: isFanoutClosed(freshClaimState),
      });
      if (!v520EarlyGate.ok) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v520_early_terminal_fence reason=${v520EarlyGate.reason} — preflight aborted`,
        );
        return json(
          {
            ok: true,
            skipped: v520EarlyGate.reason === "v459_fanout_closed"
              ? "v459_fanout_closed"
              : "v520_early_run_terminal",
            scene_id: sceneId,
            pass_idx: currentPassIdx,
          },
          202,
        );
      }
      const freshClaimPasses: any[] = Array.isArray(freshClaimState?.passes) ? freshClaimState.passes : [];
      const livePass = freshClaimPasses[currentPassIdx] ?? null;
      const liveStatus = String(livePass?.status ?? "");

      const liveHasJob = typeof livePass?.job_id === "string" && livePass.job_id.length > 0;
      const preflightStartedMs = livePass?.preflight_started_at
        ? Date.parse(String(livePass.preflight_started_at))
        : NaN;
      const preflightAgeMs = Number.isFinite(preflightStartedMs)
        ? Date.now() - preflightStartedMs
        : Number.POSITIVE_INFINITY;
      const freshUserRetry = body?.user_retry_flag === true || body?.noop_auto_escalation === true;
      const duplicateActivePass =
        !freshUserRetry &&
        (
          liveStatus === "done" ||
          (liveStatus === "rendering" && liveHasJob) ||
          (liveStatus === "rendering_preflight" && preflightAgeMs < 10 * 60_000)
        );
      if (duplicateActivePass) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v193_pass_claim_skip_existing status=${liveStatus} job=${livePass?.job_id ?? "none"} age_ms=${Number.isFinite(preflightAgeMs) ? Math.round(preflightAgeMs) : "n/a"}`,
        );
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PASS_DEDUPE_SKIPPED",
            error_class: "v193_pass_already_active",
            meta: {
              compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
              pass_idx: currentPassIdx,
              live_status: liveStatus,
              live_job_id: livePass?.job_id ?? null,
              preflight_age_ms: Number.isFinite(preflightAgeMs) ? Math.round(preflightAgeMs) : null,
              is_advance: isAdvance,
              is_retry: isRetry,
            },
          });
        } catch { /* best-effort */ }
        return json({ ok: true, skipped: "v193_pass_already_active", pass_idx: currentPassIdx, status: liveStatus }, 202);
      }
      const v459ClaimAt = new Date().toISOString();
      try {
        await supabase.rpc("update_dialog_pass_slot", {
          _scene_id: sceneId,
          _pass_idx: currentPassIdx,
          _patch: {
            status: "rendering_preflight",
            preflight_started_at: v459ClaimAt,
            // V459 — expliziter Zombie-Zeitanker. Die Watchdog-Uhr läuft NIE
            // auf `started_at`, sondern ausschliesslich auf diesem Feld.
            v459_preflight_started_at: v459ClaimAt,
            preflight_claim_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
          },
        });
      } catch (claimErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v193_pass_claim_failed: ${(claimErr as Error)?.message ?? claimErr}`,
        );
      }
      (pass as any).preflight_started_at = v459ClaimAt;
      (pass as any).v459_preflight_started_at = v459ClaimAt;
      pass.status = "rendering_preflight";

    }

    // ── v193 — Batch preclip all sibling passes immediately ──────────────
    // v192 only prefetched passes beyond the Sync.so concurrency cap. With cap=4
    // that meant no prefetch at all for normal 4-speaker scenes; each fanout
    // invocation still spent ~60–120s rendering its own preclip. Start sibling
    // preclips as a background task as soon as pass 0 has claimed the scene,
    // while pass 0 continues its own preclip + Sync.so dispatch.
    if (false && !isAdvance && !isRetry && currentPassIdx === 0 && passes.length > 1 && plateDims && sourceClipUrl) {
      let batchPreclipEnabled = true;
      try {
        const { data: batchFlag } = await supabase
          .from("system_config")
          .select("value")
          .eq("key", "composer.batch_preclip_render")
          .maybeSingle();
        const raw = (batchFlag as any)?.value;
        if (raw !== undefined && raw !== null) {
          batchPreclipEnabled = String(raw).toLowerCase() !== "false";
        }
      } catch {
        batchPreclipEnabled = true;
      }

      if (batchPreclipEnabled) {
        const siblingIdxs = passes
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) =>
            i > 0 &&
            !(p as any)?.preclip_url &&
            Array.isArray(p?.coords) &&
            Number.isFinite(Number(p.coords?.[0])) &&
            Number.isFinite(Number(p.coords?.[1])) &&
            Array.isArray(p?.segments) &&
            p.segments.length > 0,
          )
          .map(({ i }) => i);

        if (siblingIdxs.length > 0) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_start passes=${siblingIdxs.map((i) => i + 1).join(",")} total=${passes.length}`,
          );
          try {
            EdgeRuntime.waitUntil((async () => {
              const results = await Promise.allSettled(siblingIdxs.map(async (idx) => {
                const bp = passes[idx] as any;
                const bpWindows: Array<[number, number]> = (Array.isArray(bp.segments) ? bp.segments : [])
                  .map((s: any) => [Number(s.startTime), Number(s.endTime)] as [number, number])
                  .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
                if (bpWindows.length === 0) return { idx, status: "skip_no_windows" };
                const unionStart = Math.max(0, Math.min(...bpWindows.map(([s]) => s)));
                const unionEnd = Math.min(totalSec, Math.max(...bpWindows.map(([, e]) => e)));
                const siblingCoords: Array<[number, number]> = passes
                  .filter((other: any) => other?.speaker_idx !== bp.speaker_idx && Array.isArray(other?.coords))
                  .map((other: any) => [Number(other.coords[0]), Number(other.coords[1])] as [number, number])
                  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
                const result = await renderPassFacePreclip(
                  supabase,
                  serviceKey,
                  supabaseUrl,
                  {
                    sceneId,
                    projectId: String((scene as any).project_id ?? ""),
                    // V447 — Run-Identität: bindet den Preclip an Lauf + Generation.
                    runId: String((scene as any).active_run_id ?? "") || null,
                    plateGeneration: Number.isFinite(Number((scene as any).plate_generation)) ? Number((scene as any).plate_generation) : null,
                    userId,
                    passIdx: idx,
                    masterVideoUrl: sourceClipUrl,
                    srcWidth: plateDims.width,
                    srcHeight: plateDims.height,
                    coords: [Number(bp.coords[0]), Number(bp.coords[1])],
                    bbox: speakerPlateBboxes?.[bp.speaker_idx] ?? null,
                    mouth: speakerPlateMouths?.[bp.speaker_idx] ?? null,
                    siblingCoords: siblingCoords.length > 0 ? siblingCoords : null,
                    startSec: unionStart,
                    endSec: unionEnd,
                  },
                  300_000,
                );
                if (!result.ok || !result.preclipUrl || !result.crop) {
                  return { idx, status: "failed", error: result.error ?? "preclip_unknown" };
                }
                await supabase.rpc("update_dialog_pass_slot", {
                  _scene_id: sceneId,
                  _pass_idx: idx,
                  _patch: {
                    preclip_url: result.preclipUrl,
                    preclip_render_id: result.preclipRenderId ?? null,
                    preclip_crop: {
                      x: result.crop.x,
                      y: result.crop.y,
                      size: result.crop.size,
                      outputSize: result.crop.outputSize,
                    },
                    preclip_start_sec: Number(unionStart.toFixed(3)),
                    preclip_end_sec: Number(unionEnd.toFixed(3)),
                    preclip_fps: Number(result.fps ?? 30),
                    preclip_frame_count: Number.isFinite(Number(result.frameCount)) && Number(result.frameCount) > 0
                      ? Math.max(1, Math.round(Number(result.frameCount)))
                      : Math.max(1, Math.ceil((result.durationSec ?? Math.max(0.2, unionEnd - unionStart)) * Number(result.fps ?? 30))),
                    preclip_duration_sec: Number((result.durationSec ?? Math.max(0.2, unionEnd - unionStart)).toFixed(3)),
                    preclip_error: null,
                    preclip_prefetched_at: new Date().toISOString(),
                  },
                });
                return { idx, status: "ok" };
              }));
              const summary = results.map((r, n) => {
                const idx = siblingIdxs[n] + 1;
                return r.status === "fulfilled"
                  ? `${idx}:${(r.value as any).status}`
                  : `${idx}:threw`;
              });
              console.log(`[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_done results=${summary.join(",")}`);
            })());
          } catch (err) {
            console.warn(`[compose-dialog-segments] scene=${sceneId} v193_batch_preclip_all_setup_failed: ${(err as Error)?.message ?? err}`);
          }
        }
      }
    }

    pass.input_url = passInputUrl;
    pass.status = "rendering";
    pass.started_at = new Date().toISOString();

    // ── v120 — Pass-4 / silent-bbox-url-pro Preclip-Forcing ──────────────
    // Root cause for the ec4290f2… zombie: Sarah's Pass 4 reproducibly
    // failed on `bbox-url-pro` with `provider_unknown_error` (no error_code)
    // while Passes 2/3 succeeded via the preclip path. After 2 silent
    // bbox-url-pro fails for this pass, force the dispatch onto the
    // single-face preclip path that works on this exact plate.
    let v120ForcePreclip = false;
    try {
      const { count: silentBboxFails } = await supabase
        .from("syncso_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("scene_id", sceneId)
        .eq("sync_status", "FAILED")
        .eq("error_class", "provider_unknown_error")
        .filter("meta->>pass_idx", "eq", String(currentPassIdx))
        .filter("meta->>retry_variant", "eq", "bbox-url-pro");
      if (passes.length < 2 && (silentBboxFails ?? 0) >= 2) {
        v120ForcePreclip = true;
        // Drop any cached preclip so the renderer rebuilds fresh below
        // (also dodges expired-signed-URL traps).
        (pass as any).preclip_url = null;
        (pass as any).preclip_render_id = null;
        (pass as any).preclip_crop = null;
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v120_pass4_preclip_forced silent_bbox_url_pro_fails=${silentBboxFails} — switching to single-face preclip path`,
        );
      }
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v120 preclip-force probe failed: ${(e as Error)?.message}`,
      );
    }

    // ── v404 §9 — v148/v204 Preclip-Konflikt geschlossen ─────────────────
    // v148 droppte bei `noop_auto_escalation` den per-Pass Preclip, damit der
    // Full-Plate-Pfad greift. Der frozen v404 NOOP-Retry-Wire verlangt aber
    // EXAKT denselben Single-Face-Preclip, dasselbe Audio und dieselbe
    // Contract-E-Box — der einzige fachliche Unterschied ist
    // `bounding_boxes_url` → inline `bounding_boxes`. Ein Preclip-Drop würde
    // zudem den v204 Multi-Speaker-Preclip-Guard fail-closed auslösen.
    // Deshalb bleibt der Preclip bei NOOP-Eskalation unangetastet.
    if (
      shouldPreserveNoopRetryPreclip({
        noopAutoEscalation: body?.noop_auto_escalation === true,
        requestedRetryVariant,
        hasPreclipUrl: !!(pass as any).preclip_url,
      })
    ) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v404_noop_retry_preclip_preserved step=${body?.noop_escalation_step ?? "?"} variant=${requestedRetryVariant} speaker=${pass.speaker_name ?? "?"} preclip=${(pass as any).preclip_url ? "kept" : "none"}`,
      );
    }


    // ── v153.1 — Single-Path bbox-url-pro Pipeline (N=1..4 einheitlich) ──
    // PRECLIP IS DEAD. Es gibt nur noch einen einzigen Dispatch-Pfad:
    // Full-Plate + `bounding_boxes_url` mit plate-nativer Box pro Sprecher.
    //
    // Aktivierung: jede frische (nicht-noop-escalation) Dispatch braucht
    //  - plateDims (sonst hat die Scene-Pre-Flight längst hart gefailt)
    //  - eine plate-native Box für DIESEN Sprecher — gilt einheitlich
    //    für N=1, 2, 3, 4 (kein synthetic-coords-Fallback mehr für N=1).
    //
    // Wenn das nicht erfüllt ist, hat die Scene-Pre-Flight (Z. ~1326)
    // bereits hart gefailt + refunded. Hier ist es daher ein simples Flag.
    const v153HasPlateBox =
      Array.isArray(speakerPlateBboxes?.[pass.speaker_idx]) &&
      (speakerPlateBboxes![pass.speaker_idx] as any[]).length === 4;
    // ══ V543 — FULL-SHOT DISPATCH IST WIEDER DER PRIMÄRPFAD ═══════════════
    //
    // Gate-0-Befund (Szene 7aa7fc93…, Gen 7, alle 4 Pässe noop):
    // Der Selbst-Crop wurde aus EINER Snapshot-Box geplant, der Face-Track
    // lieferte 0 Samples und die Mundposition kam aus `pose_estimate`.
    // Bewegen sich die Figuren, wandert der Mund aus dem Fenster —
    // `mouth_over_frame` 1.18–1.81 in der Messung. Sync.so bekam dann einen
    // Clip ohne verwertbaren Mund → noop.
    //
    // sync-3 ist laut Anbieter-Vertrag dafür gebaut, den GANZEN Shot zu
    // sehen und den Sprecher räumlich selbst zu verfolgen; die Box ist reine
    // Sprecher-AUSWAHL, kein Bildausschnitt. Der Preclip nahm sync-3 exakt
    // diese Fähigkeit weg — deshalb waren Bewegung und Lip-Sync unvereinbar.
    //
    // Identität bleibt unangetastet: die Box stammt weiterhin aus dem
    // V524/V530-Lock (`speakerPlateBboxes[speaker_idx]`), `auto_detect`
    // bleibt aus. Retries und NOOP-Eskalation fallen bewusst auf den
    // bisherigen Preclip-Pfad zurück (Fallback, nicht Ersatz).
    const V543_FULLPLATE_ENABLED =
      (Deno.env.get("FEATURE_V543_FULLPLATE") ?? "1") !== "0";
    const v543CandidateEligible =
      V543_FULLPLATE_ENABLED &&
      !isRetry &&
      body?.noop_auto_escalation !== true &&
      !!plateDims &&
      v153HasPlateBox &&
      !(pass as any).preclip_url;
    // V543-2 — Zeitbasis muss GEMESSEN sein, nicht angenommen. Ohne exakte
    // Framezahl/FPS der versendeten Platte gibt es keinen Full-Shot-Dispatch:
    // ein falsch langes Box-Array ist genau der Grund, warum Sync.so alle
    // vier Pässe mit `generation_input_face_selection_invalid` abgelehnt hat.
    const v543PlateMeta = v543CandidateEligible
      ? await getPlateVideoMetaCached(passInputUrl)
      : null;
    const v153UnifiedBboxEligible = v543CandidateEligible &&
      !!v543PlateMeta &&
      v543PlateMeta.fps > 0 &&
      v543PlateMeta.frameCount > 0;
    if (!isRetry) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v543_fullplate_gate enabled=${V543_FULLPLATE_ENABLED} candidate=${v543CandidateEligible} eligible=${v153UnifiedBboxEligible} speakers=${speakers.length} plate_box=${v153HasPlateBox} cached_preclip=${!!(pass as any).preclip_url} probe_fps=${v543PlateMeta?.fps ?? "n/a"} probe_frames=${v543PlateMeta?.frameCount ?? "n/a"} probe_dur=${v543PlateMeta?.durationSec ?? "n/a"} — sync-3 full-shot + bounding_boxes_url`,
      );
      if (v543CandidateEligible && !v153UnifiedBboxEligible) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v543_fullplate_declined reason=plate_timebase_unmeasurable — falling back to preclip path`,
        );
      }
    }


    if (v153UnifiedBboxEligible) {
      (pass as any).preclip_url = null;
      (pass as any).preclip_render_id = null;
      (pass as any).preclip_crop = null;
      (pass as any).preclip_error = null;
      (pass as any)._v152BboxPrimary = true; // legacy flag name kept for downstream gates
      (pass as any)._v153BboxPrimary = true;
      // V543-2 — die GEMESSENE Zeitbasis des versendeten Videos. Sie ist ab
      // hier die einzige Quelle für `frameCount`/`fps` im Full-Shot-Pfad.
      (pass as any)._v543PlateMeta = v543PlateMeta;

      // v181 — N=1 Depicted-Face Lock telemetry.
      // When a single-speaker scene has 2+ faces in the FULL plate (phone
      // screen, photo, mirror, background person), the bbox-url-pro path
      // already pins Sync.so to the cast speaker box. We surface a clear
      // log line so QA can verify the lock fired and so future regressions
      // are visible without re-reading source.
      const v181PlateFaceCount = Number(plateIdentityMap?.faces?.length ?? 0);
      const v181CastBox = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      if (speakers.length === 1 && v181PlateFaceCount >= 2) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v181_n1_depicted_face_lock ` +
          `plate_face_count=${v181PlateFaceCount} cast_box=${JSON.stringify(v181CastBox)} ` +
          `speaker=${pass.speaker_name ?? "?"} — forcing strict bbox-url-pro on cast face`,
        );
        (pass as any)._v181DepictedFaceLock = true;
      }
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153.2_unified_bbox_primary speakers=${speakers.length} plate_box=yes resolved=${plateIdentityMap?.resolvedCount ?? "?"} speaker=${pass.speaker_name ?? "?"} plate_face_count=${v181PlateFaceCount} — bbox-url-pro SINGLE PATH (no preclip, no auto_detect, no synthetic)`,
      );
    }



    // ── v118 — Pass-level Sync.so circuit breaker ────────────────────────
    // Stop the silent dispatch→FAILED→dispatch loop that previously ran
    // until the user manually reset the scene. Cap each (scene, pass) at
    // 5 FAILED Sync.so dispatches; after that refund credits idempotently,
    // mark the scene `failed`, and bail. The Composer UI surfaces
    // `clip_error` automatically and the user can hit "Sauber neu starten".
    try {
      const PASS_FAIL_CAP = 5;
      const { count: passFailCount } = await supabase
        .from("syncso_dispatch_log")
        .select("id", { count: "exact", head: true })
        .eq("scene_id", sceneId)
        .eq("sync_status", "FAILED")
        .filter("meta->>pass_idx", "eq", String(currentPassIdx));
      if ((passFailCount ?? 0) >= PASS_FAIL_CAP) {
        const reason = `lipsync_exhausted_pass_${currentPassIdx + 1}_speaker_${pass.speaker_name ?? "?"}_after_${passFailCount}_failures`;
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker pass=${currentPassIdx + 1} fails=${passFailCount} — refunding ${totalCost} and marking scene failed`,
        );
        const alreadyRefundedCB = !!(existing as any)?.refunded;
        if (!alreadyRefundedCB) {
          try {
            const { data: wCB } = await supabase
              .from("wallets").select("balance").eq("user_id", userId).single();
            await supabase
              .from("wallets")
              .update({
                balance: Number(wCB?.balance ?? 0) + Number(totalCost ?? 0),
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", userId);
          } catch (refundErr) {
            console.error(
              `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker refund failed: ${(refundErr as Error)?.message}`,
            );
          }
        }
        // ── V510-P0 — implicit stale-passes carry ────────────────────
        // `mergeDialogShots` is a shallow spread over the read-at-entry
        // scene, so this write shipped `existing.passes` even though no
        // `passes` key appears in the patch. Terminalize atomically; the
        // root merge happens server-side and never carries a slot.
        await v510Terminalize({
          passIdx: currentPassIdx,
          passPatch: buildTerminalPassPatch({
            reason: `v118_circuit_breaker:${reason}`,
            errorClass: "v118_pass_circuit_breaker",
            diagnostics: { v510_terminalized_by: "v118_circuit_breaker" },
          }),
          rootPatch: {
            version: 5,
            engine: "sync-segments",
            status: "failed",
            cost_credits: 0,
            refunded: true,
            error: `v118_circuit_breaker:${reason}`,
            finished_at: new Date().toISOString(),
          },
          reason: `v118_circuit_breaker:${reason}`,
          scenePatch: {
            lip_sync_status: "failed",
            twoshot_stage: "failed",
            clip_status: "failed",
            clip_error: `Lip-Sync abgebrochen: Sync.so hat für Sprecher „${pass.speaker_name ?? `Pass ${currentPassIdx + 1}`}" ${passFailCount}× hintereinander mit „provider_unknown_error" abgebrochen. Credits wurden zurückerstattet. Bitte drücke „Sauber neu starten" oder render die Plate neu, falls das Gesicht nicht klar erkennbar ist.`,
          },
        });
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_status: "CIRCUIT_BREAKER_OPEN",
            error_class: "v118_pass_circuit_breaker",
            error_message: reason,
            meta: {
              pass_idx: currentPassIdx,
              total_passes: passes.length,
              speaker: pass.speaker_name,
              failures_observed: passFailCount,
              cap: PASS_FAIL_CAP,
              refunded_credits: alreadyRefundedCB ? 0 : totalCost,
            },
          });
        } catch (_) { /* best-effort */ }
        return json(
          {
            error: "v118_pass_circuit_breaker",
            reason,
            refunded: alreadyRefundedCB ? 0 : totalCost,
          },
          422,
        );
      }
    } catch (cbErr) {
      // Circuit-breaker failure must NEVER block dispatch — just log.
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} v118_circuit_breaker probe failed: ${(cbErr as Error)?.message}`,
      );
    }


    // ── v40 — Canonical audio restore (FIX for v39 retry bug) ────────────
    // v39 bug: the first dispatch overwrote `pass.audio_url` with the
    // sliced "tight" WAV (turn-only, ~3.27s). On retry the cloned pass
    // still pointed at that tight URL, so the v39 slicer tried to cut
    // ABSOLUTE windows like [3.81, 7.082] out of a 3.27s file → throws
    // "sliceWav: no valid windows". v53 removes the old undocumented
    // `segments_secs` fallback entirely, so a failed tight-slice now fails
    // before provider dispatch instead of sending a non-doc Sync.so payload.
    //
    // Fix: ALWAYS restore the canonical full-length per-speaker WAV from
    // `audio_url_full` before re-slicing. Also clear stale `audio_tight`
    // so the downstream slicer either rebuilds it cleanly or fails safely
    // without falling back to a doc-violating video segment hint.
    //
    // ── FA-4 v407 — Frozen Provider Input / Retry-Wire-Parität ───────────
    // Der Frozen-Contract gilt AUSSCHLIESSLICH für den contracted
    // Multi-Speaker-BBox-Wire. Fresh und NOOP-Retry werden getrennt erkannt;
    // die NOOP-Aktivierung hängt NICHT von neu berechneter Geometrie oder
    // einem neu bestimmten payloadModel ab — der Snapshot ist die Authority.
    const v407IsMultiSpeaker = speakers.length >= 2;
    const v407NoopAutoEscalation = body?.noop_auto_escalation === true;
    // Identisch zur finalen retryVariant-Ableitung weiter unten (v144 NOOP
    // honoriert die angeforderte Variante unverändert).
    const v407EffectiveRetryVariant = isRetry
      ? (requestedRetryVariant === "coords-pro-box" ? "coords-pro-box" : "bbox-url-pro")
      : "bbox-url-pro";
    const v407NoopRetryCandidate = isV407NoopRetryCandidate({
      isMultiSpeaker: v407IsMultiSpeaker,
      noopAutoEscalation: v407NoopAutoEscalation,
      retryVariant: v407EffectiveRetryVariant,
    });
    const v407NoopGate = v407NoopRetryCandidate
      ? gateFrozenNoopRetry(
        resolveFrozenProviderInput(pass as unknown as Record<string, unknown>),
      )
      : null;
    const v406FrozenInput: ProviderWireSnapshot | null = v407NoopGate?.ok
      ? v407NoopGate.snapshot
      : null;
    if (v407NoopGate && !v407NoopGate.ok) {
      // failBeforeProviderDispatch ist hier noch nicht deklariert — deferred
      // Hard-Fail (gleiches Muster wie v152), greift VOR jedem Provider-Call.
      (pass as any)._v406FrozenMissing = {
        reason: v407NoopGate.reason,
        errorClass: v407NoopGate.reason,
        message:
          "NOOP-Retry ohne verwendbaren frozen Provider-Input-Snapshot — Dispatch blockiert (kein Legacy-Rebuild).",
        meta: {
          fa4_v407: true,
          provider_call_made: false,
          noop_auto_escalation: v407NoopAutoEscalation,
          retry_variant: v407EffectiveRetryVariant,
          pass_idx: currentPassIdx,
          speaker_idx: (pass as any).speaker_idx ?? null,
        },
      };
      console.error(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v407_${v407NoopGate.reason} — fail closed, zero provider calls`,
      );
    }
    const v406ReuseFrozen = !!v406FrozenInput;
    const v406SkipRebuild = v406ReuseFrozen || !!(pass as any)._v406FrozenMissing;

    const canonicalAudioUrl = String(
      (pass as any).audio_url_full ?? pass.audio_url ?? "",
    );
    if (v406SkipRebuild) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_skip_v40_canonical_restore frozen=${v406ReuseFrozen}`,
      );
    } else {
      if (canonicalAudioUrl && canonicalAudioUrl !== pass.audio_url) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v40_restore_canonical_audio from=…${String(pass.audio_url).slice(-60)} to=…${canonicalAudioUrl.slice(-60)}`,
        );
      }
      if (canonicalAudioUrl) pass.audio_url = canonicalAudioUrl;
      (pass as any).audio_tight = null;
    }

    // Each pass targets a DIFFERENT face with its own validated coords. Never
    // inherit a fallback variant from a sibling pass — that would drop the
    // coords for speakers 2+ and let Sync.so re-detect speaker 0 (causing
    // speakers 2 and 3 to stay frozen). The per-pass fallback ladder
    // (coords-pro → auto-pro → auto-standard) is still applied inside
    // sync-so-webhook on actual provider failures for THIS pass only.
    // v82 (Phase 2.1) — Fresh dispatch prefers `bbox-url-pro` for N>=2
    // speakers when we have BOTH plateDims and a resolved plate-identity
    // map. That gives Sync.so a per-frame deterministic target box and
    // structurally fixes "Lipsync hat keinen Avatar getroffen" on
    // multi-face plates. Falls back to the legacy coords-pro entry-point
    // when plate identity is unavailable, when the per-pass preclip is
    // present (then auto_detect on the 1-face crop is best), or on retry.
    const havePlateIdentityForDispatch =
      !!plateIdentityMap && plateIdentityMap.resolvedCount > 0;
    const hasPassPreclipForDispatch = !!(pass as any).preclip_url;
    // v147 — bbox-url-pro als PRIMARY für Multi-Speaker (revives v82 Phase 2.1).
    // Empirie v146 Forensik Run 0b3dafc5: Hailuo-Plates sind sauber
    // (Sarah 32.6% frame-coverage, Mund sichtbar), aber Sync.so `auto_detect`
    // failt reproducibly mit `face_gate_failed:count=0` auf stilisierten
    // Multi-Face Plates. Deterministische `bounding_boxes_url` umgeht den
    // Sync.so-Detector komplett.
    //
    // v126 hatte bbox-url-pro deaktiviert wegen `provider_unknown_error`
    // (Szene cba18767). v147 löst das mit Pre-Dispatch-Validation der bbox-
    // URL (nonNullFrames >= 1) + sauberem Fallback auf `coords-pro` statt
    // blind dispatchen.
    //
    // Preclip-Path bleibt unverändert (Rule 0 → auto_detect auf der per-
    // Speaker single-face Crop ist sicher und well-understood). Nur der
    // Full-Plate Multi-Speaker Pfad bekommt bbox-url-pro.
    void v120ForcePreclip;
    // v201 — no env-controlled fallback. Fresh and retry dispatches use the
    // bbox branch so the wire ASD is always bounding_boxes_url / bounding_boxes.
    const v147BboxEligible =
      speakers.length >= 2 &&
      havePlateIdentityForDispatch &&
      !!plateDims &&
      !hasPassPreclipForDispatch;
    // v153 — Wenn der unified-bbox-Pfad aktiv ist, IMMER bbox-url-pro.
    // Kein Fallback auf coords-pro mehr im Live-Pfad.
    const v153Active = !!(pass as any)._v153BboxPrimary;
    const freshDefaultVariant: RetryVariant = "bbox-url-pro";
    const noopAutoEscalation = body?.noop_auto_escalation === true;
    let retryVariant: RetryVariant = isRetry
      ? ((requestedRetryVariant === "coords-pro-box" ? "coords-pro-box" : "bbox-url-pro") as RetryVariant)
      : freshDefaultVariant;
    // v204 — Multi-speaker rolled back to v169 preclip path. Retry variants
    // (coords-pro-box, sync3-coords, etc.) are honored again. The forbidden
    // legacy variants (auto-pro/auto-standard/coords-pro/coords-pro-lp2pro)
    // remain blocked further down for N>=2.
    // v153.2 — Bei aktivem unified-Pfad auch Advance/Retry auf bbox-url-pro zwingen.
    // Die NOOP-Ladder darf weiterhin explizite Diagnose-Varianten wählen.
    if (v153Active && !noopAutoEscalation) {
      retryVariant = "bbox-url-pro";
    }
    const isFreshBboxPrimary = !isRetry && freshDefaultVariant === "bbox-url-pro";
    if (
      !noopAutoEscalation &&
      !isFreshBboxPrimary &&
      !v153Active &&
      (retryVariant === "auto-pro" || retryVariant === "auto-standard" || retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro")
    ) {
      retryVariant = "bbox-url-pro";
    }
    if (noopAutoEscalation) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v144_noop_escalation honoring variant=${retryVariant} step=${body?.noop_escalation_step ?? "?"}`,
      );
    }
    if (isFreshBboxPrimary) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153_bbox_url_pro_primary speakers=${speakers.length} resolved=${plateIdentityMap?.resolvedCount ?? 0} plate_box=${(pass as any)._v153BboxPrimary ? "plate-native" : "facemap-fallback"}`,
      );
    }

    // v85 (Mini-Phase 2.5) — Structured gate-decision log so we can answer
    // "why didn't bbox-url-pro fire?" without re-reading the source. Emitted
    // ONLY on fresh dispatch (retries inherit the previous variant) and only
    // for multi-speaker scenes (N>=2 is the only place where the gate is
    // meaningful). Keep on one line for easy grep.
    if ((!isRetry || (body?.noop_auto_escalation === true)) && speakers.length >= 2) {
      const gateReason =
        body?.noop_auto_escalation === true && (retryVariant === "bbox-url-pro" || retryVariant === "coords-pro-box")
          ? `v148-noop-bypass-${retryVariant}`
          : freshDefaultVariant === "bbox-url-pro"
            ? "picked-bbox-url-pro"
            : !plateDims
              ? "fallback-no-plateDims"
              : !havePlateIdentityForDispatch
                ? `fallback-identity-unresolved(resolved=${plateIdentityMap?.resolvedCount ?? 0})`
                : hasPassPreclipForDispatch
                  ? "fallback-preclip-present"
                  : "fallback-unknown";
      console.log(
        `[v82-gate] scene=${sceneId} pass=${currentPassIdx + 1} speakers=${speakers.length} plateDims=${!!plateDims} resolved=${plateIdentityMap?.resolvedCount ?? 0} preclip=${hasPassPreclipForDispatch} noop_esc=${body?.noop_auto_escalation === true} → variant=${retryVariant} (${gateReason})`,
      );
    }

    const diagnosticId = `${sceneId}:${currentPassIdx + 1}:${retryVariant}:${crypto.randomUUID()}`;
    pass.retry_variant = retryVariant;
    pass.diagnostic_id = diagnosticId;

    // ── v33: Audio lead-in trim DISABLED for v25 fan-out passes ──────────
    // Each per-speaker WAV is silence-padded to the FULL plate duration so
    // its absolute timeline matches the 9s scene plate. Trimming the lead-in
    // (v28/v29 logic) shifted the voice forward by 2.5-4s, so Sync.so saw a
    // video where the active speaker's mouth opens at t=3s while the audio
    // says them speaking at t=0s. With `sync_mode=cut_off` that mismatch
    // routinely produces the opaque "An unknown error occurred." failures
    // we have been chasing for days. We keep the diagnostic log so we can
    // see when a track HAS a long lead-in (now informational only).
    const passDiag = audioDiagnostics.find((d: any) => d.pass === pass.idx) as any;
    const detectedLeadIn = Number(passDiag?.wav?.leadInSec ?? 0);
    if (Number.isFinite(detectedLeadIn) && detectedLeadIn > 0.3) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} leadIn=${detectedLeadIn.toFixed(2)}s (preserved — timeline must match full plate)`,
      );
    }
    if (repairAudio) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio requested — re-encoding WAV without trimming timeline`,
      );
      try {
        const rawAudio = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (rawAudio.ok) {
          const repaired = normalizeWav(new Uint8Array(await rawAudio.arrayBuffer()), {
            leadInSec: 0,
            minTotalSec: totalSec,
            peakDbFs: -1,
            forceMono: true,
            targetLufs: -16,
          });
          const repairPath = `${userId}/twoshot-vo/${sceneId}-pass-${pass.idx + 1}-repair-${Date.now()}.wav`;
          const up = await supabase.storage.from("voiceover-audio").upload(
            repairPath,
            repaired.bytes,
            { contentType: "audio/wav", upsert: true },
          );
          if (!up.error) {
            const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(repairPath);
            if (pub?.publicUrl) {
              pass.audio_url = pub.publicUrl;
              (pass as any).audio_repair = {
                source_url: passDiag?.pass != null ? "speaker_track" : "unknown",
                repaired_url: pub.publicUrl,
                dur_sec: repaired.info.durSec,
                peak_dbfs: repaired.info.peakDbFs,
                lead_in_sec: repaired.info.leadInSec,
              };
              console.log(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio uploaded ${repairPath}`);
            }
          } else {
            console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio upload failed: ${up.error.message}`);
          }
        }
      } catch (err) {
        console.warn(`[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} repair_audio failed: ${(err as Error)?.message ?? err}`);
      }
    }



    // ── Build per-pass Sync.so payload ───────────────────────────────────
    // v38 — Per-Turn Tight-Window Lip-Sync (Sync.so-konform):
    //   • frame_number = TURN START (not midpoint) — midpoint anchoring was
    //     pushing speaker N's mouth animation forward into speaker N+1's
    //     voiced window.
    //   • v53 removed the old undocumented `segments_secs` video hint. The
    //     scoped turn timing now comes from the tight per-turn WAV plus
    //     `sync_mode=cut_off`, which matches the public Sync.so schema.
    const firstTurn = pass.segments[0];
    const turnStartSec = firstTurn ? Math.max(0, firstTurn.startTime) : 0;
    const turnEndSec = firstTurn ? Math.min(totalSec, firstTurn.endTime) : totalSec;
    const startFrame = Math.max(0, Math.floor(turnStartSec * ASSUMED_FPS));
    const referenceFrameNumber = Number.isFinite(pass.reference_frame_number)
      ? Math.max(0, Math.round(Number(pass.reference_frame_number)))
      : startFrame;
    // Union of all turn windows for THIS speaker (a speaker may have multiple
    // turns; each becomes its own [start, end] entry inside segments_secs).
    // v90: asymmetric padding — 0.08s onset (consonant safety) but only
    // 0.02s on the tail to prevent lips from twitching after the script ends.
    // v91: dynamic tail floor — short turns (< 0.6s of raw speech) fall back to
    // 0.08s tail, otherwise Sync.so sees a near-empty window and returns
    // `provider_unknown_error`, which silently kills speakers 3/4 in N≥3 scenes.
    const SEG_PAD_START = 0.08;
    const SEG_PAD_END_TIGHT = 0.02;
    const SEG_PAD_END_SHORT = 0.08;
    const SHORT_TURN_THRESHOLD_SEC = 0.6;
    const speakerWindowsSecs: Array<[number, number]> = (pass.segments ?? [])
      .map((t) => {
        const rawDur = Math.max(0, Number(t.endTime) - Number(t.startTime));
        const tailPad = rawDur < SHORT_TURN_THRESHOLD_SEC ? SEG_PAD_END_SHORT : SEG_PAD_END_TIGHT;
        const s = Math.max(0, Number(t.startTime) - SEG_PAD_START);
        const e = Math.min(totalSec, Number(t.endTime) + tailPad);
        return [Number(s.toFixed(3)), Number(e.toFixed(3))] as [number, number];
      })
      .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s + 0.05);

    // ── v39 — Per-Turn Tight WAV ─────────────────────────────────────────
    // For multi-speaker scenes we slice this pass's silence-padded WAV down
    // to ONLY the speaker's voiced turn windows. Sync.so then receives an
    // audio file that equals the turn duration; with `sync_mode=cut_off`
    // the output video is naturally cut to that length and animation starts
    // at output-t=0. The Remotion compositor can replay it at the original
    // absolute timeline with a plain `<Sequence from={turnStart}>` and NO
    // `startFrom` seek — making the pipeline INDEPENDENT of the deployed
    // Lambda bundle version (v38 needed a bundle-redeploy; v39 doesn't).
    let tightAudioInfo: { url: string; durSec: number } | null = null;
    // v175 — Tight-Slice für ALLE N≥1 (revert v169). Sync.so wirft reproduzierbar
    // `generation_unknown_error` wenn die per-Sprecher-WAV mehrheitlich trailing
    // silence enthält (siehe v64). v169 hatte das für N=1 abgeschaltet um
    // Tail-Talk zu fixen — Tail-Talk wird ab v175 stattdessen durch den
    // closed-mouth Plate-Prompt in compose-video-clips verhindert (v167 idle
    // mouth motion entfernt). Overlay-Mode N=1 ist in render-sync-segments-
    // audio-mux ebenfalls wieder aktiv.
    // v194 — Stabilizer passes carry a scene-length near-silence WAV. Tight-
    // slicing/re-uploading that per stabilizer is wasteful and would emit a
    // near-empty audio window that Sync.so has historically rejected. Keep
    // the full silence WAV → mux uses absolute timing on segments.
    const isStabilizerForTight = isStabilizerPass(pass);
    // FA-4 v406 — auf einem frozen NOOP-Retry wird NIE neu tight-gesliced:
    // der Provider-Audio-Input kommt 1:1 aus dem Snapshot.
    // V543-2 — im Full-Shot-Pfad wird NICHT tight-gesliced. Das Video ist die
    // ganze Platte; das per-Sprecher-WAV ist bereits auf die volle Plate-Länge
    // stille-gepolstert. Nur so teilen Video, Audio und Box-Array EINE
    // Zeitachse. Ein tight-Slice würde 2,2 s Audio gegen 15 s Video stellen —
    // mit `cut_off` liegt der genutzte Bereich dann ausserhalb aller Boxen,
    // und Sync.so antwortet `generation_input_face_selection_invalid`.
    const v543FullShotAudio = (pass as any)._v153BboxPrimary === true;
    const allowTightSlice = passes.length >= 1 && !isStabilizerForTight &&
      !v406SkipRebuild && !v543FullShotAudio;
    if (v543FullShotAudio) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v543_fullshot_audio_plate_aligned — tight slice skipped, plate-length WAV kept`,
      );
    }

    if (v406SkipRebuild) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_skip_tight_slicing frozen=${v406ReuseFrozen}`,
      );
    }
    if (allowTightSlice && speakerWindowsSecs.length > 0) {


      try {
        const wavResp = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
        if (!wavResp.ok) throw new Error(`fetch ${wavResp.status}`);
        const wavBytes = new Uint8Array(await wavResp.arrayBuffer());
        const sliced = sliceWavToWindows(
          wavBytes,
          speakerWindowsSecs.map(([s, e]) => ({ startSec: s, endSec: e })),
          { gapSec: 0.05 },
        );
        const tightPath = `${userId}/twoshot-vo/${sceneId}-pass-${pass.idx + 1}-tight-${Date.now()}.wav`;
        const up = await supabase.storage.from("voiceover-audio").upload(
          tightPath,
          sliced.bytes,
          { contentType: "audio/wav", upsert: true },
        );
        if (up.error) throw new Error(`upload: ${up.error.message}`);
        const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(tightPath);
        if (!pub?.publicUrl) throw new Error("publicUrl missing");
        (pass as any).audio_url_full = pass.audio_url;
        pass.audio_url = pub.publicUrl;
        // v90 — per-turn offsets inside the tight WAV. Mirrors sliceWavToWindows
        // layout: each window is concatenated in sorted order, separated by
        // gapSec (0.05s) of silence. Used by the mux to set sourceStartSec so
        // turn N plays its own slice of the Sync.so output instead of always
        // restarting at output-t=0 (which would replay turn-1 lips for turn-2).
        const GAP_SEC = 0.05;
        const sortedWindows = [...speakerWindowsSecs].sort((a, b) => a[0] - b[0]);
        const outputOffsetsSec: number[] = [];
        let cursor = 0;
        for (let i = 0; i < sortedWindows.length; i++) {
          outputOffsetsSec.push(Number(cursor.toFixed(3)));
          const [s, e] = sortedWindows[i];
          cursor += Math.max(0, e - s);
          if (i < sortedWindows.length - 1) cursor += GAP_SEC;
        }
        (pass as any).audio_tight = {
          url: pub.publicUrl,
          dur_sec: Number(sliced.durSec.toFixed(3)),
          windows_secs: speakerWindowsSecs,
          output_offsets_sec: outputOffsetsSec,
        };
        tightAudioInfo = { url: pub.publicUrl, durSec: sliced.durSec };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v90_tight_audio dur=${sliced.durSec.toFixed(2)}s windows=${JSON.stringify(speakerWindowsSecs)} offsets=${JSON.stringify(outputOffsetsSec)} url=${pub.publicUrl.slice(0, 80)}`,
        );
      } catch (sliceErr) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v39_tight_audio_failed: ${(sliceErr as Error)?.message} — failing safely; undocumented segments_secs fallback disabled`,
        );
        (pass as any).tight_audio_error = (sliceErr as Error)?.message ?? String(sliceErr);
      }
    }

    // ── v153.4 — Legacy Batch-Preclip vollständig entfernt ───────────────
    // Der `plan_b_B_batch_preclip_*` Pfad (Juni 2026) hat parallel zum v153
    // bbox-url-pro Pfad gerendert und dabei die ASD nach v153 überschrieben.
    // Phase A (v153.3) hat ihn gegated; Phase B.1 (v153.4) löscht ihn.
    // Der `composer.batch_preclip_render` system_config Key bleibt in der
    // DB liegen, wird aber nicht mehr gelesen.



    // ── v69 — Single-Face PRECLIP for ALL speaker counts (1..4) ─────────
    // Unified pipeline: regardless of N, we render a tight SINGLE-FACE
    // SQUARE CROP per pass via Remotion Lambda (DialogTurnFaceCropVideo)
    // and send THAT to Sync.so. Sync.so always sees exactly ONE face,
    // `auto_detect:true` is unambiguous, no more `provider_unknown_error`
    // on the full multi-face plate.
    //
    // v68 proved this pattern stable for N≥3. v69 extends it to N=1/2,
    // where the legacy full-plate + `coords-pro`/`active_speaker_detection`
    // path had been an ongoing source of provider_unknown_error.
    //
    // The lipsynced crop is overlaid back at (cropX, cropY, cropSize) in
    // render-sync-segments-audio-mux via DialogStitchVideo's `crop` shot
    // type. Fallback to full-plate dispatch is preserved if the preclip
    // Lambda fails (no regression risk).
    //
    // Idempotent: once a pass has `preclip_url`, reuse it on retries.
    // v88 — Edge-Speaker Guard. When the speaker's coords sit within the
    // outer 25 % of the plate width (or 15 % of the height), the 512x512
    // preclip crop is forced against the plate boundary and Sync.so's
    // `auto_detect:true` on the resulting cropped frame routinely fails
    // to find an active speaker → output is the unchanged preclip and
    // the muxed scene shows a closed mouth during the speaker's voice
    // window. DB-confirmed on scene ec22e048… (June 2026): center speakers
    // at 41 % and 63 % width animated correctly, edge speakers at 22 %
    // and 84 % width came back static. For edge speakers we skip the
    // preclip entirely so `freshDefaultVariant` selects `bbox-url-pro`
    // and Sync.so receives a per-frame deterministic target box on the
    // FULL multi-face plate (which sync-3 handles natively).
    const EDGE_X_FRAC = 0.25;
    const EDGE_Y_FRAC = 0.15;
    const speakerIsEdgePositioned = (() => {
      if (!plateDims || !Array.isArray(pass.coords) || pass.coords.length !== 2) return false;
      const cx = Number(pass.coords[0]);
      const cy = Number(pass.coords[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
      const xFrac = cx / plateDims.width;
      const yFrac = cy / plateDims.height;
      return (
        xFrac < EDGE_X_FRAC ||
        xFrac > 1 - EDGE_X_FRAC ||
        yFrac < EDGE_Y_FRAC ||
        yFrac > 1 - EDGE_Y_FRAC
      );
    })();
    const haveBboxUrlPathForEdge =
      speakers.length >= 2 &&
      !!plateDims &&
      !!plateIdentityMap &&
      (plateIdentityMap.resolvedCount ?? 0) > 0;
    // v97 (Pipeline-Vergleich mit Sync.so Docs, Juni 10 2026) —
    // Generalisierung des v88 Edge-Speaker-Skips auf ALLE Multi-Speaker-Szenen.
    // Sync.so sync-3 verarbeitet die volle Plate nativ mit Multi-Face,
    // Profile & Occlusion-Support, wenn wir `bounding_boxes_url` setzen
    // (siehe docs/developer-guides/speaker-selection). Unsere 512×512
    // Single-Face-Preclips sind eine ~67 s teure Workaround-Pipeline gegen
    // ein Problem, das sync-3 nativ löst, und sind die Hauptquelle der
    // "An unknown error occurred."-Fehler (preclip face-gate fails →
    // Fallback auf full-plate-with-plate-coords → Sync.so frame_number
    // zeigt auf den preclip-zugehörigen Frame im echten Plate-Video).
    // Wir routen jeden Multi-Speaker-Pass auf den bbox-url-pro Pfad,
    // wenn er verfügbar ist. Single-Speaker und Szenen ohne plate-identity
    // fallen weiterhin auf den preclip-Pfad zurück (unverändert).
    // v125 (June 15 2026) — Edge-speaker preclip skip DISABLED.
    // Root cause for scene 34757e6a… (DB-verified): Samuel sat at x≈306 on
    // a 1376px-wide plate (xFrac ≈ 0.22 < 0.25), so v88 routed him to the
    // full-plate `bbox-url-pro` path. Both attempts returned
    // `provider_unknown_error` while the other 3 speakers (preclip path)
    // succeeded → scene died as `multi_speaker_incomplete_3_of_4`.
    // The v116 face-gate self-repair (expansion ladder 1.0/1.4/1.8) handles
    // edge crops correctly, so there is no reason to skip the preclip just
    // because the speaker sits near the rim. We keep `speakerIsEdgePositioned`
    // as a diagnostic but force `skipPreclipForEdgeSpeaker` to false so v107
    // (hard preclip enforcement) is the only gate.
    // v120's preclip-forcing branch is preserved (silentBboxFails detector
    // still clears any cached preclip when bbox-url-pro had two silent fails).
    const skipPreclipForEdgeSpeaker = false;
    void speakerIsEdgePositioned;
    void haveBboxUrlPathForEdge;
    // v107 — Hard-preclip enforcement: every multi-speaker pass MUST go
    // through the single-face preclip path. v105 force-fullplate was the
    // root cause of the "2 mouths closed, 2 mouths speak everyone's lines"
    // failure on 4-speaker scenes (DB-verified 89db58ca on 2026-06-11):
    // coords 838 px and 901 px (Δ 63 px on 1376 px wide plate) collided so
    // sync-3 routed two audios onto the same face and morphed neighbours
    // together. Only exception: edge-speaker bbox-url-pro path (v88), which
    // is doc-compliant on the full multi-face plate. If a preclip can't be
    // produced for an N>=2 pass we MUST hard-fail with refund — no silent
    // full-plate fallback. See mem/architecture/lipsync/v107-hard-preclip-enforcement.md.
    if (skipPreclipForEdgeSpeaker) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v88_edge_speaker_skip_preclip coords=${JSON.stringify(pass.coords)} plate=${plateDims!.width}x${plateDims!.height} → full-plate deterministic ASD (bbox-url-pro)`,
      );
    }
    // ── v161 — Single-Face Preclip + bbox-url-pro (1..N einheitlich) ─────
    // Für JEDEN Pass (1 Sprecher oder 4 Sprecher) wird ein Single-Face
    // Square-Crop des aktiven Sprechers via Remotion Lambda gerendert und
    // an Sync.so geschickt. Dispatch bleibt `bbox-url-pro` mit einer in
    // den CLIP-Koordinatenraum transformierten plate-nativen Face-Box.
    // Mux (render-sync-segments-audio-mux) überlagert den lipsynced Crop
    // via `preclip_crop` zurück auf die Master-Plate. Damit gibt es kein
    // Full-Frame Morphen mehr auf Nachbargesichter, weder bei N=1 noch N=4.
    //
    // Idempotent: ein bereits gerenderter Preclip wird wiederverwendet.
    // Fail-Closed: wenn der Preclip nicht rendert UND keine Plate-Box
    // existiert, greift der v153.5 Hard-Fail unten (Refund + abort).
    // v204 — Preclip cache is honored again for N>=2 (rollback of v203's
    // drop-cached-preclip block). Renderers use idempotent preclips.
    let passPreclipUrl: string | null = ((pass as any).preclip_url ?? null);
    let usePassPreclip: boolean = !!passPreclipUrl && !!(pass as any).preclip_crop;

    // ── V445 — geometry-coherence guard for cached pre-clips ─────────────
    // A crop measured on OTHER geometry (earlier anchor / earlier plate
    // generation) can never satisfy the fail-closed containment gate.
    // Drop such a cache so the crop is recomputed from the FINAL assigned
    // plate bbox of this run. Assignment lock and run identity untouched.
    const v445FinalDispatchBox = buildDispatchFaceBox(
      speakerPlateBboxes?.[pass.speaker_idx] ?? null,
      plateDims ?? null,
    );
    const v445FinalBoxSig = faceBoxSignature(v445FinalDispatchBox);
    const v445MeasureSrc = [
      sanitizeMeasureSource(sourceClipUrl) ?? "unknown-plate",
      `hydration=${plateHydrationSource ?? "unknown"}`,
    ].join("#");
    const v450NoopEscalation = body?.noop_auto_escalation === true;
    if (usePassPreclip && v445FinalBoxSig) {
      const cachedSig = faceBoxSignature((pass as any).preclip_from_bbox ?? null);
      const decision = decideCachedPreclipDrop({
        hasCachedPreclip: true,
        cachedBoxSig: cachedSig,
        finalBoxSig: v445FinalBoxSig,
        noopAutoEscalation: v450NoopEscalation,
      });
      if (decision.tag === "v450_noop_retry_geometry_drift_ignored") {
        // V450 §1 — the frozen wire snapshot is the authority on a NOOP retry.
        // preclip_url / preclip_crop / audio / bbox / run identity stay as-is;
        // the drift is telemetry only.
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v450_noop_retry_geometry_drift_ignored ` +
            `cached_bbox=${cachedSig ?? "none"} final_bbox=${v445FinalBoxSig} → frozen wire preserved`,
        );
      } else if (decision.drop) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v445_cached_crop_geometry_mismatch ` +
            `cached_bbox=${cachedSig ?? "none"} final_bbox=${v445FinalBoxSig} → recompute crop from final plate measurement`,
        );
        usePassPreclip = false;
        passPreclipUrl = null;
        (pass as any).preclip_url = null;
        (pass as any).preclip_crop = null;
      }
    }

    // ── V450 §2 — proof-bound recovery of a lost frozen preclip ───────────
    // Only when run_id + plate_generation + pass index all match the immutable
    // V434 pin AND the original crop geometry is reconstructible. A bare MP4
    // URL without its crop is never enough — the v204 gate then stays
    // fail-closed (including the idempotent refund path).
    if (!usePassPreclip && v450NoopEscalation) {
      const recovery = recoverFrozenPreclip({
        noopAutoEscalation: true,
        sceneId,
        runId: (scene as any)?.active_run_id ?? null,
        generation: Number((scene as any)?.plate_generation ?? Number.NaN),
        passIdx: currentPassIdx,
        pin: (pass as any)._v434_preclip_pin ?? null,
        frozenCrop: (pass as any).preclip_crop ?? (pass as any)._v450_frozen_preclip_crop ?? null,
      });
      if (recovery.ok) {
        passPreclipUrl = recovery.url;
        usePassPreclip = true;
        (pass as any).preclip_url = recovery.url;
        (pass as any).preclip_crop = recovery.crop;
        // V452 — the frozen camera path travels with the frozen wire. It is
        // never recomputed here; without it the recovered preclip would be
        // reprojected along a different geometry than it was rendered with.
        const frozenPath = (pass as any)._v450_frozen_camera_path ?? (pass as any).preclip_camera_path ?? null;
        if (frozenPath) (pass as any).preclip_camera_path = frozenPath;
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v450_frozen_preclip_recovered source=${recovery.source}`,
        );
      } else {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v450_frozen_preclip_recovery_declined reason=${recovery.reason}`,
        );
      }
    }



    const v161PreclipEligible =
      !usePassPreclip &&
      // V543 — im Full-Shot-Pfad gibt es bewusst keinen Selbst-Crop.
      !(pass as any)._v153BboxPrimary &&
      !!tightAudioInfo &&
      !!plateDims &&
      !!sourceClipUrl &&
      Array.isArray(pass.coords) &&
      Number.isFinite(Number(pass.coords?.[0])) &&
      Number.isFinite(Number(pass.coords?.[1])) &&
      Array.isArray(speakerWindowsSecs) && speakerWindowsSecs.length > 0 &&
      body?.noop_auto_escalation !== true;


    if (v161PreclipEligible) {
      const unionStart = Math.max(0, Math.min(...speakerWindowsSecs.map(([s]) => s)));
      const unionEnd = Math.min(totalSec, Math.max(...speakerWindowsSecs.map(([, e]) => e)));
      const siblingCoords: Array<[number, number]> = [];
      for (let i = 0; i < speakers.length; i++) {
        if (i === pass.speaker_idx) continue;
        // `speakers[]` contains script/character metadata, not resolved plate
        // coordinates. Reading `speakers[i].coords` left this list empty and
        // allowed a nominal single-face crop to include adjacent cast members.
        // `speakerCoords[]` is the plate-native, identity-resolved authority.
        const c = speakerCoords[i];
        if (Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
          siblingCoords.push([Number(c[0]), Number(c[1])]);
        }
      }
      const platePassBoxForPreclip = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render START speaker=${pass.speaker_name} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] speakers=${speakers.length} plate_box=${platePassBoxForPreclip ? "yes" : "no"} siblings=${siblingCoords.length}`,
      );
      // ── V456 Gate 2 — ANCHOR COHERENCE (v400 T5) ────────────────────────
      // The geometry (face box + mouth) is validated against the ANCHOR image
      // by the v185 anchor-first sanity gate, so the ANCHOR — not the plate
      // video — is the authoritative geometry source. Gate 1 proved we labelled
      // it with the plate URL, which made the measurement contract unverifiable.
      const v456AnchorSrc = sanitizeMeasureSource(
        ((scene as any).reference_image_url || "").trim() || null,
      );
      // V456 — robust, pose-aware mouth fallback. No skin/lip COLOR heuristic:
      // when the detector returns no mouth landmark we estimate it from the
      // assignment-locked face box (yaw-shifted), so profile speakers keep a
      // mouth anchor instead of degrading to the legacy face-center crop.
      const v456DetectedMouth = speakerPlateMouths?.[pass.speaker_idx] ?? null;
      // Preliminary anchor (identical to the pre-V477 behaviour) — used only as
      // the identity tiebreak for the face track below.
      const v456MouthPreliminary = resolveMouthAnchorPoseAware({
        bbox: platePassBoxForPreclip ?? null,
        landmark: v456DetectedMouth,
        yawDeg: Number((pass as any).plate_yaw_deg ?? 0) || 0,
      })?.mouth ?? null;

      // ── V477 — LANDMARK AUTHORITY (docs/v476-t8-conformance-measurement.md)
      // The plate identity snapshot carries no mouth landmarks, while the
      // per-pass face track measures the real mouth in every sample. Until now
      // that track ran INSIDE `buildCameraPath`, i.e. after the crop had been
      // computed from the 0.78 pose estimate, so the better measurement was
      // discarded. V477 hoists the SAME single track in front of the crop:
      // no extra Rekognition cost, and `buildCameraPath` reuses these exact
      // samples so the camera path itself is unchanged (that is V478 scope).
      let v477PreTrack: { ok: boolean; reason?: string; samples: any[]; latencyMs?: number } | null = null;
      // V513-T0 — shadow telemetry only: remember whether the SAME track threw.
      let v477TrackThrewReason: string | null = null;
      if (platePassBoxForPreclip) {
        try {
          v477PreTrack = await trackAssignedFaceAcrossTurn({
            plateVideoUrl: sourceClipUrl,
            totalSec,
            plateWidth: plateDims.width,
            plateHeight: plateDims.height,
            startSec: unionStart,
            endSec: unionEnd,
            anchorBox: platePassBoxForPreclip as [number, number, number, number],
            // V456 — identity-safe mouth tiebreak keeps the track alive on
            // 3/4 profiles and lateral movement.
            anchorMouth: v456MouthPreliminary,
            siblingCenters: siblingCoords,
            sampleCount: TRACK_SAMPLE_COUNT,
            budgetMs: 70_000,
          }) as any;
        } catch (err) {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v477_track_failed ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          v477PreTrack = null;
          v477TrackThrewReason =
            `track_threw:${err instanceof Error ? err.message : String(err)}`;
        }
      }
      // ── V540-OBS — WARUM DER FACE-TRACK LEER BLEIBT ─────────────────────
      // Beobachtung Produktion (Szene ecb95d2b…): alle Passes tracken 0
      // Samples → kein Mund-Landmark → `pose_estimate` → V471-Anker
      // `face_ratio` → V500 kann ein NOOP nie terminalisieren, die Szene
      // gilt als fertig obwohl kein Mund bewegt wurde. Der Grund pro Sample
      // ist heute nur im Log, das für diesen Lauf nicht mehr existiert.
      // Rein additive Telemetrie: kein Branch liest dieses Feld.
      try {
        (pass as any)._v540_track_debug = {
          version: "v540-obs",
          ok: v477PreTrack?.ok ?? null,
          reason: v477TrackThrewReason ?? v477PreTrack?.reason ?? null,
          latency_ms: v477PreTrack?.latencyMs ?? null,
          sample_count: Array.isArray(v477PreTrack?.samples) ? v477PreTrack!.samples.length : 0,
          valid_samples: Array.isArray(v477PreTrack?.samples)
            ? (v477PreTrack!.samples as any[]).filter((s) => s?.box).length
            : 0,
          sample_reasons: Array.isArray((v477PreTrack as any)?.debug)
            ? ((v477PreTrack as any).debug as any[]).slice(0, 12).map((d) => ({
              t: d?.t ?? null,
              accepted: d?.accepted ?? null,
              reason: typeof d?.reason === "string" ? d.reason.slice(0, 180) : null,
              faces: d?.faces ?? null,
            }))
            : null,
        };
      } catch (_v540Err) {
        // Telemetrie darf die Pipeline nie beeinflussen.
      }
      // ── V513-T0 — SHADOW MOTION TELEMETRY ───────────────────────────────
      // Derived purely from the EXISTING v477 track. No extra provider calls,
      // no thresholds, no gates, no consumers. Attached additively to the pass
      // so it rides along with the existing pass write.
      try {
        (pass as any)._v513_motion_telemetry = computeV513MotionTelemetry({
          samples: platePassBoxForPreclip ? (v477PreTrack?.samples ?? []) : null,
          trackOk: v477TrackThrewReason !== null
            ? false
            : v477PreTrack
              ? v477PreTrack.ok
              : undefined,
          reason: v477TrackThrewReason ?? v477PreTrack?.reason ?? null,
        });
      } catch (_v513Err) {
        // Shadow telemetry must never affect the pipeline.
      }
      const v477Authority = resolveTrackMouthAuthority(
        v477PreTrack?.ok ? (v477PreTrack.samples as any[]) : null,
      );
      // ══ V516 — AUTHORITY COHERENCE BEFORE PAIRING ═══════════════════════
      //
      // `landmark: v477Authority.mouth ?? v456DetectedMouth` paired a
      // TURN-AGGREGATE mouth with a SNAPSHOT bbox and never asked whether the
      // two describe the same face. Generation 14 pass 5: the box ended at
      // x=637, the tracked median mouth sat at x=641, and the resolver passes
      // a supplied landmark through verbatim. The planner then sized the crop
      // from the box (165 px) and positioned it on the mouth — 15 px from the
      // plate edge — so the crop clamped to its only admissible x and the
      // mouth band overhung by 10.85 px. Size-independent: no crop could have
      // held it.
      //
      // V477 keeps its authority whenever it is coherent. This rejects the
      // PAIRING, not the aggregate — and never the pass: an incoherent
      // landmark degrades to the same-snapshot landmark, then to the existing
      // pose estimate, both measured against this very box.
      const v516Mouth = chooseCoherentMouthAuthority({
        bbox: platePassBoxForPreclip ?? null,
        trackMouth: v477Authority.mouth ?? null,
        snapshotMouth: v456DetectedMouth ?? null,
      });
      (pass as any)._v516_mouth_authority = buildV516MouthAuthorityTelemetry(v516Mouth);
      if (v516Mouth.rejectedReason) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v516_mouth_incoherent ` +
            `reason=${v516Mouth.rejectedReason} requested=${v516Mouth.requestedSource} ` +
            `selected=${v516Mouth.selectedSource} track=${JSON.stringify(v516Mouth.trackMouth)} ` +
            `bbox=${JSON.stringify(v516Mouth.bbox)}`,
        );
      }
      const v456MouthResolved = resolveMouthAnchorPoseAware({
        bbox: platePassBoxForPreclip ?? null,
        // V477 — measured track landmark first, plate-identity landmark second,
        // validated 0.78 face-ratio fallback last. V516 decides which of the
        // two may be paired with THIS bbox; the resolver itself is unchanged.
        landmark: v516Mouth.landmark,
        yawDeg: Number((pass as any).plate_yaw_deg ?? 0) || 0,
      });
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v477_mouth_authority ` +
          `source=${v456MouthResolved?.source ?? "none"} ` +
          `v516=${v516Mouth.selectedSource}${v516Mouth.rejectedReason ? `:${v516Mouth.rejectedReason}` : ""} ` +
          `track_ok=${v477PreTrack?.ok ?? false} ` +
          `measured=${v477Authority.measured}/${v477Authority.total} face_ratio=${v477Authority.faceRatio ?? "n/a"} ` +
          `reason=${v477Authority.reason}`,
      );
      if (!v477Authority.mouth && !v456DetectedMouth) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v456_mouth_landmark_fallback ` +
            `source=${v456MouthResolved?.source ?? "none"} bbox=${JSON.stringify(platePassBoxForPreclip ?? null)}`,
        );
      }
      const v456MouthForPreclip = v456MouthResolved?.mouth ?? null;

      // V464-B — the plate face track is persisted with the pass so the ASD
      // sequence can be registered per frame (and a retry reuses it verbatim).
      let v464TrackSamples: V464TrackSample[] | null = null;


      try {

        const v542PreclipInput = {

            sceneId,
            projectId: String((scene as any).project_id ?? ""),
            // V447 — Run-Identität: bindet den Preclip an Lauf + Generation.
            runId: String((scene as any).active_run_id ?? "") || null,
            plateGeneration: Number.isFinite(Number((scene as any).plate_generation)) ? Number((scene as any).plate_generation) : null,
            userId,
            passIdx: currentPassIdx,
            masterVideoUrl: sourceClipUrl,
            srcWidth: plateDims.width,
            srcHeight: plateDims.height,
            coords: [Number(pass.coords[0]), Number(pass.coords[1])],
            bbox: platePassBoxForPreclip,
            mouth: v456MouthForPreclip,
            // V445 — same measurement label as the dispatch face box.
            bboxMeasureSrc: v445MeasureSrc,
            siblingCoords: siblingCoords.length > 0 ? siblingCoords : null,
            startSec: unionStart,
            endSec: unionEnd,
            // V461 D — GEOMETRY from the already-measured V477 track, so the
            // crop is sized to contain where the face ACTUALLY was during this
            // turn instead of a stale anchor. Identity stays with the
            // assignment lock: this list never chooses a face.
            turnFaceBoxes: v477PreTrack?.ok
              ? (v477PreTrack.samples as any[]).map((sample) => sample?.box ?? null)
              : null,
            // V461 E — with times, the planner confirmation can test the window
            // that will actually be rendered at that instant.
            turnFaceSamples: v477PreTrack?.ok
              ? (v477PreTrack.samples as any[]).map((sample) => ({ t: sample?.t ?? null, box: sample?.box ?? null }))
              : null,
            // ── V452 — dynamic face tracking ─────────────────────────────
            // Fresh dispatch only (this whole block is unreachable on a NOOP
            // retry, see `v161PreclipEligible`). Identity is already locked;
            // we only follow THAT face. Any failure degrades to the static
            // crop — never to another face.
            buildCameraPath: async (staticCrop) => {
              if (!platePassBoxForPreclip) return null;
              // V477 — reuse the SAME track that already produced the mouth
              // authority above. No second Rekognition pass, and the camera
              // path receives byte-identical inputs to the pre-V477 behaviour.
              const track = v477PreTrack;
              if (!track) return null;
              console.log(
                `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v452_face_track ok=${track.ok} reason=${track.reason} ` +
                  `valid=${track.samples.filter((x: any) => x.box).length}/${track.samples.length} ms=${track.latencyMs} reused=v477`,
              );
              if (!track.ok) return null;

              // V464-B — freeze the measured plate-space track (PLATE-absolute
              // seconds). It is the per-frame source for the ASD boxes.
              v464TrackSamples = (track.samples as any[])
                .filter((s: any) => Array.isArray(s.box))
                .map((s: any) => ({
                  t: Number(Number(s.t).toFixed(4)),
                  box: (s.box as [number, number, number, number]).map((v: number) => Math.round(v)) as
                    [number, number, number, number],
                  mouth: s.mouth ? [Math.round(s.mouth[0]), Math.round(s.mouth[1])] as [number, number] : null,
                }));

              const path = buildDynamicCameraPath({
                samples: track.samples,
                staticCrop,
                // V536 — the mouth-band authority, measured by this very preclip.
                // Absent or non-finite keeps the legacy face-only solve byte-identical.
                faceShare: (staticCrop as { faceShare?: number | null }).faceShare ?? null,
                srcWidth: plateDims.width,

                srcHeight: plateDims.height,
                startSec: unionStart,
                endSec: unionEnd,
              });
              console.log(
                `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v452_camera_path sig=${path.signature} moving=${path.moving} keys=${path.keyframes.length} reason=${path.reason}`,
              );
              if (path.mouthInfeasible) {
                // V536 — face + mouth + plate had no common crop centre, or the
                // decimated path failed its render-cadence re-check. This is a
                // PROVEN infeasibility, not a tracking failure, so it fails closed:
                // pass-face-preclip refuses the render and the existing
                // pre-dispatch handling and refund path apply. No static fallback,
                // because the static branch measures one collapsed median mouth and
                // would hide the per-frame escape just established.
                const mi = path.mouthInfeasible;
                console.warn(
                  `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v536_mouth_crop_infeasible ` +
                    `axis=${mi.axis} frame=${mi.frame} t=${mi.t ?? "-"} crop=${mi.cropSize} ` +
                    `face=${mi.faceWidth ?? "-"}x${mi.faceHeight ?? "-"} ` +
                    `band=${mi.bandWidthPx ?? "-"}x${mi.bandHeightPx ?? "-"} ` +
                    `interval=[${mi.intervalLo},${mi.intervalHi}] — preclip refused, no dispatch`,
                );
              }
              return path;
            },
        };
        let preclipResult = await renderPassFacePreclip(
          supabase,
          serviceKey,
          supabaseUrl,
          v542PreclipInput,
          300_000,
        );
        // ── V542 — 2-Sprecher Golden-Core Preclip Recovery ────────────────
        //
        // Die beiden belegten dynamischen Fehlerklassen sind Aussagen über den
        // TRACK, nicht über eine real unmögliche Geometrie (Produktionsbefund:
        // 2,24 px Konflikt bei unbewegtem Pfad bzw. sechs verworfene Samples,
        // bei vollständigem Identity-Lock). Derselbe Turn bekommt genau EINEN
        // statischen Versuch mit dem gemessenen Golden-Core-Crop.
        //
        // Kein Threshold wird gesenkt: der statische Versuch durchläuft den
        // unveränderten V461-Face-/Containment-Vertrag. Kein Full-Plate,
        // kein Provider-Call, kein Retry-Zähler, keine Refund-Änderung.
        let v542RecoveryApplied = false;
        if (!preclipResult.ok) {
          const v542Decision = evaluateV542Recovery({
            speakerCount: speakers.length,
            preclipError: preclipResult.error ?? null,
            preclipErrorClass: preclipResult.errorClass ?? null,
            identityResolvedCount: (plateIdentityMap as any)?.resolvedCount ?? null,
            dynamicAttempted: true,
          });
          if (v542Decision.eligible) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v542_static_golden_core_retry ` +
                `dynamic_reason=${v542Decision.matchedReason} speakers=${speakers.length} — retrying with static crop`,
            );
            const staticAttempt = await renderPassFacePreclip(
              supabase,
              serviceKey,
              supabaseUrl,
              {
                ...v542PreclipInput,
                // Golden-Core: statischer, assignment-locked Face-Center-Crop.
                turnFaceBoxes: null,
                turnFaceSamples: null,
                // Kein Retracking, kein eingefrorener dynamischer Pfad:
                // der statische Crop IST der Golden-Core.
                buildCameraPath: undefined,
                frozenCameraPath: null,

              },
              300_000,
            );
            v542RecoveryApplied = !!staticAttempt.ok;
            await recordCallbackObservation(supabase, {
              handler: "compose-dialog-segments",
              verdict: V542_RECOVERY_VERDICT,
              stage: "dialog_dispatch",
              pipelineJobId: null,
              sceneId,
              runId: ((scene as any)?.active_run_id ?? null) as string | null,
              plateGeneration: Number.isFinite(Number((scene as any)?.plate_generation))
                ? Number((scene as any).plate_generation)
                : null,
              externalJobId: null,
              details: buildV542RecoveryDetails({
                passIdx: currentPassIdx,
                totalPasses: passes.length,
                matchedReason: v542Decision.matchedReason,
                outcome: staticAttempt.ok ? "recovered" : "static_also_refused",
                speakerCount: speakers.length,
                identityResolvedCount: (plateIdentityMap as any)?.resolvedCount ?? null,
              }),
            });
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v542_static_golden_core_result ` +
                `ok=${staticAttempt.ok} err=${staticAttempt.error ?? "-"} class=${staticAttempt.errorClass ?? "-"}`,
            );
            // Erfolg ersetzt das Ergebnis; ein erneutes Refusal behält die
            // ursprüngliche dynamische Diagnose als führenden Fehler.
            if (staticAttempt.ok) preclipResult = staticAttempt;
          } else {
            console.log(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v542_recovery_skipped ` +
                `reason=${v542Decision.reason}`,
            );
          }
        }

        if (preclipResult.ok && preclipResult.preclipUrl && preclipResult.crop) {
          passPreclipUrl = preclipResult.preclipUrl;
          usePassPreclip = true;
          (pass as any).preclip_url = preclipResult.preclipUrl;
          (pass as any).preclip_render_id = preclipResult.preclipRenderId ?? null;
          (pass as any).preclip_crop = {
            x: preclipResult.crop.x,
            y: preclipResult.crop.y,
            size: preclipResult.crop.size,
            outputSize: preclipResult.crop.outputSize,
          };
          // V542 — Herkunft der persistierten Geometrie. Ein statischer
          // Recovery-Crop darf nie als dynamischer Pfad erscheinen; Mux und
          // Reprojektion lesen exakt denselben Crop.
          (pass as any).preclip_crop_source = v542RecoveryApplied
            ? "v542_static_golden_core"
            : "v452_dynamic";

          // V461 C — the real provider-facing dimensions of THIS pre-clip.
          // Telemetry must never fall back to plate dims again.
          (pass as any).preclip_dims = {
            width: Number(preclipResult.crop.outputSize),
            height: Number(preclipResult.crop.outputSize),
          };
          // V450 §2 — immutable crop snapshot so a later NOOP retry can prove
          // the frozen geometry even if `preclip_crop` was cleared meanwhile.
          (pass as any)._v450_frozen_preclip_crop = (pass as any).preclip_crop;
          // V452 — freeze the exact camera path with the wire. The mux
          // reprojects along this identical path (T13), and a NOOP retry
          // reuses it verbatim instead of re-tracking.
          const v452Path: DynamicCameraPath | null = preclipResult.cameraPath ?? null;
          (pass as any).preclip_camera_path = v452Path;
          (pass as any)._v450_frozen_camera_path = v452Path;
          (pass as any).preclip_camera_path_sig = v452Path?.signature ?? null;
          (pass as any).preclip_camera_path_dynamic = isDynamicCameraPath(v452Path);
          // V452 §7 — per-sample mouth geometry. EVIDENCE/TELEMETRY ONLY:
          // the frozen v404 ROI, thresholds and NOOP ladder are untouched.
          (pass as any).preclip_mouth_roi_samples = v452Path ? mouthRoiSamples(v452Path) : null;
          // V464-B — plate face track (plate-absolute seconds) frozen with the
          // pass. Source of truth for per-frame ASD registration.
          (pass as any).preclip_face_track = v464TrackSamples;
          (pass as any)._v450_frozen_face_track = v464TrackSamples;


          (pass as any).preclip_start_sec = Number(unionStart.toFixed(3));
          (pass as any).preclip_end_sec = Number(unionEnd.toFixed(3));
          // v163 — persist the exact Remotion render frame count. Sync.so
          // requires `bounding_boxes_url.bounding_boxes.length` to match the
          // dispatched video frames exactly; duration-derived `round(dur*fps)`
          // was off by one for short preclips.
          (pass as any).preclip_fps = Number(preclipResult.fps ?? 30);
          (pass as any).preclip_frame_count = Number.isFinite(Number(preclipResult.frameCount)) && Number(preclipResult.frameCount) > 0
            ? Math.max(1, Math.round(Number(preclipResult.frameCount)))
            : Math.max(1, Math.ceil((preclipResult.durationSec ?? Math.max(0.2, unionEnd - unionStart)) * Number(preclipResult.fps ?? 30)));
          (pass as any).preclip_duration_sec = Number(
            (preclipResult.durationSec ?? Math.max(0.2, unionEnd - unionStart)).toFixed(3),
          );
          (pass as any).preclip_error = null;
          // v247 — mouth-anchor observability, flowed into syncso_dispatch_log via meta.
          (pass as any).preclip_anchor = preclipResult.anchor ?? null;
          (pass as any).preclip_face_share = Number.isFinite(Number(preclipResult.faceShareInCrop))
            ? Number(preclipResult.faceShareInCrop)
            : null;
          (pass as any).preclip_mouth_offset_px = Number.isFinite(Number(preclipResult.mouthOffsetPx))
            ? Number(preclipResult.mouthOffsetPx)
            : null;
          // V458 — SIGNED mouth offset vector in PLATE pixels, relative to the
          // FINAL (post-V457) crop center. The V456 ROI contract normalizes it
          // with `preclip_crop.size` (also plate pixels). `null` whenever no
          // trustworthy mouth anchor exists → contract stays honest/unresolved.
          {
            const xy = (preclipResult as any).mouthOffsetXy;
            (pass as any).preclip_mouth_offset_xy =
              xy && Number.isFinite(Number(xy.dx)) && Number.isFinite(Number(xy.dy))
                ? { dx: Number(xy.dx), dy: Number(xy.dy) }
                : null;
            (pass as any).preclip_mouth_offset_space = "plate";
          }
          (pass as any).preclip_clamped = !!preclipResult.clamped;
          // V445 — geometry provenance: which measurement the crop came from
          // and the exact face bbox it was computed on. Enables the cache
          // invalidation above and the diagnostic tags on mismatch failures.
          (pass as any).preclip_from_bbox = preclipResult.cropFromBbox ?? platePassBoxForPreclip ?? null;
          (pass as any).preclip_crop_measure_src = preclipResult.cropMeasureSrc ?? v445MeasureSrc;
          // V457 — containment provenance (crop MUST contain the padded dispatch box).
          (pass as any).v457_contain_box = (preclipResult as any).containBox ?? null;
          // V510-P1 — WHICH measurement that box came from. Contract E needs
          // it to judge the same object the planner proved, instead of
          // re-deriving a static target of its own.
          (pass as any).v457_contain_source = (preclipResult as any).containSource ?? null;
          (pass as any).v457_contains_target = (preclipResult as any).containsTarget ?? null;
          // V519 — the planner may compute a projection and then discard it.
          // Which of the two the verdict describes is now explicit.
          (pass as any).v457_projection_applied = (preclipResult as any).projectionApplied ?? null;
          (pass as any).v457_projection_discarded = (preclipResult as any).projectionDiscarded ?? null;
          (pass as any).v457_projection_required_growth = (preclipResult as any).projectionRequiredGrowth ?? null;
          (pass as any).v457_contain_reason = (preclipResult as any).containReason ?? null;
          (pass as any).v457_crop_shift_px = (preclipResult as any).cropShiftPx ?? null;
          (pass as any).v457_size_grown = (preclipResult as any).cropSizeGrown ?? null;
          (pass as any).v457_size_grown_px = (preclipResult as any).cropSizeGrownPx ?? null;
          (pass as any).preclip_bbox_measure_src = preclipResult.bboxMeasureSrc ?? v445MeasureSrc;
          // ── V456 — geometry provenance for the mouth-ROI contract ────────
          // `preclip_*_measure_src` stay as-is (they honestly describe the
          // plate the crop was cut from). These fields carry the ANCHOR the
          // geometry was validated against (v400 T5) plus the identity the
          // geometry is frozen with, so the webhook can prove coherence.
          (pass as any).preclip_geometry_anchor_src = v456AnchorSrc;
          (pass as any).preclip_geometry_anchor_expected = v456AnchorSrc;
          (pass as any).preclip_geometry_mouth_source = v456MouthResolved?.source ?? null;
          (pass as any).preclip_geometry_identity = {
            runId: String((scene as any).active_run_id ?? "") || null,
            generation: Number.isFinite(Number((scene as any).plate_generation))
              ? Number((scene as any).plate_generation)
              : null,
            passIdx: currentPassIdx,
            speakerIdx: Number(pass.speaker_idx),
          };
          // ── V434 Step 1 — IMMUTABLE PRE-CLIP EVIDENCE COPY ──────────────
          // Calibration ground truth may only be built from bytes that cannot
          // be overwritten by a later run (docs/v433-motion-studio-rca.md).
          // Additive: `preclip_url` (what Sync.so receives) is NOT changed.
          try {
            const v434Key = buildImmutableArtifactKey({
              userId,
              sceneId,
              runId: String((scene as any)?.active_run_id ?? "") || "unknown-run",
              generation: Number((scene as any)?.plate_generation ?? 0) || 0,
              passIdx: currentPassIdx,
              kind: "preclip",
              attempt: resolveArtifactAttempt(pass),
            });
            const v434Pin = await pinImmutableArtifact({
              supabase,
              sourceUrl: preclipResult.preclipUrl,
              key: v434Key,
            });
            (pass as any)._v434_preclip_pin = {
              key: v434Pin.key,
              url: v434Pin.url,
              sha256: v434Pin.sha256,
              bytes: v434Pin.bytes,
              status: v434Pin.status,
            };
            // V435 — mirror the pin into the evidence table so the offline
            // cross-test harness can find pre-clips without parsing scene JSON.
            // Telemetry-only insert; never throws into the dispatch path.
            try {
              const { error: pinRowErr } = await supabase.from("v434_artifact_pins").insert({
                scene_id: sceneId,
                run_id: String((scene as any)?.active_run_id ?? "") || null,
                generation: Number.isFinite(Number((scene as any)?.plate_generation))
                  ? Number((scene as any).plate_generation)
                  : null,
                pass_idx: currentPassIdx,
                attempt: Number((pass as any)?.attempt ?? 0) || 0,
                kind: "preclip",
                purpose: "production",
                source_url: preclipResult.preclipUrl,
                object_key: v434Pin.key,
                pinned_url: v434Pin.url,
                sha256: v434Pin.sha256,
                byte_size: v434Pin.bytes,
                status: v434Pin.status,
              });
              if (pinRowErr) {
                console.warn(
                  `[compose-dialog-segments] v434_pin_log_failed scene=${sceneId}: ${pinRowErr.message}`,
                );
              }
            } catch (e) {
              console.warn(
                `[compose-dialog-segments] v434_pin_log_crash scene=${sceneId}: ${(e as Error).message}`,
              );
            }
            console.log(
              `[compose-dialog-segments] v434_pin scene=${sceneId} pass=${currentPassIdx} kind=preclip status=${v434Pin.status} sha256=${v434Pin.sha256 ?? "n/a"}`,
            );

          } catch (e) {
            console.warn(`[compose-dialog-segments] v434_pin_crash scene=${sceneId}: ${(e as Error).message}`);
          }
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render OK url=…${passPreclipUrl.slice(-60)} crop=${JSON.stringify((pass as any).preclip_crop)} render_id=${preclipResult.preclipRenderId} frames=${(pass as any).preclip_frame_count} dur=${(pass as any).preclip_duration_sec} fps=${(pass as any).preclip_fps} v247_anchor=${(pass as any).preclip_anchor} face_share=${(pass as any).preclip_face_share} mouth_off_px=${(pass as any).preclip_mouth_offset_px} v458_mouth_off_xy=${JSON.stringify((pass as any).preclip_mouth_offset_xy)} space=plate`,
          );

        } else {
          (pass as any).preclip_error = preclipResult.error ?? "preclip_unknown";
          (pass as any).preclip_error_class = preclipResult.errorClass ?? null;
          // V461 E — structured feasibility evidence, attached BEFORE the pass
          // terminalizes. The previous refusal path persisted only
          // `rendering_preflight` and left the geometry unreconstructable.
          (pass as any)._v461_crop_feasibility = (preclipResult as any).cropFeasibility ?? null;
          if (speakers.length >= 2) {
            // FA-4/P0 — presenter only: an infrastructure/dispatch problem is NOT a
            // timeout. `dispatch_uncertain` keeps its own diagnosis class.
            const speakerLabel = pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`;
            const detail = preclipResult.error ?? "preclip_unknown";
            const isDispatchIssue = preclipResult.errorClass === "dispatch_uncertain" ||
              preclipResult.errorClass === "dispatch_failed";
            const cause = isDispatchIssue
              ? tl({
                de: `Die Vorbereitung des Sprecher-Clips für „${speakerLabel}" konnte wegen eines Infrastrukturfehlers nicht gestartet bzw. bestätigt werden (${detail}).`,
                en: `Preparing the speaker clip for "${speakerLabel}" could not be started or confirmed due to an infrastructure error (${detail}).`,
                es: `La preparación del clip del hablante para "${speakerLabel}" no se pudo iniciar ni confirmar debido a un error de infraestructura (${detail}).`,
              })
              : tl({
                de: `Der Sprecher-Clip für „${speakerLabel}" wurde nicht rechtzeitig fertig (${detail}).`,
                en: `The speaker clip for "${speakerLabel}" was not finished in time (${detail}).`,
                es: `El clip del hablante para "${speakerLabel}" no se terminó a tiempo (${detail}).`,
              });
            const reason = `v187_preclip_required_no_fullplate_fallback: ${cause} ` +
              tl({
                de: `Kein Full-Plate-Fallback, damit Sync.so nicht erneut generation_input_face_selection_invalid auslöst. Credits wurden zurückerstattet.`,
                en: `No full-plate fallback, so Sync.so does not trigger generation_input_face_selection_invalid again. Credits have been refunded.`,
                es: `Sin respaldo de placa completa, para que Sync.so no vuelva a activar generation_input_face_selection_invalid. Los créditos han sido reembolsados.`,
              });
            console.error(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v187_preclip_required_no_fullplate_fallback speaker=${pass.speaker_name ?? "?"} err=${preclipResult.error ?? "preclip_unknown"} class=${preclipResult.errorClass ?? "unknown"} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] — refusing full-plate dispatch`,
            );
            await logSyncDispatch(supabase, {
              scene_id: sceneId,
              user_id: userId,
              engine: "sync-segments",
              sync_status: "PREFLIGHT_BLOCKED",
              error_class: "v187_preclip_required_no_fullplate_fallback",
              error_message: preclipResult.error ?? "preclip_unknown",
              meta: {
                compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
                pass_idx: currentPassIdx,
                speaker: pass.speaker_name ?? null,
                character_id: pass.character_id ?? null,
                preclip_error: preclipResult.error ?? null,
                preclip_error_class: preclipResult.errorClass ?? null,
                preclip_window_sec: [Number(unionStart.toFixed(3)), Number(unionEnd.toFixed(3))],
                speakers: speakers.length,
                full_plate_fallback_blocked: true,
                refunded_credits: Number(totalCost ?? 0),
              },
            });
            await failLipSync({
              supabase,
              sceneId,
              reason,
              userId,
              refundCredits: totalCost,
              syncApiKey,
            });
            return json(
              {
                error: "v187_preclip_required_no_fullplate_fallback",
                // FA-4/P0 — keep the diagnosis class distinct for support.
                preclip_error_class: preclipResult.errorClass ?? null,
                reason,
                refunded: totalCost,
              },
              422,
            );
          }
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render FAILED err=${preclipResult.error} class=${preclipResult.errorClass} — falling back to full-plate dispatch`,
          );
        }
      } catch (preclipErr) {
        (pass as any).preclip_error = (preclipErr as Error)?.message ?? String(preclipErr);
        if (speakers.length >= 2) {
          const preclipErrorMessage = (preclipErr as Error)?.message ?? String(preclipErr);
          const reason = `v187_preclip_required_no_fullplate_fallback: Preclip für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" ist fehlgeschlagen (${preclipErrorMessage}). Kein Full-Plate-Fallback, damit Sync.so nicht erneut generation_input_face_selection_invalid auslöst.`;
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v187_preclip_required_no_fullplate_fallback speaker=${pass.speaker_name ?? "?"} threw=${preclipErrorMessage} window=[${unionStart.toFixed(2)},${unionEnd.toFixed(2)}] — refusing full-plate dispatch`,
          );
          await logSyncDispatch(supabase, {
            scene_id: sceneId,
            user_id: userId,
            engine: "sync-segments",
            sync_status: "PREFLIGHT_BLOCKED",
            error_class: "v187_preclip_required_no_fullplate_fallback",
            error_message: preclipErrorMessage,
            meta: {
              compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
              pass_idx: currentPassIdx,
              speaker: pass.speaker_name ?? null,
              character_id: pass.character_id ?? null,
              preclip_error: preclipErrorMessage,
              preclip_error_class: "throw",
              preclip_window_sec: [Number(unionStart.toFixed(3)), Number(unionEnd.toFixed(3))],
              speakers: speakers.length,
              full_plate_fallback_blocked: true,
              refunded_credits: Number(totalCost ?? 0),
            },
          });
          await failLipSync({
            supabase,
            sceneId,
            reason,
            userId,
            refundCredits: totalCost,
            syncApiKey,
          });
          return json(
            {
              error: "v187_preclip_required_no_fullplate_fallback",
              reason,
              refunded: totalCost,
            },
            422,
          );
        }
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_render THREW: ${(preclipErr as Error)?.message} — falling back to full-plate dispatch`,
        );
      }
    } else if (usePassPreclip) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_preclip_reuse cached url=…${(passPreclipUrl ?? "").slice(-60)} crop=${JSON.stringify((pass as any).preclip_crop)} frames=${(pass as any).preclip_frame_count ?? "?"}`,
      );
    }

    // v153.5 — Hard-Fail wenn Plate-Bbox fehlt (Ersatz für v107/v126).
    // v153 setzt `_v153BboxPrimary` nur wenn `speakerPlateBboxes[idx]`
    // valide ist. Fehlt der Plate-Bbox UND wir haben tightAudio + coords,
    // muss die Szene neu gerendert werden — kein Silent-Fallback.
    const v153BboxRequired = false;
    if (v153BboxRequired && !(pass as any)._v153BboxPrimary) {
      const failReason = "v153_plate_bbox_required";
      console.error(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v153.5_plate_bbox_required_BLOCK speakers=${speakers.length} resolved=${plateIdentityMap?.resolvedCount ?? 0} — refusing dispatch`,
      );
      const existingDsLocal: any = (scene as any)?.dialog_shots ?? existing ?? {};
      const alreadyRefunded = !!existingDsLocal?.refunded;
      if (!alreadyRefunded) {
        const { data: wV } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(wV?.balance ?? 0) + Number(totalCost ?? 0),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      // ── V510-P0 — the sibling-preserving map was still a full write ──
      // `passes.map(…)` faithfully preserved every sibling AS THIS
      // INVOCATION LAST SAW IT, which is precisely the stale state that
      // erased two live job ids in generation 10. Preserving siblings
      // correctly is not the same as not writing them.
      const failedSpeakerName = String(
        (pass as any)?.speaker_name ?? `Sprecher ${currentPassIdx + 1}`,
      );
      const passSegs0 = Array.isArray(pass.segments) ? pass.segments : [];
      const turnStartSec =
        passSegs0.length > 0 ? Number(passSegs0[0].startTime) : null;
      const turnEndSec =
        passSegs0.length > 0 ? Number(passSegs0[0].endTime) : null;
      const turnLabel =
        turnStartSec != null && turnEndSec != null
          ? ` (Dialog-Turn ${turnStartSec.toFixed(1)}s–${turnEndSec.toFixed(1)}s)`
          : "";
      const friendlyClipError =
        tl({ de: `Lip-Sync abgebrochen: „${failedSpeakerName}"${turnLabel} konnte im Scene-Clip nicht eindeutig zugeordnet werden `, en: `Lip-sync aborted: "${failedSpeakerName}"${turnLabel} could not be uniquely assigned in the scene clip `, es: `Sincronización labial abortada: "${failedSpeakerName}"${turnLabel} no pudo asignarse de forma única en el clip de escena ` }) +
        tl({ de: `(${failReason}). Bitte Szene neu rendern — alle Sprecher müssen während ihres Turns frontal und unverdeckt im Bild sein. `, en: `(${failReason}). Please re-render scene — all speakers must be frontal and uncovered in the picture during their turn. `, es: `(${failReason}). Por favor, vuelve a renderizar la escena — todos los oradores deben estar frontales y descubiertos en la imagen durante su turno. ` }) +
        `Credits wurden zurückerstattet.`;
      await v510Terminalize({
        passIdx: currentPassIdx,
        passPatch: buildTerminalPassPatch({
          reason: failReason,
          errorClass: "v153_plate_bbox_required",
          diagnostics: { v510_terminalized_by: "v153_plate_bbox_preflight" },
        }),
        rootPatch: {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          cost_credits: Number(existingDsLocal?.cost_credits ?? totalCost ?? 0),
          refunded: !alreadyRefunded,
          error: `v153_plate_bbox_required_pass_${currentPassIdx + 1}`,
          v153_failed_speaker: {
            speaker: failedSpeakerName,
            character_id: (pass as any)?.character_id ?? null,
            pass_idx: currentPassIdx,
            turn_start_sec: turnStartSec,
            turn_end_sec: turnEndSec,
            resolved_count: plateIdentityMap?.resolvedCount ?? 0,
          },
          finished_at: new Date().toISOString(),
        },
        scenePatch: {
          lip_sync_status: "failed",
          twoshot_stage: "needs_clip_rerender",
          clip_status: "pending",
          clip_url: null,
          lip_sync_source_clip_url: null,
          clip_error: friendlyClipError,
        },
        reason: `v153_plate_bbox_required_pass_${currentPassIdx + 1}`,
      });

      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_status: "PREFLIGHT_BLOCKED",
        error_class: "v153_plate_bbox_required",
        error_message: failReason,
        meta: {
          pass_idx: currentPassIdx,
          speakers: speakers.length,
          plate_dims: plateDims ?? null,
          resolved_count: plateIdentityMap?.resolvedCount ?? 0,
          have_tight_audio: !!tightAudioInfo,
          have_coords:
            Array.isArray(pass.coords) &&
            Number.isFinite(Number(pass.coords?.[0])) &&
            Number.isFinite(Number(pass.coords?.[1])),
        },
      });
      return json(
        {
          error: "v153_plate_bbox_required",
          reason: failReason,
          refunded: alreadyRefunded ? 0 : Number(totalCost ?? 0),
        },
        422,
      );
    }

    // ── V502 — Coords ↔ Crop-Kohärenz ───────────────────────────────────
    // `pass.coords` ist ein Legacy-Plate-Punkt aus der Sprecher-Zuordnung; die
    // dispatchte Geometrie stammt seit V456/V457 aus `preclip_crop`. Beide
    // Räume driften auseinander (S01 Pass 0: coords 26 px ausserhalb des
    // eigenen Crops). Für `bbox-url-pro` ist das Telemetrie — für die
    // Coords-Varianten wandert der Punkt in den Provider-Payload und MUSS im
    // Raum des dispatchten Videos liegen. Wir leiten ihn deshalb aus demselben
    // Crop-Transform ab und projizieren ihn in den Clip-Raum.
    const v502Crop = usePassPreclip ? (pass as any).preclip_crop ?? null : null;
    const v502Contract = v502Crop
      ? resolveCoordsContract({
        crop: v502Crop,
        legacyCoords: Array.isArray(pass.coords)
          ? [Number(pass.coords[0]), Number(pass.coords[1])]
          : null,
        mouthOffsetXy: (pass as any).preclip_mouth_offset_xy ?? null,
      })
      : null;
    if (v502Contract) {
      (pass as any)._v502_coords_contract = {
        anchor_plate: v502Contract.anchorPlate,
        anchor_clip: v502Contract.anchorClip,
        legacy_coords: Array.isArray(pass.coords) ? pass.coords : null,
        legacy_inside_crop: v502Contract.legacyInsideCrop,
        legacy_outside_px: v502Contract.legacyOutsidePx,
        source: v502Contract.source,
        reason: v502Contract.reason,
        crop: v502Crop,
      };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v502_coords_contract ` +
          `source=${v502Contract.source} legacy_inside=${v502Contract.legacyInsideCrop} ` +
          `outside_px=${v502Contract.legacyOutsidePx} anchor_plate=${JSON.stringify(v502Contract.anchorPlate)} ` +
          `anchor_clip=${JSON.stringify(v502Contract.anchorClip)} crop=${JSON.stringify(v502Crop)}`,
      );
    }
    /** Coords im Raum des tatsächlich dispatchten Videos (Preclip → Clip-Raum). */
    const v502DispatchCoords: [number, number] | null = v502Contract
      ? v502Contract.anchorClip
      : clampSyncCoords(pass.coords);




    // v66 — sync_mode is TIGHT-GATED, not count-gated:
    //   • tightAudioInfo set (per-pass tight audio, N=1 OR N≥2) → `cut_off`.
    //     The WAV equals the speaker's voiced window (~1.5–2.5s); Sync.so
    //     returns exactly that length and the audio-mux Lambda overlays the
    //     short lipsync clip onto the pristine full-length plate at the
    //     turn's absolute timeline. Using `loop` here made Sync.so try to
    //     loop a 1.6s clip ~5× across a 9s plate → `provider_unknown_error`
    //     reproducibly on 4-speaker scenes (and intermittently on 2-speaker).
    //   • no tight (v56 official segments / force_v56 with master VO) → `loop`
    //     (v63). The master VO may outrun the plate; loop keeps the locked
    //     plate playing for the full audio duration so no freeze.
    const payloadSyncMode = v406FrozenInput
      ? v406FrozenInput.sync_mode
      : (tightAudioInfo ? "cut_off" : "loop");
    // v160 — sync-3 doc-strict from construction: only send public-schema
    // options Sync.so accepts. The sanitizer remains as a safety net, but we
    // no longer create `temperature` / `occlusion_detection_enabled` and rely
    // on stripping them later.
    const syncOptions: Record<string, unknown> = {
      sync_mode: payloadSyncMode,
    };

    if (v406SkipRebuild) {
      // FA-4 v406 — NOOP-Retry: KEIN bbox-/Box-/Framecount-Recompute. Die ASD
      // kommt ausschließlich aus dem frozen Snapshot (inline-Transport).
      if (v406FrozenInput) {
        const frozenWire = buildProviderWire(v406FrozenInput, { asdTransport: "inline" });
        syncOptions.active_speaker_detection = frozenWire.active_speaker_detection;
        (pass as any)._v406Wire = frozenWire;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_frozen_retry_wire boxes=${v406FrozenInput.bounding_boxes.length} frames=${v406FrozenInput.frame_count} fps=${v406FrozenInput.dispatch_fps} sync_mode=${v406FrozenInput.sync_mode}`,
        );
      }
    } else if (retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro") {


      // Sync.so canonical ActiveSpeaker DTO (per
      // https://sync.so/docs/developer-guides/speaker-selection):
      // frame_number = a frame WHERE THE SPEAKER IS VISIBLE. We anchor on
      // the turn-start frame so the mouth animation begins where the audio
      // begins. sync-3 accepts the same shape but tolerates static/occluded
      // faces that lipsync-2-pro rejects with "An unknown error occurred."
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        frame_number: referenceFrameNumber,
        // V502 — bei Preclip-Dispatch niemals den Plate-Punkt senden.
        coordinates: (v502DispatchCoords ?? clampSyncCoords(pass.coords))!,

      };
    } else if (retryVariant === "coords-pro-box" || retryVariant === "bbox-url-pro") {
      // v31 / v82 — Build the same plate-space face box from faceMap; for
      // `bbox-url-pro` we upload it as a per-frame JSON and hand Sync.so
      // a `bounding_boxes_url` (preferred for multi-speaker / long clips);
      // for the legacy `coords-pro-box` we inline `bounding_boxes`.
      const dims = plateDims ?? videoDims;
      let box: [number, number, number, number] | null = null;
      let bboxSource = "synthetic";

      // v153 — PRIMÄRE Quelle: plate-native box pro Sprecher
      // (aus resolvePlateFaceIdentities slot/identity fallback).
      // Garantiert distinkte Boxen pro Sprecher und behebt den
      // "Sprecher 1 spricht für Sprecher 1+2"-Bug, weil bisher der
      // faceMap-Match-Loop für mehrere Speaker auf derselben Box landen
      // konnte wenn characterId nicht gesetzt war.
      const platePassBox = speakerPlateBboxes?.[pass.speaker_idx] ?? null;
      const platePassMouth = speakerPlateMouths?.[pass.speaker_idx] ?? null;
      if (Array.isArray(platePassBox) && platePassBox.length === 4) {
        const [bx1, by1, bx2, by2] = platePassBox.map((n: any) => Number(n));
        if (Number.isFinite(bx1) && Number.isFinite(by1) && Number.isFinite(bx2) && Number.isFinite(by2)) {
          const w = Math.max(1, bx2 - bx1);
          const h = Math.max(1, by2 - by1);
          const aspectIn = h / w;
          // v160 — Sync.so `bounding_boxes(_url)` wants a real face detection
          // box. v159's mouth-centered mini box (0.14% area in production)
          // was below our own sanity floor and is not the API contract. Keep
          // the mouth landmark as the fail-closed identity anchor, but dispatch
          // the tight face/head bbox itself so sync-3 has enough facial context.
          const useMouth = Array.isArray(platePassMouth)
            && Number.isFinite(platePassMouth[0])
            && Number.isFinite(platePassMouth[1]);
          // v280 — Der v159-Hard-Refuse war zu streng: wenn die Plate-Bbox
          // durch v185_anchor_plate_bbox_gate bereits als vertrauenswürdig
          // markiert wurde, ist eine bbox-abgeleitete Mundposition (h*0.66)
          // eine sichere Näherung und morpht nicht — Sync.so bekommt eine
          // korrekt lokalisierte Face-Region. Ohne diesen Zweig kippte die
          // Szene stumm in v152 mit dem irreführenden
          // `bbox_geometry_insane:area_pct=0.00`.
          if (!useMouth && speakers.length >= 2) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v280_bbox_derived_mouth_anchor ` +
              `speaker=${pass.speaker_name} hydration=${plateHydrationSource} bbox=${JSON.stringify(platePassBox)} — ` +
              `no detector mouth landmark, using bbox lower-third anchor`,
            );
          }
          {
            const anchorX = useMouth ? platePassMouth![0] : Math.round((bx1 + bx2) / 2);
            const anchorY = useMouth ? platePassMouth![1] : Math.round(by1 + h * 0.66);
            // V445 — identical padding math as the preclip crop source
            // (`buildDispatchFaceBox`), so crop and dispatch box are one
            // measurement. Values unchanged: 8% / 6% / 4%.
            const padded = buildDispatchFaceBox(platePassBox, dims);
            const [x1, y1, x2, y2] = padded ?? [0, 0, 0, 0];
            if (padded) {
              box = [x1, y1, x2, y2];

              bboxSource = useMouth
                ? "plate-native:v160-face-mouth-verified"
                : "plate-native:v280-face-bbox-derived";
              const plateArea = Math.max(1, dims.width * dims.height);
              const boxArea = Math.max(0, (x2 - x1) * (y2 - y1));
              const areaPct = (boxArea / plateArea) * 100;
              console.log(
                `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v160_sync3_face_box ` +
                `speaker=${pass.speaker_name} mouth_used=${useMouth} hydration=${plateHydrationSource} ` +
                `aspect_in=${aspectIn.toFixed(2)} aspect_out=${((y2 - y1) / Math.max(1, x2 - x1)).toFixed(2)} ` +
                `area_pct=${areaPct.toFixed(2)} in=${JSON.stringify(platePassBox)} ` +
                `out=${JSON.stringify(box)} anchor=[${anchorX},${anchorY}] source=${bboxSource} ` +
                `speakers=${speakers.length}`,
              );
            }
          }

        }
      }


      // Sekundär: anchor faceMap (kann bei N=1 helfen oder wenn plate-native fehlt).
      if (!box && speakers.length < 2) {
        const fmFaces: any[] = Array.isArray((faceMap as any)?.faces)
          ? (faceMap as any).faces
          : [];
        const matchedFace =
          fmFaces.find((f) => f?.characterId && f.characterId === pass.character_id) ??
          fmFaces.find((f) => Number(f?.slotIndex) === Number(pass.speaker_idx)) ??
          null;
        const fmW = Number((faceMap as any)?.width) || dims.width;
        const fmH = Number((faceMap as any)?.height) || dims.height;
        if (
          matchedFace &&
          Array.isArray(matchedFace.bbox) &&
          matchedFace.bbox.length === 4 &&
          fmW > 0 && fmH > 0
        ) {
          const [bx1, by1, bx2, by2] = matchedFace.bbox.map((n: any) => Number(n));
          const sx = dims.width / fmW;
          const sy = dims.height / fmH;
          const padX = (bx2 - bx1) * 0.15;
          const padY = (by2 - by1) * 0.15;
          const x1 = Math.max(0, Math.round((bx1 - padX) * sx));
          const y1 = Math.max(0, Math.round((by1 - padY) * sy));
          const x2 = Math.min(dims.width, Math.round((bx2 + padX) * sx));
          const y2 = Math.min(dims.height, Math.round((by2 + padY) * sy));
          if (x2 > x1 + 4 && y2 > y1 + 4) {
            box = [x1, y1, x2, y2];
            bboxSource = `facemap:${matchedFace.matchSource ?? "unknown"}`;
          }
        }
      }

      // Letzter Notanker: synthetisch aus coords (nur N=1 erlaubt).
      // Für N>=2 würde das pro Sprecher auf identische Boxen mappen
      // wenn coords nicht plate-native sind — daher Hard-Fail unten.
      // v153.1 — Synthetic-Coords-Fallback ist GLOBAL deaktiviert (N=1..4).
      // Wenn weder plate-native noch facemap eine Box liefern, hat die
      // Pre-Flight (Z. ~1326) bereits hart gefailt + refunded. Hier kein
      // stiller Box-aus-coords-Mittelpunkt mehr — das hat in N=1 Szenen
      // dazu geführt, dass Sync.so im Zweifel die falsche Person animiert.
      if (!box && speakers.length < 2 && !(pass as any)._v153BboxPrimary) {
        const [cx, cy] = pass.coords ?? [Math.round(dims.width / 2), Math.round(dims.height / 2)];
        const boxW = Math.round(dims.width * 0.18);
        const boxH = Math.round(dims.height * 0.28);
        const x1 = Math.max(0, Math.round(cx - boxW / 2));
        const y1 = Math.max(0, Math.round(cy - boxH / 2));
        const x2 = Math.min(dims.width, Math.round(cx + boxW / 2));
        const y2 = Math.min(dims.height, Math.round(cy + boxH / 2));
        box = [x1, y1, x2, y2];
      }
      // v153.8 — Use ACTUAL plate frame count (probed from mp4 mvhd) instead
      // of the requested Hailuo duration. Sync.so rejects mismatched bbox
      // arrays with the opaque `generation_unknown_error`.
      // v161 — When a single-face preclip is in use, all bbox math runs in
      // CLIP space (not plate space). We probe the preclip's actual frame
      // count and shift voiced windows so they start at clip t=0.
      const v161PreclipCrop = usePassPreclip ? (pass as any).preclip_crop as
        | { x: number; y: number; size: number; outputSize: number }
        | undefined : undefined;
      const v161UsingPreclipForBbox = usePassPreclip && !!passPreclipUrl && !!v161PreclipCrop;
      // v204 — Preclip is the canonical multi-speaker path again. No hard-fail here.
      const probeUrlForBbox = v161UsingPreclipForBbox ? (passPreclipUrl as string) : passInputUrl;
      const v161PreclipStartSec = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_start_sec ?? 0)
        : 0;

      // v163 — Frame count + fps MUST match the dispatched video exactly.
      // For preclips: use the exact Remotion `durationInFrames` captured by
      // renderPassFacePreclip. Only legacy cached preclips fall back to
      // ceil(duration*fps); never round, because it produced 73/28 bbox frames
      // for 74/29-frame preclips and Sync.so failed with generation_unknown_error.
      const dispatchFps = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_fps ?? 30)
        : ASSUMED_FPS;
      const preclipPersistedFrameCount = v161UsingPreclipForBbox
        ? Math.round(Number((pass as any).preclip_frame_count ?? 0))
        : 0;
      const preclipPersistedDurSec = v161UsingPreclipForBbox
        ? Number((pass as any).preclip_duration_sec ?? 0)
        : 0;
      const __probedPlateDurSec = v161UsingPreclipForBbox && preclipPersistedDurSec > 0
        ? preclipPersistedDurSec
        : await getPlateDurationSecCached(probeUrlForBbox);
      const __probedFrames = __probedPlateDurSec
        ? Math.max(1, Math.ceil(__probedPlateDurSec * dispatchFps))
        : null;
      const frameCount = v161UsingPreclipForBbox && preclipPersistedFrameCount > 0
        ? preclipPersistedFrameCount
        : (__probedFrames ?? Math.max(1, Math.ceil(totalSec * dispatchFps)));
      const frameCountSource = v161UsingPreclipForBbox && preclipPersistedFrameCount > 0
        ? "preclip_frame_count"
        : (__probedFrames ? "ceil_probe_duration" : "ceil_total_duration");
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_bbox_framecount space=${v161UsingPreclipForBbox ? "clip" : "plate"} source=${frameCountSource} fps=${dispatchFps} preclip_frames=${preclipPersistedFrameCount || "?"} probe_dur=${__probedPlateDurSec ? __probedPlateDurSec.toFixed(3) : "?"} requested_total=${totalSec}s probed_frames=${__probedFrames ?? "?"} used=${frameCount}`,
      );
      if (v161UsingPreclipForBbox && frameCountSource === "ceil_total_duration") {
        (pass as any)._v152HardFail = {
          reason: "preclip_frame_count_unavailable",
          errorClass: "v163_preclip_frame_count_unavailable",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
            tl({ de: "die exakte Preclip-Framezahl fehlt, daher kann keine sichere bounding_boxes_url erzeugt werden. Credits wurden zurückerstattet.", en: "the exact preclip frame count is missing, so a secure bounding_boxes_url cannot be generated. Credits have been refunded.", es: "falta el recuento exacto de fotogramas del preclip, por lo que no se puede generar una bounding_boxes_url segura. Los créditos han sido reembolsados." }),
          meta: {
            v163_exact_framecount_required: true,
            preclip_duration_sec: preclipPersistedDurSec || null,
            preclip_fps: dispatchFps,
            preclip_url_present: !!passPreclipUrl,
          },
        };
      }

      // Voiced windows in the dispatched video's time base.
      const v124VoicedWindows: Array<[number, number]> = v161UsingPreclipForBbox
        ? speakerWindowsSecs.map(([s, e]) => [
            Math.max(0, s - v161PreclipStartSec),
            Math.max(0, e - v161PreclipStartSec),
          ] as [number, number])
        : speakerWindowsSecs.slice();

      // Box in the dispatched video's pixel space.
      let dispatchBox: [number, number, number, number] | null = box;
      // ── V522 — WHO OWNS THE PROVIDER GEOMETRY FOR THIS PASS ───────
      //
      // `dynamicAuthority`  the dynamic proof decided containment. The
      //                     per-frame boxes are what gets dispatched, so
      //                     they owe E.3 per frame.
      // `perFrameOnly`      additionally there is no static clip box at
      //                     all, because the union is unrenderable in a
      //                     moving crop. The V464 sequence is then the
      //                     ONLY geometry, and its absence is fatal.
      let v522DynamicAuthority = false;
      let v522PerFrameOnly = false;
      // Assignment-locked sibling centres in PLATE space, hoisted so the
      // per-frame gate tests exactly the identity map the static gate did.
      let v522OtherPlateCenters: Array<[number, number]> = [];
      // V510-P1 — the plate-space half of the V464 anchor pair. Defaults to
      // the static box and is replaced only when Contract E judged a
      // track-derived target, so the non-preclip and no-track paths keep
      // exactly the geometry they had.
      let v510p1AnchorPlateBox: [number, number, number, number] | null = box;
      if (v161UsingPreclipForBbox && box && v161PreclipCrop) {
        // FA-4 Contract E — deterministic crop containment gate. The final
        // target bbox must lie fully inside the crop, transform bounds-valid
        // and non-degenerate, and no OTHER finally assigned speaker center may
        // fall inside the transformed target box. No padding, no tolerance.
        const otherCenters: Array<[number, number]> = [];
        for (let si = 0; si < speakers.length; si++) {
          if (si === pass.speaker_idx) continue;
          const ob = speakerPlateBboxes?.[si];
          if (Array.isArray(ob) && ob.length === 4) {
            otherCenters.push([
              Math.round((ob[0] + ob[2]) / 2),
              Math.round((ob[1] + ob[3]) / 2),
            ]);
          }
        }
        // V522 — the SAME identity map, handed to the per-frame gate below.
        v522OtherPlateCenters = otherCenters;
        // ── V510-P1 — ONE GEOMETRY AUTHORITY ────────────────────────────
        //
        // The planner has proved containment against ITS target since
        // V461 D: with a measured turn that target is the track union
        // (`containSource === "turn_track"`), not the anchor. Contract E
        // then re-derived a target from the static assignment bbox and
        // tested the same crop against it — so both could be right about
        // different boxes.
        //
        // Generation 10, Matthew: planner [474,528,541,602] inside crop
        // [446,528,550,632]; static [465,522,517,588] overhangs the top by
        // 6 px. Generation 11, Sarah: planner [230,103,387,321] inside
        // [201,103,473,375]; static [227,99,368,293] overhangs by 4 px.
        // Both runs terminalized on preclip_identity_geometry_mismatch
        // while the rendered crop did contain the tracked face.
        //
        // Nothing is loosened. The gate keeps every check, every threshold
        // and zero tolerance; it just stops testing a box nobody rendered.
        // Without a track the authority IS the static box, byte for byte.
        const v510p1Authority = resolvePreclipContainmentAuthority({
          plannerContainBox: (pass as any).v457_contain_box ?? null,
          plannerContainSource: (pass as any).v457_contain_source ?? null,
          staticDispatchBox: box,
        });
        const v510p1Telemetry = buildGeometryAuthorityTelemetry(v510p1Authority);
        (pass as any).v510p1_geometry_authority = v510p1Telemetry;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v510p1_geometry_authority source=${v510p1Authority.source} ` +
            `target=${JSON.stringify(v510p1Authority.targetBox)} ` +
            `static=${JSON.stringify(v510p1Authority.staticDispatchBox)} ` +
            `match=${v510p1Authority.authorityMatch}`,
        );
        // IDENTITY STAYS STATIC. `otherCenters` above is built from
        // `speakerPlateBboxes` — the assignment-locked identity map — and is
        // untouched by this change. The track answers WHERE the assigned
        // face is, never WHO it is. E.3 therefore keeps testing
        // assignment-locked sibling centres, now against the region that is
        // actually dispatched rather than one that is not.
        // ══ V519 — CONTAINMENT REGIME ═════════════════════════════════
        //
        // Generation 16, Matthew: the union target [757,339,884,525] is
        // 127x186 and the applied crop was 128x128. Contract E was right
        // that the box does not fit — and wrong to ask. The renderer
        // followed a moving camera path, and the planner had already
        // proven with `cameraPathContainsAll` that every measured face box
        // is held by the window rendered at its OWN instant.
        //
        // The union is the correct target for a crop that never moves. For
        // one that does, it is a box nobody rendered.
        //
        // Nothing is loosened: dynamic mode is entered only on a proven
        // path with usable samples, every sample is paired with its own
        // window, and missing or unprovable evidence FAILS. Identity is
        // untouched — E.3 still tests the assignment-locked sibling
        // centres against the actually dispatched region below.
        const v519Path = (pass as any).preclip_camera_path ??
          (pass as any)._v450_frozen_camera_path ?? null;
        const v519Track = (pass as any).preclip_face_track ??
          (pass as any)._v450_frozen_face_track ?? null;
        const v519Regime = isDynamicContainmentRegime({
          cameraPathDynamic: (pass as any).preclip_camera_path_dynamic === true,
          keyframes: (v519Path as any)?.keyframes ?? null,
          trackSamples: v519Track,
        });
        const v519Dynamic = v519Regime
          ? evaluateDynamicPreclipContainment({
            cameraPathDynamic: true,
            keyframes: (v519Path as any)?.keyframes ?? null,
            trackSamples: v519Track,
            startSec: Number((pass as any).preclip_start_sec),
            containsAll: cameraPathContainsAll,
          })
          : null;
        // The static proof always runs: it is the only regime's authority
        // when there is no path, and its verdict stays visible either way.
        const v519Static = evaluatePreclipCropContainment({
          crop: v161PreclipCrop,
          targetBbox: v510p1Authority.targetBox,
          otherSpeakerCenters: otherCenters,
        });
        // A dynamic pass still owes E.3/E.4 on the geometry it dispatches;
        // only the E.1 union-vs-static-crop question is answered by the
        // path instead. So a static failure for any OTHER reason still
        // fails the pass.
        // ══ V521 — A DYNAMIC SUCCESS BUILDS ITS OWN COMPLETE RESULT ═══
        //
        // V519 merged a dynamic success as `{ ...v519Static, ok: true }`.
        // The static evaluator returns EARLY at E.1, and an early return
        // carries no `clipBox` — so that spread produced `ok: true` with
        // `clipBox: undefined`, and `containment.clipBox!` below is a
        // compile-time assertion, not a runtime value.
        //
        // Generation 18, Sarah pass 0: dynamic proof ok over 6/6 samples,
        // pre-clip rendered, track 6/6 valid — and the pass died on
        // `bbox_zero_voiced_frames` across 82 frames because the dispatch
        // box had silently become undefined.
        //
        // Worse: E.1's early return also skipped E.4 (transform validity)
        // and E.3 (sibling exclusion), and the override then declared
        // success — a dynamic pass could bypass the identity check.
        //
        // Now the dynamic path runs the SAME finalizer the static success
        // path runs. One E.3, one transform, one producer of `clipBox`.
        // ══ V522 — THE UNION IS NOT THE DISPATCHED GEOMETRY ══════════
        //
        // V521 made the dynamic path run the finalizer, which was right:
        // a success must carry E.3, E.4 and a real box. But it still asked
        // the finalizer to transform the TURN UNION through the static
        // crop — and in a moving crop the union is, by construction, a box
        // nobody renders. Generation 18, Sarah: union [118,324,302,451] is
        // 184 px wide against a 154 px crop. No single clip box exists,
        // and V521 correctly said so with `transform_out_of_bounds`.
        //
        // Correct answer, wrong question. The provider is not sent one box
        // in this mode — `bounding_boxes_url` carries a per-frame array,
        // and V464 already builds it from Track(t) through Window(t). The
        // union's job is planning: feasibility, camera path, movement
        // envelope. It has no dispatch role.
        //
        // So a UNION TRANSFORM failure no longer fails a proven dynamic
        // pass — it hands authority to the per-frame sequence, which then
        // owes E.4 (V464 bounds validation) and E.3 (per frame) before
        // anything is dispatched. Every other finalizer failure still
        // binds: `invalid_crop`, `invalid_target_bbox` and above all
        // `other_speaker_center_in_target` are not questions about
        // renderability, and identity is never traded away.
        const v519StaticNonContainment = !v519Static.ok &&
          v519Static.reason !== "target_not_contained_in_crop";
        const v522DynamicDecides = !!v519Dynamic?.ok && !v519StaticNonContainment;
        const v522Finalized = v522DynamicDecides
          ? finalizePreclipContainment({
            crop: v161PreclipCrop,
            targetBbox: v510p1Authority.targetBox,
            otherSpeakerCenters: otherCenters,
          })
          : null;
        const v522UnionUnrenderable = !!v522Finalized && !v522Finalized.ok &&
          (v522Finalized.reason === "transform_out_of_bounds" ||
            v522Finalized.reason === "transform_degenerate");
        const containment: CropContainmentResult = !v519Dynamic
          ? v519Static
          : v519StaticNonContainment
          // A static failure for any OTHER reason is still authoritative:
          // the dynamic path answers the union question, nothing else.
          ? v519Static
          : v519Dynamic.ok
          ? (v522UnionUnrenderable
            ? {
              ok: true,
              geometryAuthority: "dynamic_per_frame",
              detail: `union_unrenderable:${v522Finalized!.reason} ${v522Finalized!.detail ?? ""}`.trim(),
            }
            : v522Finalized!)
          : {
            ok: false as const,
            reason: "target_not_contained_in_crop" as const,
            detail: `dynamic:${v519Dynamic.reason ?? "unknown"} ${v519Dynamic.detail ?? ""}`.trim(),
          };
        v522DynamicAuthority = v522DynamicDecides && containment.ok;
        v522PerFrameOnly = v522DynamicAuthority &&
          containment.geometryAuthority === "dynamic_per_frame";
        const v521ClipBox = (containment as { clipBox?: [number, number, number, number] })
          .clipBox;
        (pass as any)._v519_containment = {
          regime: v519Regime ? "dynamic_camera_path" : "static",
          static_ok: v519Static.ok,
          static_reason: v519Static.reason ?? null,
          dynamic_ok: v519Dynamic?.ok ?? null,
          dynamic_reason: v519Dynamic?.reason ?? null,
          dynamic_checked: v519Dynamic?.checked ?? null,
          // V521 — the invariant that was silently false in generation 18.
          clip_box_present: Array.isArray(v521ClipBox),
          post_containment_validation: v519Dynamic?.ok === true ? "finalizer" : "static",
          // V522 — which geometry this verdict is about.
          geometry_authority: containment.geometryAuthority ?? "static_clip_box",
          union_transform_reason: v522Finalized && !v522Finalized.ok
            ? v522Finalized.reason ?? null
            : null,
          projection_discarded: (pass as any).v457_projection_discarded ?? null,
          final_crop_contains_target: (pass as any).v457_contains_target ?? null,
        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v519_containment regime=${v519Regime ? "dynamic" : "static"} ` +
            `static=${v519Static.ok ? "ok" : v519Static.reason} ` +
            `dynamic=${v519Dynamic ? (v519Dynamic.ok ? `ok:${v519Dynamic.checked}` : v519Dynamic.reason) : "n/a"}`,
        );
        if (!containment.ok) {
          (pass as any)._v152HardFail = {
            reason: "preclip_identity_geometry_mismatch",
            errorClass: "preclip_identity_geometry_mismatch",
            message:
              `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
              tl({
                de: "der Gesichtsausschnitt lässt sich nicht eindeutig diesem Sprecher zuordnen. Credits wurden zurückerstattet.",
                en: "the face crop cannot be assigned unambiguously to this speaker. Credits have been refunded.",
                es: "el recorte facial no se puede asignar de forma inequívoca a este hablante. Los créditos han sido reembolsados.",
              }),
            meta: {
              fa4_containment_reason: containment.reason,
              fa4_containment_detail: containment.detail ?? null,
              plate_box: box,
              // V510-P1 — which box was actually judged, so a future
              // mismatch names its referent instead of leaving it to be
              // re-derived from the surrounding fields.
              ...v510p1Telemetry,
              preclip_crop: v161PreclipCrop,
              other_speaker_centers: otherCenters,
              // V445 — provenance so a future mismatch is diagnosable without
              // re-deriving geometry: which measurement produced the crop and
              // which produced the dispatch bbox.
              v445_crop_measure_src: (pass as any).preclip_crop_measure_src ?? null,
              v445_bbox_measure_src: (pass as any).preclip_bbox_measure_src ?? v445MeasureSrc,
              v445_crop_from_bbox: (pass as any).preclip_from_bbox ?? null,
              v445_final_bbox_sig: v445FinalBoxSig,
              // V457 — containment projection evidence.
              v457_contain_box: (pass as any).v457_contain_box ?? null,
              v457_contains_target: (pass as any).v457_contains_target ?? null,
              v457_contain_reason: (pass as any).v457_contain_reason ?? null,
              v457_crop_shift_px: (pass as any).v457_crop_shift_px ?? null,
              v457_size_grown: (pass as any).v457_size_grown ?? null,
              v457_size_grown_px: (pass as any).v457_size_grown_px ?? null,
            },

          };
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} fa4_preclip_containment_fail_closed ` +
            `reason=${containment.reason} detail=${containment.detail ?? "-"} plate_box=${JSON.stringify(box)} crop=${JSON.stringify(v161PreclipCrop)}`,
          );
        } else if (v522PerFrameOnly) {
          // ══ V522 — THE PER-FRAME SEQUENCE IS THE GEOMETRY ══════════
          //
          // No static clip box exists and none is owed. `dispatchBox` is
          // cleared EXPLICITLY: it still holds the plate-space box it was
          // initialised with, and letting a plate box travel into a
          // clip-space payload is the original sin this whole series has
          // been closing. The V464 sequence is built below and must pass
          // E.4 and per-frame E.3 before anything is dispatched.
          dispatchBox = null;
          v510p1AnchorPlateBox = v510p1Authority.targetBox;
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
              `v522_per_frame_authority union=${JSON.stringify(v510p1Authority.targetBox)} ` +
              `crop=${JSON.stringify(v161PreclipCrop)} ` +
              `union_reason=${v522Finalized?.reason ?? "-"} dynamic_checked=${v519Dynamic?.checked ?? 0}`,
          );
        } else if (!Array.isArray(v521ClipBox)) {
          // ══ V521 — `ok` MUST imply a clip box ══════════════════════
          //
          // A safety net, not a path: the corrected merge above can no
          // longer produce this. If it ever appears again, the run stops
          // HERE with a precise cause instead of drifting into an empty
          // canonical box array and a diagnostic about voiced frames.
          //
          // V522 narrows WHICH geometry `ok` implies, not whether it is
          // owed: a static success still owes a clip box, and a dynamic
          // one is handled by the branch above rather than exempted here.
          (pass as any)._v152HardFail = {
            reason: "containment_ok_without_clip_box",
            errorClass: "preclip_identity_geometry_mismatch",
            message:
              `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
              tl({
                de: "die Bildausschnitt-Geometrie konnte nicht vollständig bestimmt werden. Credits wurden zurückerstattet.",
                en: "the crop geometry could not be fully determined. Credits have been refunded.",
                es: "no se pudo determinar por completo la geometría del recorte. Los créditos han sido reembolsados.",
              }),
            meta: {
              fa4_containment_reason: "containment_ok_without_clip_box",
              v521_regime: v519Regime ? "dynamic_camera_path" : "static",
              v521_static_reason: v519Static.reason ?? null,
              v521_dynamic_ok: v519Dynamic?.ok ?? null,
              plate_box: box,
            },
          };
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
              `v521_containment_ok_without_clip_box regime=${v519Regime ? "dynamic" : "static"} ` +
              `static=${v519Static.reason ?? "ok"} dynamic=${v519Dynamic?.ok ?? "n/a"}`,
          );
        } else {
          // Contract E.5 — the wire box IS the transformed target bbox.
          dispatchBox = v521ClipBox;
          // …and the plate-space original of that same box is the anchor.
          v510p1AnchorPlateBox = v510p1Authority.targetBox;
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v163_bbox_clip_space plate_box=${JSON.stringify(box)} crop=${JSON.stringify(v161PreclipCrop)} → clip_box=${JSON.stringify(dispatchBox)} windows_clip=${JSON.stringify(v124VoicedWindows)} fa4_containment=ok`,
          );
        }
      }


      // ── FA-4 v406 — canonical bounding_boxes: GENAU EINMAL gebaut ──────
      // Die Box-Sequenz ist ab hier eingefroren. Der Fresh-Upload schreibt
      // exakt DIESES Array als JSON; der NOOP-Retry sendet exakt DIESES Array
      // inline. Kein zweiter Build, keine zweite Quelle.
      //
      // V464-B — die Sequenz entsteht pro Frame aus Face-Track(t) und
      // Crop-Transform(t) desselben Frames. Die konstante Anchor-Box ist nur
      // noch der Fallback für "statischer Kopf + statischer Crop" (und für
      // Nicht-Preclip-Dispatch), niemals mehr die Quelle bei Bewegung.
      const v464FaceTrack = (pass as any).preclip_face_track ??
        (pass as any)._v450_frozen_face_track ?? null;
      const v464CameraPath = (pass as any).preclip_camera_path ??
        (pass as any)._v450_frozen_camera_path ?? null;
      // V522 — a static pass is eligible exactly as before. A dynamic one
      // is eligible on its PROVEN evidence instead of on a box the regime
      // cannot produce: `v522PerFrameOnly` is set only after
      // `isDynamicContainmentRegime` (frozen path + usable samples) and
      // `evaluateDynamicPreclipContainment` (every sample held by its own
      // window, checked > 0) have both passed. Motion alone is never
      // eligibility, and the sequence V464 builds still has to survive
      // validation below.
      const v464Eligible = v161UsingPreclipForBbox && !!v161PreclipCrop && !!box &&
        (!!dispatchBox || v522PerFrameOnly);
      const v464Built = v464Eligible
        ? buildPerFrameAsdBoxes({
            frameCount,
            fps: dispatchFps ?? ASSUMED_FPS,
            staticCrop: v161PreclipCrop!,
            cameraPath: v464CameraPath,
            faceTrack: v464FaceTrack,
            preclipStartSec: v161PreclipStartSec,
            // ── V510-P1 — the anchor pair must describe ONE face ─────────
            //
            // `anchorDispatchBox` is Contract E's transform of the
            // authority box. If `anchorPlateBox` stayed on the static bbox,
            // `marginsOf` would again compare two different faces — the
            // exact referent split V509 was written to close, just smaller.
            //
            // Anchoring both on the authority makes the pair one object:
            // the plate-space box and its own projection, so every raw
            // margin is 0 and the per-frame box follows Track(t) with no
            // anchor-derived distortion. V509's clamp stays a no-op because
            // there is nothing negative to clamp. Without a track the
            // authority IS `box`, so this line is literally unchanged.
            anchorPlateBox: v510p1AnchorPlateBox as [number, number, number, number],
            // V522 — absent in the per-frame regime: zero margins, and no
            // constant box to fall back to. See `buildPerFrameAsdBoxes`.
            anchorDispatchBox: dispatchBox,
            // V522 — the identity map, projected per frame so E.3 can be
            // asked about the region actually dispatched at each instant.
            otherSpeakerPlateCenters: v522OtherPlateCenters,
            voicedWindowsSec: v124VoicedWindows,
          })
        : null;
      const v464Verdict = v464Built
        ? validateAsdRegistration({
            built: v464Built,
            frameCount,
            outputSize: v161PreclipCrop!.outputSize,
          })
        : null;
      if (v464Built && v464Verdict) {
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v464_asd_registration ` +
            `registration=${v464Built.registration} crop_src=${v464Built.cropSource} track_src=${v464Built.trackSource} ` +
            `varying=${v464Built.varying} track_travel=${v464Built.trackTravelPx}px box_travel=${v464Built.boxTravelPx}px ` +
            `mouth_in_box=${v464Verdict.containedFrames}/${v464Verdict.checkedFrames} rate=${v464Verdict.containmentRate} ` +
            `worst_margin=${v464Verdict.worstMarginPx}px ok=${v464Verdict.ok} reason=${v464Verdict.reason}`,
        );
        (pass as any)._v464AsdRegistration = {
          registration: v464Built.registration,
          crop_source: v464Built.cropSource,
          track_source: v464Built.trackSource,
          varying: v464Built.varying,
          track_travel_px: v464Built.trackTravelPx,
          box_travel_px: v464Built.boxTravelPx,
          // V509 — framing-margin provenance. Diagnostic only: nothing
          // branches on it, and no new refusal condition exists.
          margin_policy: v464Built.marginPolicy,
          raw_anchor_margins: v464Built.rawAnchorMargins.map((m) => Number(m.toFixed(4))),
          applied_margins: v464Built.appliedMargins.map((m) => Number(m.toFixed(4))),
          negative_margins_clamped: v464Built.negativeMarginsClamped,
          anchor_face_projected: v464Built.anchorFaceProjected,
          verdict: v464Verdict,
        };
      }
      // Invariante 4 — semantisch falsche Registrierung blockiert den Dispatch.
      if (v464Built && v464Verdict && !v464Verdict.ok) {
        (pass as any)._v152HardFail = {
          reason: `asd_contract_invalid:${v464Verdict.reason}`,
          errorClass: "v464_asd_contract_invalid",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
            tl({
              de: "die Sprecher-Box konnte für diese Bewegung nicht framegenau registriert werden. Credits wurden zurückerstattet.",
              en: "the speaker box could not be registered frame-accurately for this movement. Credits have been refunded.",
              es: "no se pudo registrar la caja del hablante con precisión de fotograma para este movimiento. Los créditos han sido reembolsados.",
            }),
          meta: {
            v464_verdict: v464Verdict,
            v464_registration: v464Built.registration,
            v464_crop_source: v464Built.cropSource,
            v464_track_source: v464Built.trackSource,
            v464_track_travel_px: v464Built.trackTravelPx,
            v464_box_travel_px: v464Built.boxTravelPx,
            preclip_crop: v161PreclipCrop,
            plate_box: box,
          },
        };
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v464_ASD_CONTRACT_INVALID reason=${v464Verdict.reason} rate=${v464Verdict.containmentRate} — refund + abort`,
        );
      }
      // ══ V522 — CONTRACT E.3, ON THE REGION ACTUALLY DISPATCHED ═══════
      //
      // The static gate asks the identity question once, about one box.
      // A dynamic pass sends a different box every frame, so the union it
      // was asked about is not what any frame showed — the same referent
      // split, one level down. The verdict is therefore computed from the
      // sibling centres projected through EACH frame's own crop.
      //
      // It is computed for every V464 build (telemetry, both regimes) and
      // ENFORCED where the dynamic proof decided containment. On the static
      // path the union gate is still the authority and nothing changes.
      const v522SiblingVerdict = v464Built
        ? evaluatePerFrameSiblingExclusion(v464Built)
        : null;
      if (v522SiblingVerdict) {
        (pass as any)._v522PerFrameIdentity = {
          enforced: v522DynamicAuthority,
          geometry_authority: v522PerFrameOnly ? "dynamic_per_frame" : "static_clip_box",
          ...v522SiblingVerdict,
        };
      }
      if (
        v522DynamicAuthority && v522SiblingVerdict && !v522SiblingVerdict.ok &&
        !(pass as any)._v152HardFail
      ) {
        (pass as any)._v152HardFail = {
          reason: "dynamic_sibling_center_in_frame_box",
          errorClass: "preclip_identity_geometry_mismatch",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" wurde vor Sync.so abgebrochen: ` +
            tl({
              de: "der Gesichtsausschnitt lässt sich nicht eindeutig diesem Sprecher zuordnen. Credits wurden zurückerstattet.",
              en: "the face crop cannot be assigned unambiguously to this speaker. Credits have been refunded.",
              es: "el recorte facial no se puede asignar de forma inequívoca a este hablante. Los créditos han sido reembolsados.",
            }),
          meta: {
            fa4_containment_reason: "other_speaker_center_in_frame_box",
            v522_scope: "per_frame",
            v522_failed_frame: v522SiblingVerdict.failedFrame,
            v522_failed_center: v522SiblingVerdict.failedCenter,
            v522_failed_box: v522SiblingVerdict.failedBox,
            v522_checked_frames: v522SiblingVerdict.checkedFrames,
            preclip_crop: v161PreclipCrop,
            other_speaker_centers: v522OtherPlateCenters,
            plate_box: box,
          },
        };
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v522_PER_FRAME_IDENTITY_FAIL frame=${v522SiblingVerdict.failedFrame} ` +
            `center=${JSON.stringify(v522SiblingVerdict.failedCenter)} ` +
            `box=${JSON.stringify(v522SiblingVerdict.failedBox)} — refund + abort`,
        );
      }
      const v406CanonicalBoxes: ([number, number, number, number] | null)[] = v464Built
        ? v464Built.boxes as ([number, number, number, number] | null)[]
        : (dispatchBox
          ? (v124VoicedWindows.length > 0
              ? buildPerFrameBoxes({
                  box: dispatchBox,
                  frameCount,
                  fps: dispatchFps ?? ASSUMED_FPS,
                  voicedWindowsSec: v124VoicedWindows,
                })
              : new Array(frameCount).fill(dispatchBox))
          : []);
      const nonNullFrames = v406CanonicalBoxes.reduce((a, v) => a + (v ? 1 : 0), 0);

      // Der Upload passiert NACH der Snapshot-Persistenz (Contract-Reihenfolge
      // 8→9→10). Hier wird nur der gewünschte Transport festgehalten.
      // V522 — a proven per-frame sequence authorizes the same transport a
      // static box does. The wire schema is untouched: `bounding_boxes_url`
      // has always carried a per-frame array, and this is the first path
      // that fills it without also holding a box for the whole pass.
      const v406WantsUrlTransport = retryVariant === "bbox-url-pro" &&
        (!!dispatchBox || (v522PerFrameOnly && !!v464Built));

      // v147 — Pre-Dispatch Validation: bbox muss mind. 1 voiced frame
      // enthalten.
      const v147BboxValid = v406WantsUrlTransport && nonNullFrames >= 1;
      // v152 — Bbox-Geometrie Sanity-Gate auf dem DISPATCHED video. Im
      // Preclip-Modus ist die Box-Fläche praktisch das ganze Bild (≈ 60-95 %),
      // also wird der upper-bound für Preclip auf 0.98 angehoben.
      const dispatchDimsArea = v161UsingPreclipForBbox && v161PreclipCrop
        ? Math.max(1, v161PreclipCrop.outputSize * v161PreclipCrop.outputSize)
        : Math.max(1, (plateDims?.width ?? 0) * (plateDims?.height ?? 0));
      // V522 — without a static box the sanity question is asked of what is
      // actually sent: the mean area of the dispatched per-frame boxes,
      // against the SAME bounds (0.002 … 0.98). No new threshold, no new
      // face-size rule — only a source that exists in this regime.
      const v522DispatchedAreas = dispatchBox
        ? []
        : v406CanonicalBoxes
          .filter((b): b is [number, number, number, number] => Array.isArray(b))
          .map((b) => Math.max(0, (b[2] - b[0]) * (b[3] - b[1])));
      const boxArea = dispatchBox
        ? Math.max(0, (dispatchBox[2] - dispatchBox[0]) * (dispatchBox[3] - dispatchBox[1]))
        : (v522DispatchedAreas.length > 0
          ? v522DispatchedAreas.reduce((a, v) => a + v, 0) / v522DispatchedAreas.length
          : 0);
      const boxAreaPct = boxArea / dispatchDimsArea;
      const v152UpperBound = v161UsingPreclipForBbox ? 0.98 : 0.45;
      const v152BboxSane = boxAreaPct >= 0.002 && boxAreaPct <= v152UpperBound;
      (pass as any)._v152BboxAreaPct = Number(boxAreaPct.toFixed(4));

      if ((v147BboxValid || (retryVariant === "coords-pro-box" && nonNullFrames >= 1)) && v152BboxSane) {
        // Provisorische ASD für die nachgelagerten Shape-Gates. Der echte Wire
        // wird ausschließlich von `buildProviderWire(snapshot, …)` erzeugt.
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes: v406CanonicalBoxes,
        };
        (pass as any)._v406FreshWireInput = {
          bbox: dispatchBox,
          bounding_boxes: v406CanonicalBoxes,
          frame_count: frameCount,
          dispatch_fps: dispatchFps ?? ASSUMED_FPS,
          voiced_windows: v124VoicedWindows,
          wants_url_transport: v406WantsUrlTransport,
          // V464-B — Registrierungs-Provenienz der Box-Sequenz.
          v464_registration: v464Built?.registration ?? "legacy_constant",
          v464_crop_source: v464Built?.cropSource ?? null,
          v464_track_source: v464Built?.trackSource ?? null,
          v464_varying: v464Built?.varying ?? false,
          v464_verdict: v464Verdict ?? null,

        };
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_canonical_boxes_frozen speaker=${pass.speaker_name} space=${v161UsingPreclipForBbox ? "clip" : "plate"} box=${JSON.stringify(dispatchBox)} source=${bboxSource} frames=${frameCount} voiced_frames=${nonNullFrames} area_pct=${(boxAreaPct * 100).toFixed(2)} transport=${v406WantsUrlTransport ? "url" : "inline"} windows=${JSON.stringify(v124VoicedWindows)}`,
        );
      } else {

        // v152 — Hard-Fail nur noch für echte Datenprobleme (zero voiced frames
        // oder geometrisch unsinnige Boxen). Upload-Fehler werden oben durch
        // v279 Inline-Fallback abgefangen.
        // V521 — a MISSING dispatch box is not a statement about voiced
        // frames. Generation 18 reported `bbox_zero_voiced_frames` over 82
        // frames for a speaker whose face track was 6/6 valid, because an
        // absent box makes `nonNullFrames` 0 and this ordering let the
        // consequence mask the cause. The box is now asked about first.
        // V522 — the missing-geometry diagnostic is regime-specific. A
        // static pass owes a dispatch box; a dynamic one owes a per-frame
        // sequence. Neither absence is a statement about voiced frames,
        // which is what generation 18 was told.
        const v152FailReason = (!dispatchBox && !v522PerFrameOnly)
          ? "dispatch_box_missing"
          : (!dispatchBox && !v464Built)
            ? "dynamic_bbox_sequence_missing"
          : nonNullFrames < 1
            ? "bbox_zero_voiced_frames"
            : !v152BboxSane
              ? `bbox_geometry_insane:area_pct=${(boxAreaPct * 100).toFixed(2)}`
              : "bbox_transport_unavailable";

        (pass as any)._v152HardFail = {
          reason: v152FailReason,
          errorClass: "v152_bbox_hard_fail",
          message:
            `Lip-Sync für „${pass.speaker_name ?? `Sprecher ${currentPassIdx + 1}`}" konnte nicht vorbereitet werden ` +
            tl({ de: `(${v152FailReason}). Bitte Szene neu rendern — Sprecher muss frontal und unverdeckt im Bild sein. `, en: `(${v152FailReason}). Please re-render scene — speaker must be frontal and uncovered in the picture. `, es: `(${v152FailReason}). Por favor, vuelve a renderizar la escena — el orador debe estar frontal y descubierto en la imagen. ` }) +
            `Credits wurden zurückerstattet.`,
          meta: {
            v152_unified_path: true,
            url_transport_requested: v406WantsUrlTransport,
            non_null_frames: nonNullFrames,
            frame_count: frameCount,
            box,
            bbox_source: bboxSource,
            bbox_area_pct: Number(boxAreaPct.toFixed(4)),
            plate_dims: plateDims ?? null,
          },
        };
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v152_BBOX_HARD_FAIL reason=${v152FailReason} url_transport=${v406WantsUrlTransport} non_null=${nonNullFrames} area_pct=${(boxAreaPct * 100).toFixed(2)} — refund + abort`,
        );
        syncOptions.active_speaker_detection = {
          auto_detect: false,
          bounding_boxes_url: "deferred-v152-hard-fail",
        };
      }





    } else {
      (pass as any)._v153LegacyBranchHardFail = {
        reason: "v153_unexpected_legacy_branch",
        errorClass: "v153_auto_detect_blocked",
        message:
          "v153.2 blocked a legacy auto_detect dispatch before provider call. " +
          "Every dialog pass must use bbox-url-pro with a plate-native speaker box.",
        meta: {
          retry_variant: retryVariant,
          plate_hydration_source: plateHydrationSource,
          speaker_plate_boxes: speakerPlateBboxes,
          plate_dims: plateDims,
          is_advance: isAdvance,
          is_retry: isRetry,
        },
      };
      syncOptions.active_speaker_detection = {
        auto_detect: false,
        frame_number: referenceFrameNumber,
        coordinates: v502DispatchCoords ?? clampSyncCoords(pass.coords) ?? [Math.round(videoDims.width / 2), Math.round(videoDims.height / 2)],
      };
    }

    // v431 G3.1 — Ledger-Zeile VOR dem Provider-Call. `plate_generation` wird
    // aus dem Run-Snapshot dieses Dispatch eingefroren; die Job-ID reist als
    // `pipeline_job_id` in der Webhook-URL mit und ist ab G3.2 die primäre
    // Callback-Identität. Fail-open: ohne Ledger-Zeile läuft der Legacy-Pfad
    // unverändert weiter (Observe-Phase).
    // G3.1b-Endvertrag: Ohne Retry-Kontext ist das eine Initial-Akquise
    // (Attempt 1). Ein echter Re-Dispatch (Sync.so-Webhook, Watchdog, Poller)
    // trägt `retry_of_pipeline_job_id` + `retry_reason` und läuft ausschließlich
    // über den atomaren Replace-Vertrag.
    // v431 G3.2.2 §5a — Ein NOOP-Escalate-Redispatch bringt den bereits in der
    // Apply-Transaktion erzeugten Replacement-Attempt mit. Dieser Pfad darf
    // keinen weiteren Attempt erzeugen, sondern adoptiert nur die Zeile.
    const v431PreAcquiredJobId = typeof (body as any)?.pipeline_job_id === "string" &&
      (body as any).pipeline_job_id.trim().length > 0
      ? String((body as any).pipeline_job_id).trim()
      : null;
    // FA-4/P0 — Segmentidentität ist Pflicht. Ohne sie deduplizieren alle
    // Turns eines Runs auf EINE Ledger-Zeile (`syncso_fanout_1_of_N`).
    // Fail-closed VOR dem Provider-Call.
    const v431SegmentId = typeof (pass as any)?.segment_id === "string" &&
      String((pass as any).segment_id).trim().length > 0
      ? String((pass as any).segment_id).trim()
      : null;
    if (!v431SegmentId) {
      console.error("[compose-dialog-segments] FA4_P0_PREFLIGHT_BLOCKED missing_segment_id", JSON.stringify({
        scene_id: sceneId,
        pass_idx: currentPassIdx,
        speaker_idx: (pass as any)?.speaker_idx ?? null,
      }));
    }
    const v431LedgerParams = {
      sceneId,
      runId: (passRunStamp.run_id as string | null) ?? null,
      stage: "sync_segment" as const,
      plateGeneration: Number(passRunStamp.plate_generation ?? 0),
      provider: "sync.so",
      segmentId: v431SegmentId,
      metadata: {
        dispatcher: "compose-dialog-segments",
        pass_idx: currentPassIdx,
        total_passes: passes.length,
        diagnostic_id: diagnosticId,
        retry_variant: retryVariant,
        segment_id: v431SegmentId,
      },
    };
    // Ohne Segmentidentität wird KEINE Ledger-Zeile akquiriert (sonst
    // kollabieren alle Turns auf eine Zeile). Der Abbruch folgt unten,
    // sobald `failBeforeProviderDispatch` definiert ist — vor jedem
    // Provider-Call.
    const v431SyncDecision = !v431SegmentId
      ? ({ outcome: "unavailable", reason: "fa4_p0_missing_segment_id" } as const)
      : v431PreAcquiredJobId
      ? await adoptPreAcquiredLedgerJob(supabase, v431PreAcquiredJobId, {
          sceneId,
          stage: "sync_segment",
          runId: v431LedgerParams.runId,
          plateGeneration: v431LedgerParams.plateGeneration,
          segmentId: v431SegmentId,
        })
      : await resolveLedgerDispatch(supabase, v431LedgerParams, readRetryContext(body));



    // G3.1b — Race-Verlierer dispatcht nicht. Die fremde Zeile wird NICHT
    // gesettelt (sie gehört dem Gewinner) und nicht abgelöst.
    if (v431SyncDecision.outcome === "skip") {
      console.warn("[compose-dialog-segments] ledger dispatch skipped", JSON.stringify({
        scene_id: sceneId,
        pass_idx: currentPassIdx,
        reason: v431SyncDecision.reason,
        pipeline_job_id: v431SyncDecision.job?.id ?? null,
      }));
      return json({
        ok: true,
        skipped: v431SyncDecision.reason,
        scene_id: sceneId,
        pipeline_job_id: v431SyncDecision.job?.id ?? null,
      });
    }
    const v431SyncLedgerJob = v431SyncDecision.outcome === "dispatch"
      ? v431SyncDecision.job
      : null;

    const diagnosticWebhookUrl =
      `${webhookUrl}&diagnostic_id=${encodeURIComponent(diagnosticId)}` +
      (v431SyncLedgerJob ? `&pipeline_job_id=${encodeURIComponent(v431SyncLedgerJob.id)}` : "");

    // v61 — Multi-speaker default flipped to sync-3 (Sync.so's recommended
    // model for static / locked-camera / occluded plates per
    // https://sync.so/docs/models/lipsync "Still Frame Limitation").
    // The chained per-speaker pipeline feeds Sync.so a LOCKED Hailuo plate
    // where the mouth never moves until lip-sync paints it — exactly the
    // class of input lipsync-2-pro silently rejects with `unknown error`.
    // sync-3 has built-in obstruction detection and can open closed lips.
    //
    // For single-speaker (N=1) we keep lipsync-2-pro first: those plates
    // typically already carry natural speaking motion (HeyGen / avatar /
    // user upload) and lipsync-2-pro has the higher fidelity ceiling.
    //
    // `coords-pro-lp2pro` (v61) is the new "force lipsync-2-pro on the
    // proven coords-pro shape" retry variant — final fallback in the
    // multi-speaker ladder before refunding.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.10)
    // v62: sync-3 is now the universal default for ALL speaker counts (N>=1).
    // Rationale: even single-speaker plates from Hailuo/Composer are locked-cam
    // stills where lipsync-2-pro's "Still Frame Limitation" silently fails.
    // sync-3 handles both static and motion plates natively. lipsync-2-pro
    // remains reachable only via the explicit `coords-pro-lp2pro` fallback.
    // v129.29 — SYNC-3-ONLY policy (user-directive 2026-06-19).
    // All dialog-shot passes dispatch on sync-3, regardless of retry
    // variant. lipsync-2 / lipsync-2-pro fallbacks are disabled for this
    // pipeline. Retry differentiation happens via ASD shape
    // (auto_detect → bbox-url → expanded-crop-auto), not via model swap.
    const payloadModel = SYNC3_MODEL;

    const failBeforeProviderDispatch = async (
      reason: string,
      errorClass: string,
      message: string,
      status = 422,
      meta: Record<string, unknown> = {},
    ) => {
      const costCredits = Number(prevState?.cost_credits ?? totalCost);
      const alreadyRefunded = !!(prevState as any)?.refunded;
      // V461 Stufe 0 — Refund IMMER in der Kasse, die belastet wurde: dem
      // Euro-Wallet (`ai_video_wallets.balance_euros`) via
      // `v459_refund_lipsync_euros`. Der Credit-Ledger (`wallets.balance`) ist
      // ausdrücklich NICHT mehr der Refund-Pfad — ein Gate-Block ist finanziell
      // identisch zu jedem anderen Lip-Sync-Fehlschlag (failLipSync). Die RPC
      // findet die Quell-Belastung über run_id → scene_id und ist idempotent
      // (refund_key = lipsync_refund:<run_id>:<source_transaction_id>).
      const refundRunId = String((scene as any)?.active_run_id ?? "") || null;
      let refundInfo: Record<string, unknown> | null = null;
      let didRefund = false;
      if (!alreadyRefunded) {
        try {
          const { data: refundRes, error: refundErr } = await supabase.rpc(
            "v459_refund_lipsync_euros",
            {
              p_user_id: userId,
              p_scene_id: sceneId,
              p_run_id: refundRunId,
              p_source_transaction_id: null,
              p_reason: reason,
            },
          );
          if (refundErr) {
            console.warn(
              `[compose-dialog-segments] v459 euro refund rpc error: ${refundErr.message ?? refundErr}`,
            );
          } else {
            refundInfo = (refundRes ?? null) as Record<string, unknown> | null;
            didRefund = (refundInfo as any)?.refunded === true;
            console.log(
              `[compose-dialog-segments] v459 euro_refund scene=${sceneId} run=${refundRunId ?? "-"} ` +
                `reason=${reason} refunded=${didRefund} detail=${JSON.stringify(refundInfo ?? {})}`,
            );
          }
        } catch (e) {
          console.warn(
            `[compose-dialog-segments] v459 euro refund crash: ${(e as Error).message}`,
          );
        }
      }
      const refundSettled = alreadyRefunded || didRefund ||
        (refundInfo as any)?.reason === "already_refunded";

      pass.status = "failed";
      pass.error = reason;
      (pass as any).last_error = reason;
      (pass as any).last_error_class = errorClass;
      (pass as any).sync_error_bucket = errorClass;
      passes[currentPassIdx] = pass;
      // ── V510-P0 — atomic, monotonic terminalization ──────────────────
      //
      // WAS: a full-row dialog_shots UPDATE carrying THIS invocation
      // snapshot of `passes`. In generation 10 pass 4 reached here with a
      // snapshot taken ~2500 lines earlier and erased passes[2].job_id
      // (cf76aa2c) and passes[3].job_id (0fba3717) — two provider jobs that
      // had already been accepted and paid for.
      //
      // NOW: the failing pass patches ONLY its own slot. Sibling slots are
      // never sent to the database, so they cannot be overwritten — not
      // merely unlikely to be, but structurally absent from the write. Slot,
      // root and scene columns move in one transaction under the row lock.
      const v510TerminalPassPatch = buildTerminalPassPatch({
        reason,
        errorClass,
        diagnostics: {
          diagnostic_id: diagnosticId,
          retry_variant: retryVariant,
          v510_terminalized_by: "fail_before_provider_dispatch",
        },
      });
      await v510Terminalize({
        passIdx: currentPassIdx,
        passPatch: v510TerminalPassPatch,
        rootPatch: {
          canonical_lipsync_pipeline: passes.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
          input_space: passes.length >= 2 ? "plate" : undefined,
          preclip_used: passes.length >= 2 ? false : undefined,
          version: 5,
          engine: "sync-segments",
          status: "failed",
          current_pass: currentPassIdx,
          total_passes: passes.length,
          multi_pass: passes.length > 1,
          source_clip_url: sourceClipUrl,
          total_sec: totalSec,
          segments: pass.segments,
          cost_credits: costCredits,
          refunded: refundSettled,
          v459_refund: refundInfo ?? (prevState as any)?.v459_refund ?? null,
          plate_identity: v153PlateIdentitySnapshot,
          error: reason,
          finished_at: new Date().toISOString(),
        },
        scenePatch: {
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: reason,
        },
        reason,
      });
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: passInputUrl,
        sync_status: "PRE_DISPATCH_FAILED", error_class: errorClass,
        error_message: message,
        meta: {
          diagnostic_id: diagnosticId,
          retry_variant: retryVariant,
          pass_idx: currentPassIdx,
          total_passes: passes.length,
          v459_refund: refundInfo,
          refund_ledger: "euro",
          run_id: refundRunId,
          ...meta,
        },
      });
      // v431 G3.1b — Abbruch VOR dem Provider-Call: beweisbar nicht angenommen.
      await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
        errorCode: reason,
        outcome: "rejected",
      });
      return json({
        error: reason,
        message,
        refunded: didRefund,
        refunded_euros: Number((refundInfo as any)?.amount_euros ?? 0),
        refund: refundInfo,
        ...meta,
      }, status);
    };


    // FA-4/P0 — fail-closed: Sync-Segment ohne kanonische `segment_id`
    // (= dialog_turns.id bzw. deterministische Stabilizer-UUID) darf niemals
    // beim Provider landen.
    if (!v431SegmentId) {
      return await failBeforeProviderDispatch(
        "sync_segment_missing_segment_id",
        "fa4_p0_preflight_blocked",
        "Sync-Segment ohne kanonische segment_id (dialog_turns.id) — Dispatch blockiert.",
        422,
        { pass_idx: currentPassIdx, speaker_idx: (pass as any)?.speaker_idx ?? null },
      );
    }


    if (canonicalDialogTurnsCount > 0) {
      const passCharacterId = String(pass.character_id ?? "").trim();
      if (!passCharacterId || !canonicalSpeakerIds.includes(passCharacterId)) {
        return await failBeforeProviderDispatch(
          "id_only_character_id_missing_or_mismatched",
          "id_only_cast_violation",
          "Dialog lip-sync requires every Sync.so pass to carry a brand character UUID from dialog_turns; legacy name/slot fallback is blocked.",
          422,
          {
            canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
            speakers_source: speakersSource,
            dialog_turns_count: canonicalDialogTurnsCount,
            canonical_speaker_ids: canonicalSpeakerIds,
            pass_character_id: pass.character_id ?? null,
            pass_idx: currentPassIdx,
          },
        );
      }
    }

    // ── v152 — Deferred Hard-Fail für bbox-url-pro Pre-Dispatch Errors ──
    // Die bbox-Construction oben setzt `_v152HardFail` wenn upload/geometry
    // versagt. Wir können dort noch nicht refunden weil failBeforeProviderDispatch
    // erst hier deklariert ist. Hier triggern wir den Hard-Fail bevor Sync.so
    // jemals einen Request sieht.
    // ── FA-4 v406 — NOOP-Retry ohne vollständigen frozen Snapshot ───────
    // Fail closed VOR jedem Provider-Call. Kein Legacy-Rebuild, kein Call.
    if ((pass as any)._v406FrozenMissing) {
      const hf = (pass as any)._v406FrozenMissing;
      return await failBeforeProviderDispatch(
        hf.reason,
        hf.errorClass,
        hf.message,
        422,
        hf.meta ?? {},
      );
    }

    if ((pass as any)._v152HardFail) {
      const hf = (pass as any)._v152HardFail;
      return await failBeforeProviderDispatch(
        hf.reason,
        hf.errorClass,
        hf.message,
        422,
        hf.meta ?? {},
      );
    }

    if ((pass as any)._v153LegacyBranchHardFail) {
      const hf = (pass as any)._v153LegacyBranchHardFail;
      return await failBeforeProviderDispatch(
        hf.reason,
        hf.errorClass,
        hf.message,
        500,
        hf.meta ?? {},
      );
    }

    // V502 — Coords-Varianten dürfen nur mit einem Punkt im Raum des
    // dispatchten Videos feuern. Ohne projizierbaren Anker: fail closed VOR
    // dem Provider-Call statt einen Plate-Punkt gegen einen 720er-Preclip.
    if (
      (retryVariant === "coords-pro" || retryVariant === "sync3-coords" || retryVariant === "coords-pro-lp2pro") &&
      usePassPreclip &&
      !v502DispatchCoords
    ) {
      return await failBeforeProviderDispatch(
        "preclip_coords_out_of_crop",
        "v502_coords_contract_invalid",
        "V502: coords dispatch variant on a pre-clip without a crop-consistent anchor.",
        422,
        {
          retry_variant: retryVariant,
          v502: (pass as any)._v502_coords_contract ?? null,
          preclip_crop: (pass as any).preclip_crop ?? null,
        },
      );
    }




    // v169.1 — Gate nur scharf schalten wenn Tight-Slicing tatsächlich versucht
    // wurde (N≥2). Bei N=1 ist `allowTightSlice=false` und die volle VO geht
    // intentionally als pass.audio_url an Sync.so (Plate-länge Lipsync,
    // direkt als Master, kein Overlay-Mux). Ohne diese Einschränkung
    // feuerte das Gate für jeden Single-Speaker-Pass `prepare_failed_no_tight_audio`.
    if (allowTightSlice && speakerWindowsSecs.length > 0 && !tightAudioInfo) {
      return await failBeforeProviderDispatch(
        "prepare_failed_no_tight_audio",
        "input_audio_prepare_failed",
        `Tight per-turn audio could not be prepared; undocumented Sync.so segments_secs fallback is disabled. ${(pass as any).tight_audio_error ?? ""}`.trim(),
        422,
        { tight_audio_error: (pass as any).tight_audio_error ?? null, windows_secs: speakerWindowsSecs },
      );
    }

    // ── v129.3 — Sync-Audio Normalization (provider input only) ─────────
    // Root cause for scene `7aed09f4-…` (Sarah pass-4 → terminal
    // `provider_unknown_error`): the per-turn WAV upstream of this dispatch
    // still carried 6.7s of leading silence relative to a 1.78s preclip.
    // Sync.so sync-3 with `cut_off` rejects that input.
    //
    // We DO NOT mutate `pass.audio_url` (audio-mux Lambda needs the
    // original timeline-aligned WAV for the final mux). Instead we build a
    // dedicated `sync_audio_url`, scoped to the Sync.so payload only.
    //
    // Strategy: voiced-window trim with 150ms pre-roll + 200ms post-roll.
    // If the trimmed audio still doesn't fit the preclip, the post-trim
    // preflight gate (below) blocks the dispatch terminal with refund.
    if (v406FrozenInput) {
      // FA-4 v406 — frozen NOOP-Retry: KEINE v129.3-Normalisierung. Der
      // Provider-Audio-Input kommt unverändert aus dem Snapshot.
      (pass as any).sync_audio_url = v406FrozenInput.audio_url;
      (pass as any).audio_normalization = {
        mode: "skipped_v406_frozen_retry",
        used_for: "syncso_input_only",
        frozen_audio_url: v406FrozenInput.audio_url,
      };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_skip_audio_normalization frozen_audio=…${v406FrozenInput.audio_url.slice(-60)}`,
      );
    } else try {
      const preclipDurForGate = typeof (pass as any).preclip_duration_sec === "number"
        && Number.isFinite((pass as any).preclip_duration_sec)
        && (pass as any).preclip_duration_sec > 0
        ? Number((pass as any).preclip_duration_sec)
        : null;
      const syncAudioWavResp = await fetch(pass.audio_url, { signal: AbortSignal.timeout(30_000) });
      if (!syncAudioWavResp.ok) throw new Error(`sync_audio_fetch_${syncAudioWavResp.status}`);
      const syncAudioBytes = new Uint8Array(await syncAudioWavResp.arrayBuffer());
      const preInfo = inspectWav(syncAudioBytes);
      const preRange = detectVoicedRange(syncAudioBytes);
      const preLeadIn = preRange.firstVoicedSec >= 0 ? preRange.firstVoicedSec : preInfo.leadInSec;
      const preVoicedEnd = preRange.lastVoicedSec >= 0
        ? preRange.lastVoicedSec
        : preInfo.durSec;
      const preFullSec = preInfo.durSec;

      // Heuristic trigger: trim ONLY when we have a useful gain. If the
      // file is already tight (leadIn < 0.5s AND voicedEnd within preclip),
      // skip the slice/upload roundtrip entirely.
      const needsTrim =
        preRange.firstVoicedSec >= 0 &&
        preRange.lastVoicedSec >= 0 &&
        (preLeadIn > 0.5 ||
          (preclipDurForGate != null && preVoicedEnd > preclipDurForGate + 0.25) ||
          (preFullSec - (preVoicedEnd - preLeadIn) > 0.6));

      let normMeta: Record<string, unknown> = {
        mode: "skipped",
        original_full_sec: Number(preFullSec.toFixed(3)),
        original_lead_in_sec: Number(Math.max(0, preLeadIn).toFixed(3)),
        original_voiced_end_sec: Number(Math.max(0, preVoicedEnd).toFixed(3)),
        original_tail_silence_sec: Number(preRange.tailSilenceSec.toFixed(3)),
        pre_roll_sec: 0,
        post_roll_sec: 0,
        removed_lead_sec: 0,
        removed_tail_sec: 0,
        trimmed_full_sec: Number(preFullSec.toFixed(3)),
        first_voiced_sec_after_trim: Number(Math.max(0, preLeadIn).toFixed(3)),
        last_voiced_sec_after_trim: Number(Math.max(0, preVoicedEnd).toFixed(3)),
        used_for: "syncso_input_only",
        preclip_duration_sec: preclipDurForGate,
      };

      if (needsTrim) {
        const preRoll = 0.15;
        const postRoll = 0.20;
        const startSec = Math.max(0, preRange.firstVoicedSec - preRoll);
        const endSec = Math.min(preFullSec, preRange.lastVoicedSec + postRoll);
        let slicedBytes: Uint8Array;
        let slicedDurSec: number;
        try {
          const sliced = sliceWavToWindows(
            syncAudioBytes,
            [{ startSec, endSec }],
            { gapSec: 0 },
          );
          slicedBytes = sliced.bytes;
          slicedDurSec = sliced.durSec;
        } catch (sliceErr) {
          // Fail-safe: unsupported WAV format / slice math problem →
          // terminal, refund, no provider call. Never ship half-corrupt WAV.
          return await failBeforeProviderDispatch(
            "sync_audio_trim_failed",
            "unsupported_wav_format_for_trim",
            `v129.3 sync-audio normalization failed to slice WAV: ${(sliceErr as Error)?.message ?? sliceErr}`,
            422,
            {
              v1293: true,
              audio_normalization: { ...normMeta, error: (sliceErr as Error)?.message ?? String(sliceErr) },
              attempt_id: (pass as any).attempt_id ?? null,
              pass_idx: currentPassIdx,
              speaker_name: pass.speaker_name,
            },
          );
        }

        // Deterministic filename hash so user-retries with identical inputs
        // upsert the same object (avoids storage bloat). Resolution rounded
        // to 50ms — finer than human-perceivable, coarser than fp jitter.
        const hashKey = `${sceneId}:${currentPassIdx}:${Math.round(startSec * 20)}:${Math.round(endSec * 20)}`;
        const hashBuf = await crypto.subtle.digest(
          "SHA-1",
          new TextEncoder().encode(hashKey),
        );
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .slice(0, 6)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const syncPath = `${userId}/twoshot-vo/${sceneId}-pass-${currentPassIdx + 1}-sync-${hashHex}.wav`;
        const up = await supabase.storage.from("voiceover-audio").upload(
          syncPath,
          slicedBytes,
          { contentType: "audio/wav", upsert: true },
        );
        if (up.error && !/already exists|duplicate/i.test(up.error.message)) {
          return await failBeforeProviderDispatch(
            "sync_audio_upload_failed",
            "sync_audio_upload_failed",
            `v129.3 sync-audio upload failed: ${up.error.message}`,
            500,
            {
              v1293: true,
              audio_normalization: normMeta,
              attempt_id: (pass as any).attempt_id ?? null,
            },
          );
        }
        const { data: pub } = supabase.storage.from("voiceover-audio").getPublicUrl(syncPath);
        if (!pub?.publicUrl) {
          return await failBeforeProviderDispatch(
            "sync_audio_publicurl_missing",
            "sync_audio_upload_failed",
            "v129.3 sync-audio public URL missing after upload",
            500,
            { v1293: true, audio_normalization: normMeta },
          );
        }

        // Re-inspect the trimmed bytes so the gate runs on POST-trim
        // diagnostics, never on stale pre-trim values.
        const postInfo = inspectWav(slicedBytes);
        const postRange = detectVoicedRange(slicedBytes);
        const postLeadIn = postRange.firstVoicedSec >= 0 ? postRange.firstVoicedSec : postInfo.leadInSec;
        const postVoicedEnd = postRange.lastVoicedSec >= 0 ? postRange.lastVoicedSec : postInfo.durSec;

        normMeta = {
          ...normMeta,
          mode: "voiced_window",
          pre_roll_sec: preRoll,
          post_roll_sec: postRoll,
          removed_lead_sec: Number((preRange.firstVoicedSec - startSec >= 0
            ? startSec
            : 0).toFixed(3)),
          removed_tail_sec: Number(Math.max(0, preFullSec - endSec).toFixed(3)),
          trimmed_full_sec: Number(slicedDurSec.toFixed(3)),
          first_voiced_sec_after_trim: Number(Math.max(0, postLeadIn).toFixed(3)),
          last_voiced_sec_after_trim: Number(Math.max(0, postVoicedEnd).toFixed(3)),
          trimmed_tail_silence_sec: Number(postRange.tailSilenceSec.toFixed(3)),
          sync_audio_url: pub.publicUrl,
        };
        (pass as any).sync_audio_url = pub.publicUrl;
        (pass as any).audio_normalization = normMeta;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v1293_sync_audio_normalized ` +
          `original=${preFullSec.toFixed(2)}s leadIn=${preLeadIn.toFixed(2)}s → trimmed=${slicedDurSec.toFixed(2)}s ` +
          `voiced=${(postVoicedEnd - postLeadIn).toFixed(2)}s preclipDur=${preclipDurForGate ?? "?"}s`,
        );
      } else {
        (pass as any).audio_normalization = normMeta;
      }

      // ── v129.3 Change C — Post-trim preflight gate ──────────────────
      const gateAudioBytes = needsTrim
        ? await fetch(((pass as any).sync_audio_url as string), { signal: AbortSignal.timeout(20_000) })
            .then((r) => r.arrayBuffer())
            .then((b) => new Uint8Array(b))
        : syncAudioBytes;
      const gateRange = detectVoicedRange(gateAudioBytes);
      const gateInfo = inspectWav(gateAudioBytes);
      const gateFirst = gateRange.firstVoicedSec >= 0 ? gateRange.firstVoicedSec : gateInfo.leadInSec;
      const gateLast = gateRange.lastVoicedSec >= 0 ? gateRange.lastVoicedSec : gateInfo.durSec;
      const gateVoicedSec = gateRange.voicedSec;
      const gateFull = gateInfo.durSec;

      if (gateVoicedSec < 0.15) {
        return await failBeforeProviderDispatch(
          "audio_too_silent_post_trim",
          "audio_too_silent",
          `v129.3 post-trim audio has only ${gateVoicedSec.toFixed(3)}s of voiced content (<0.15s); skipping Sync.so to avoid provider_unknown_error.`,
          422,
          {
            v1293: true,
            preflight: "audio_too_silent",
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (gateFirst > 0.5) {
        return await failBeforeProviderDispatch(
          "audio_leadin_too_long_after_trim",
          "audio_leadin_too_long_after_trim",
          `v129.3 post-trim audio still has ${gateFirst.toFixed(3)}s of leading silence (>0.5s); Sync.so would reject.`,
          422,
          {
            v1293: true,
            preflight: "audio_leadin_too_long_after_trim",
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (preclipDurForGate != null && gateLast > preclipDurForGate + 0.25) {
        return await failBeforeProviderDispatch(
          "audio_voiced_exceeds_video",
          "audio_voiced_exceeds_video",
          `v129.3 post-trim audio voiced-end ${gateLast.toFixed(2)}s exceeds preclip duration ${preclipDurForGate.toFixed(2)}s + 0.25s tolerance.`,
          422,
          {
            v1293: true,
            preflight: "audio_voiced_exceeds_video",
            gate_voiced_end_sec: Number(gateLast.toFixed(3)),
            preclip_duration_sec: preclipDurForGate,
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
      if (preclipDurForGate != null && gateFull > preclipDurForGate + 0.5
          && gateRange.tailSilenceSec < 0.2) {
        return await failBeforeProviderDispatch(
          "audio_overflow_unverifiable_tail",
          "audio_overflow_unverifiable_tail",
          `v129.3 post-trim audio is ${gateFull.toFixed(2)}s but preclip is only ${preclipDurForGate.toFixed(2)}s and tail silence (${gateRange.tailSilenceSec.toFixed(2)}s) is too small to be safely cut off.`,
          422,
          {
            v1293: true,
            preflight: "audio_overflow_unverifiable_tail",
            gate_full_sec: Number(gateFull.toFixed(3)),
            gate_tail_silence_sec: Number(gateRange.tailSilenceSec.toFixed(3)),
            preclip_duration_sec: preclipDurForGate,
            audio_normalization: (pass as any).audio_normalization ?? normMeta,
            attempt_id: (pass as any).attempt_id ?? null,
            pass_idx: currentPassIdx,
            speaker_name: pass.speaker_name,
          },
        );
      }
    } catch (normErr) {
      // Best-effort. If normalization itself throws (network hiccup,
      // unparseable WAV) we fall through to the legacy SILENT_AUDIO_GATE
      // path which is the safe pre-v129.3 behaviour. We log so this is
      // visible in dispatch logs.
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v1293_normalization_skipped: ${(normErr as Error)?.message ?? normErr}`,
      );
      (pass as any).audio_normalization = {
        mode: "skipped_on_error",
        error: (normErr as Error)?.message ?? String(normErr),
        used_for: "syncso_input_only",
      };
    }

    // v194 — Silent-Speaker-Pass stabilizer bypass. These passes intentionally
    // ship a near-silent WAV (room tone) so Sync.so produces a closed-mouth
    // lipsync that follows head motion for a non-speaking listener face. The
    // regular silent-audio gate would (correctly, for user audio) reject
    // them. We bypass ONLY when the pass is explicitly flagged as a
    // stabilizer AND the audio_url is our deterministic silence-track.
    const isStabilizer = isStabilizerPass(pass);

    const finalAudioDiag = isStabilizer
      ? null
      : await inspectSpeakerAudioWithRetry(pass.audio_url, 3).catch((audioErr) => {
          console.warn(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} SILENT_AUDIO_GATE inspect_failed: ${(audioErr as Error)?.message ?? audioErr}`,
          );
          return null;
        });
    const finalPeakDbFs = Number(finalAudioDiag?.wav?.peakDbFs);
    const finalVoicedSec = Number(finalAudioDiag?.vad?.voicedSec ?? 0);
    const finalLongestRun = Number(finalAudioDiag?.vad?.longestVoicedRun ?? 0);
    const audioSilentOrInvalid = !isStabilizer && (
      !finalAudioDiag ||
      !Number.isFinite(finalPeakDbFs) ||
      finalPeakDbFs <= -50 ||
      finalVoicedSec <= 0.04 ||
      finalLongestRun <= 0.04
    );
    if (isStabilizer) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v194_stabilizer_bypass_silent_gate speaker_idx=${(pass as any).speaker_idx}`,
      );
    }
    if (audioSilentOrInvalid) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} SILENT_AUDIO_GATE peak_dbfs=${Number.isFinite(finalPeakDbFs) ? finalPeakDbFs.toFixed(2) : "invalid"} voiced=${finalVoicedSec.toFixed(3)}s longest=${finalLongestRun.toFixed(3)}s url=${pass.audio_url.slice(0, 120)}`,
      );
      (pass as any).audio_gate = {
        peak_dbfs: Number.isFinite(finalPeakDbFs) ? finalPeakDbFs : null,
        voiced_sec: Number.isFinite(finalVoicedSec) ? finalVoicedSec : 0,
        longest_voiced_run: Number.isFinite(finalLongestRun) ? finalLongestRun : 0,
        inspected_url: pass.audio_url,
      };
      return await failBeforeProviderDispatch(
        "speaker_audio_silent_or_invalid",
        "input_audio_silent",
        "Speaker audio is silent or contains no detectable voiced frames; skipped Sync.so dispatch to avoid provider_unknown_error.",
        422,
        { audio_gate: (pass as any).audio_gate, audio_tight: (pass as any).audio_tight ?? null, audio_repair: (pass as any).audio_repair ?? null },
      );
    }

    // v53 — Keep Sync.so payload doc-strict. `segments_secs` is not in the
    // public Sync.so schema and broke sync-3 jobs with provider_unknown_error.
    // Per-turn timing is now represented only by the tight audio WAV plus
    // `sync_mode=cut_off`.
    // v68 — when a per-pass single-face preclip exists, send IT to Sync.so
    // instead of the full multi-face plate. Sync.so sees one face only →
    // no `provider_unknown_error` ambiguity. The audio-mux Lambda overlays
    // the lipsynced crop back at preclip_crop on the original plate.
    // V543 — der v204-Preclip-Zwang gilt nur noch für den Fallback-Pfad.
    // Ein bewusst gewählter Full-Shot-Dispatch (identitäts-gelockte Box,
    // auto_detect aus) ist kein "Full-Plate-Fallback" im Sinne von v204.
    const v204MultiSpeakerPreclipDispatch =
      speakers.length >= 2 && !(pass as any)._v153BboxPrimary;

    if (v204MultiSpeakerPreclipDispatch && (!usePassPreclip || !passPreclipUrl)) {
      return await failBeforeProviderDispatch(
        "v204_preclip_required",
        "v204_preclip_missing_before_wire",
        "Refusing to dispatch multi-speaker Sync.so job without a single-face preclip; v204 forbids Full-Plate fallback.",
        422,
        {
          canonical_lipsync_pipeline: "v204_preclip_bbox_clipspace",
          input_space: "clip",
          preclip_used: false,
          full_plate_fallback_blocked: true,
          pass_idx: currentPassIdx,
          speaker: pass.speaker_name ?? null,
          character_id: pass.character_id ?? null,
          retry_variant: retryVariant,
        },
      );
    }

    // ══════════════════ V461 A — v400 FACE-GATE (hard, pre-dispatch) ══════
    // V460 evidence: pass 4 of scene be60d106… went to the provider with
    // face_share 0.218 (< 0.24) and then burned the whole NOOP ladder. The
    // value was measured but never gated. From here on an input that breaks
    // the v400 input contract is a CONTRACT BREACH before the provider call —
    // not a provider NOOP. Refund happens on the pre-dispatch path.
    const v461Gate = evaluateV461FaceGate({
      usePreclip: usePassPreclip,
      faceShare: (pass as any).preclip_face_share ?? null,
      faceBbox: (pass as any).preclip_from_bbox ?? null,
      crop: (pass as any).preclip_crop ?? (pass as any)._v450_frozen_preclip_crop ?? null,
      anchor: typeof (pass as any).preclip_anchor === "string"
        ? String((pass as any).preclip_anchor).startsWith("mouth") ? "mouth" : (pass as any).preclip_anchor
        : null,
      mouthOffsetXy: (pass as any).preclip_mouth_offset_xy ?? null,
      // V461 C — the geometry the renderer ACTUALLY consumed.
      //
      // `preclip_crop` + `preclip_mouth_offset_xy` above describe the static
      // base crop and one collapsed median mouth. When the pre-clip was
      // rendered along a moving camera path, that pair is not the geometry
      // that exists on disk, and gating on it blocks passes whose every
      // rendered frame contains the mouth (scene 67b392b1 pass 2).
      //
      // The frozen path is passed, NOT `preclip_mouth_roi_samples`: those
      // are clamped to [0,1] and could never express an escape.
      cameraPathDynamic: (pass as any).preclip_camera_path_dynamic === true,
      cameraPathKeyframes:
        ((pass as any).preclip_camera_path ?? (pass as any)._v450_frozen_camera_path)?.keyframes ?? null,
      identity: (pass as any).preclip_geometry_identity ?? null,
      expectedIdentity: (pass as any).preclip_geometry_identity
        ? {
          runId: String((scene as any).active_run_id ?? "") || null,
          generation: Number.isFinite(Number((scene as any).plate_generation))
            ? Number((scene as any).plate_generation)
            : null,
          passIdx: currentPassIdx,
          speakerIdx: Number(pass.speaker_idx),
        }
        : null,
    });
    (pass as any).v461_face_gate = {
      status: v461Gate.status,
      code: v461Gate.code,
      checks: v461Gate.checks,
      metrics: v461Gate.metrics,
    };
    console.log(
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v461_face_gate=${v461Gate.status} code=${v461Gate.code} share=${v461Gate.metrics.face_share ?? "?"} size_px=${v461Gate.metrics.face_size_provider_px?.toFixed?.(1) ?? "?"} ` +
        `roi_src=${v461Gate.metrics.mouth_roi_source ?? "n/a"} ` +
        `kf=${v461Gate.metrics.mouth_roi_keyframes_checked} ` +
        `worst_t=${v461Gate.metrics.mouth_roi_worst_t ?? "n/a"} ` +
        `worst_margin=${v461Gate.metrics.mouth_roi_worst_margin?.toFixed?.(4) ?? "n/a"}`,
    );
    if (!v461Gate.ok) {
      return await failBeforeProviderDispatch(
        v461Gate.code,
        "lipsync_input_contract_violation",
        tl({
          de: `Der Bildausschnitt dieses Sprechers erfüllt den Lip-Sync-Eingangsvertrag nicht (${v461Gate.reason}). Es wurde kein Provider-Lauf gestartet, die Kosten wurden erstattet.`,
          en: `This speaker's crop does not satisfy the lip-sync input contract (${v461Gate.reason}). No provider run was started; the cost was refunded.`,
          es: `El encuadre de este hablante no cumple el contrato de entrada de lip-sync (${v461Gate.reason}). No se inició ninguna ejecución del proveedor; el coste fue reembolsado.`,
        }),
        422,
        {
          v461_face_gate: v461Gate,
          provider_call_made: false,
          pass_idx: currentPassIdx,
          speaker: pass.speaker_name ?? null,
        },
      );
    }

    // ══════ V469 — MOUTH-VISIBILITY / POSE-SUITABILITY GATE (pre-dispatch) ══
    // V468 evidence: within one identical request contract, pass 0 (~90°
    // profile, mouth practically not visible) NOOP'd while the frontal /
    // moderate passes were edited. This gate asks whether the MOUTH is usably
    // visible over enough frames — it is deliberately NOT a `yaw >= X°` cut
    // (V463 produced MOVED at ~75° yaw). Yaw is a risk signal / telemetry.
    // Missing evidence is fail-open; only positive evidence blocks.
    const v469Gate = evaluateV469MouthVisibility({
      usePreclip: usePassPreclip,
      faceTrack: (pass as any).preclip_face_track ??
        (pass as any)._v450_frozen_face_track ?? null,
      turnStartSec: Number.isFinite(Number((pass as any).preclip_start_sec))
        ? Number((pass as any).preclip_start_sec)
        : null,
      turnEndSec: Number.isFinite(Number((pass as any).preclip_end_sec))
        ? Number((pass as any).preclip_end_sec)
        : null,
      anchor: (pass as any).preclip_anchor ?? null,
      yawDeg: Number.isFinite(Number((pass as any).plate_yaw_deg))
        ? Number((pass as any).plate_yaw_deg)
        : null,
    });
    (pass as any).v469_mouth_visibility = {
      status: v469Gate.status,
      code: v469Gate.code,
      metrics: v469Gate.metrics,
    };
    console.log(
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v469_mouth_visibility=${v469Gate.status} code=${v469Gate.code} ` +
        `usable_rate=${v469Gate.metrics.usable_frame_rate?.toFixed?.(2) ?? "?"} aspect=${v469Gate.metrics.median_face_aspect?.toFixed?.(2) ?? "?"} ` +
        `landmark_rate=${v469Gate.metrics.mouth_landmark_rate?.toFixed?.(2) ?? "?"} yaw=${v469Gate.metrics.yaw_deg ?? "?"}`,
    );
    if (!v469Gate.ok) {
      return await failBeforeProviderDispatch(
        v469Gate.code,
        "lipsync_input_contract_violation",
        tl({
          de: `Der Mund dieses Sprechers ist im Ausschnitt nicht ausreichend sichtbar/bearbeitbar (${v469Gate.reason}). Es wurde kein Provider-Lauf gestartet, die Kosten wurden erstattet.`,
          en: `This speaker's mouth is not sufficiently visible/editable in the crop (${v469Gate.reason}). No provider run was started; the cost was refunded.`,
          es: `La boca de este hablante no es suficientemente visible/editable en el encuadre (${v469Gate.reason}). No se inició ninguna ejecución del proveedor; el coste fue reembolsado.`,
        }),
        422,
        {
          v469_mouth_visibility: v469Gate,
          provider_call_made: false,
          pass_idx: currentPassIdx,
          speaker: pass.speaker_name ?? null,
        },
      );
    }



    const dispatchVideoKind = usePassPreclip ? "preclip" : "full_plate";
    const dispatchInputSpace = usePassPreclip ? "clip" : "plate";
    const rawDispatchVideoUrl = v406FrozenInput
      ? v406FrozenInput.video_url
      : (v204MultiSpeakerPreclipDispatch
        ? (passPreclipUrl as string)
        : (usePassPreclip ? (passPreclipUrl as string) : passInputUrl));
    // v143 — Rehost the plate into our own bucket before sending to Sync.so.
    // Presigned Replicate/S3 URLs expire after ~60 min; multi-pass dialogs
    // routinely exceed that window, causing Sync.so to silently return 422
    // `generation_input_video_inaccessible` which our pipeline mis-read as
    // a NOOP. The signed `lipsync-plates` URL is valid for 7 days.
    // FA-4 v406: auf einem frozen NOOP-Retry wird NICHT erneut rehostet —
    // die Video-URL ist Teil des eingefrorenen Wire.
    let dispatchVideoUrl = rawDispatchVideoUrl;
    let rehostInfo: { uploaded: boolean; ms: number; bytes: number } | null = null;
    if (v406FrozenInput) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v406_skip_rehost frozen_video=…${dispatchVideoUrl.slice(-60)}`,
      );
    } else {
    try {
      const rh = await rehostPlate(supabase, rawDispatchVideoUrl, {
        sceneId,
        passIdx: currentPassIdx,
          kind: usePassPreclip ? "preclip" : "fullplate",
        ownerId: (scene as any)?.user_id ?? (scene as any)?.owner_id ?? null,
      });
      dispatchVideoUrl = rh.url;
      rehostInfo = { uploaded: rh.uploaded, ms: rh.durationMs, bytes: rh.bytes };
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v143_rehost ${rh.uploaded ? "uploaded" : "cached"} ${rh.bytes}B in ${rh.durationMs}ms`,
      );
    } catch (e) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v143_rehost FAILED — falling back to raw URL: ${(e as Error)?.message}`,
      );
    }
    }
    // v189 (Fix E) — Persistence honesty. `pass.input_url` was set to the
    // master plate at the top of the dispatch, but Sync.so actually receives
    // `dispatchVideoUrl` (the per-speaker preclip when `usePassPreclip`).
    // Overwrite so forensics (`dialog_shots.passes[].input_url`) matches
    // what Sync.so was told, per v169 §3 data-model contract.
    try {
      (pass as any).input_url = dispatchVideoUrl;
    } catch { /* noop */ }

    // ══ FA-4 v407 — Frozen Provider Input Snapshot (contracted path only) ══
    // Gilt AUSSCHLIESSLICH für den contracted Multi-Speaker-BBox-Wire.
    // Single-Speaker / Nicht-BBox-Pfade laufen unverändert über den
    // pre-v406-Payload-Pfad (kein Snapshot, kein snapshot_build_failed).
    const v407FreshWireInput = (pass as any)._v406FreshWireInput ?? null;
    const v407FreshWireContract = !v406FrozenInput && isV407FreshWireContract({
      // v408 P1-1: Fresh-Contract nur auf Erst-Dispatches. Normale Retries
      // (nicht der explizite NOOP-coords-pro-box-Pfad) bleiben pre-v406.
      isRetry: isRetry === true,
      isMultiSpeaker: v407IsMultiSpeaker,
      payloadModel,
      retryVariant,
      hasDispatchBox: Array.isArray(v407FreshWireInput?.bbox) &&
        v407FreshWireInput.bbox.length === 4,
      canonicalBoxesAvailable: Array.isArray(v407FreshWireInput?.bounding_boxes) &&
        v407FreshWireInput.bounding_boxes.length > 0,
    });
    const v407WireContractActive = v407FreshWireContract || !!v406FrozenInput;

    let v406Snapshot: ProviderWireSnapshot | null = null;
    let v406Wire: ReturnType<typeof buildProviderWire> | null = null;

    if (v407WireContractActive) {
      // Reihenfolge (frozen contract): Video/Audio/BBox finalisiert → Snapshot
      // bauen → persistieren → (Fresh) bounding_boxes JSON hochladen →
      // Dispatch. Persist-Failure = failBeforeProviderDispatch, kein Call.
      if (v406FrozenInput) {
        v406Snapshot = v406FrozenInput;
      } else {
        try {
          v406Snapshot = buildProviderWireSnapshot({
            videoUrl: dispatchVideoUrl,
            audioUrl: String((pass as any).sync_audio_url ?? pass.audio_url ?? ""),
            bbox: v407FreshWireInput?.bbox ?? null,
            boundingBoxes: v407FreshWireInput?.bounding_boxes ?? [],
            frameCount: v407FreshWireInput?.frame_count ?? 0,
            dispatchFps: v407FreshWireInput?.dispatch_fps ?? 0,
            voicedWindows: v407FreshWireInput?.voiced_windows ?? [],
            syncMode: payloadSyncMode,
            model: payloadModel,
            speakerIdx: Number((pass as any).speaker_idx ?? currentPassIdx),
            segmentId: v431SegmentId ?? "",
            runId: (passRunStamp.run_id as string | null) ?? null,
            plateGeneration: Number(passRunStamp.plate_generation ?? 0),
          });
        } catch (e) {
          return await failBeforeProviderDispatch(
            "v407_snapshot_build_failed",
            "v407_snapshot_build_failed",
            "Provider-Input konnte nicht eingefroren werden — Dispatch blockiert.",
            422,
            { error: (e as Error)?.message ?? String(e), pass_idx: currentPassIdx },
          );
        }
        // Installierte RPC-Signatur: (_scene_id, _pass_idx, _patch).
        const persisted = await persistFrozenProviderInput(
          async (fn, args) => {
            const r = await supabase.rpc(fn, args as any);
            return { data: (r as any)?.data, error: (r as any)?.error ?? null };
          },
          { sceneId, passIdx: currentPassIdx, snapshot: v406Snapshot },
        );
        if (!persisted.ok) {
          return await failBeforeProviderDispatch(
            "v408_snapshot_persist_unconfirmed",
            "v408_snapshot_persist_unconfirmed",
            "Provider-Input-Snapshot konnte nicht bestätigt persistiert werden — Dispatch blockiert.",
            500,
            { error: persisted.error, pass_idx: currentPassIdx },
          );
        }
        (pass as any).provider_input_frozen = v406Snapshot;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v407_snapshot_persisted boxes=${v406Snapshot.bounding_boxes.length} frames=${v406Snapshot.frame_count} fps=${v406Snapshot.dispatch_fps}`,
        );
      }

      // Fresh: bounding_boxes JSON hochladen (Transport-Detail, keine neue
      // Geometrie). KEIN inline graceful-degrade mehr — Upload-Fehler ⇒ fail
      // closed vor jedem Provider-Call.
      let v406BoundingBoxesUrl: string | null = null;
      let v407UploadError: string | null = null;
      const v407WantsUrlTransport = !v406FrozenInput &&
        v407FreshWireInput?.wants_url_transport === true;
      if (v407WantsUrlTransport) {
        try {
          const up = await uploadBoundingBoxesJson(supabase, {
            userId,
            projectId: String((scene as any).project_id ?? ""),
            sceneId,
            passIdx: currentPassIdx,
            boxes: v406Snapshot.bounding_boxes,
            box: v406Snapshot.bbox,
            frameCount: v406Snapshot.frame_count,
            voicedWindowsSec: v406Snapshot.voiced_windows,
            fps: v406Snapshot.dispatch_fps,
          } as any);
          v406BoundingBoxesUrl = up.url;
        } catch (e) {
          v407UploadError = (e as Error)?.message ?? String(e);
        }
      }

      const transport = resolveAsdTransport({
        frozen: !!v406FrozenInput,
        wantsUrlTransport: v407WantsUrlTransport,
        uploadedUrl: v406BoundingBoxesUrl,
      });
      if (!transport.ok) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v407_bbox_url_transport_failed — fail closed, zero provider calls`,
        );
        return await failBeforeProviderDispatch(
          transport.reason,
          transport.reason,
          "Die bounding_boxes-URL für den Multi-Speaker-Wire konnte nicht erzeugt werden — Dispatch blockiert.",
          500,
          {
            error: v407UploadError,
            provider_call_made: false,
            pass_idx: currentPassIdx,
          },
        );
      }

      v406Wire = buildProviderWire(v406Snapshot, {
        asdTransport: transport.transport,
        boundingBoxesUrl: transport.boundingBoxesUrl,
      });
      syncOptions.active_speaker_detection = v406Wire.active_speaker_detection;
      syncOptions.sync_mode = v406Wire.sync_mode;
    }

    // Pre-v406 Payload-Pfad bleibt für alle nicht-contracted Dispatches gültig.
    const wireModel = v406Wire?.model ?? payloadModel;
    const wireVideoUrl = v406Wire?.video_url ?? dispatchVideoUrl;
    const wireAudioUrl = v406Wire?.audio_url ??
      String((pass as any).sync_audio_url ?? pass.audio_url ?? "");

    // ══ V461 B — SEMANTIC INPUT FINGERPRINT (dedup source of truth) ═══════
    // Stufe 1 proved that the NOOP ladder ships identical semantics with a
    // different box TRANSPORT. The fingerprint separates both axes so a
    // transport-only re-dispatch can be refused instead of repeated.
    const v461Asd: any = (syncOptions as any).active_speaker_detection ?? {};
    const v461Fingerprint = computeInputFingerprint(
      {
        videoUrl: wireVideoUrl,
        audioUrl: wireAudioUrl,
        audioDurSec: Number((pass as any).audio_dur_sec ?? 0) || null,
        frameCount: Number((pass as any).preclip_frame_count ?? v406Snapshot?.frame_count ?? 0),
        dispatchFps: Number((pass as any).preclip_fps ?? v406Snapshot?.dispatch_fps ?? 0),
        boundingBoxes: v406Snapshot?.bounding_boxes ??
          (Array.isArray(v461Asd.bounding_boxes) ? v461Asd.bounding_boxes : null),
        bbox: v406Snapshot?.bbox ??
          (Array.isArray(v461Asd.coordinates) ? v461Asd.coordinates : null),
        coordinateSpace: dispatchInputSpace,
        voicedWindows: v406Snapshot?.voiced_windows ?? null,
        model: wireModel,
        syncMode: String((syncOptions as any).sync_mode ?? ""),
        speakerIdx: Number(pass.speaker_idx),
      },
      {
        asdTransport: v461Asd.bounding_boxes_url
          ? "url"
          : Array.isArray(v461Asd.bounding_boxes)
            ? "inline"
            : "coords",
        retryVariant,
      },
    );
    // Backstop for B: if the NOOP ladder ever re-arms a transport-only rung
    // with an unchanged semantic input, refuse here too — the webhook gate is
    // the primary, this is the last line before money is spent.
    const v461SeenFingerprints: string[] = Array.isArray((pass as any).noop_semantic_fingerprints)
      ? (pass as any).noop_semantic_fingerprints.map(String)
      : [];
    const v461Redispatch = evaluateNoopRedispatch({
      nextVariant: retryVariant,
      plannedSemanticFingerprint: v461Fingerprint.semantic,
      seenSemanticFingerprints: v461SeenFingerprints,
    });
    if (!v461Redispatch.allow) {
      return await failBeforeProviderDispatch(
        "sync_noop_semantic_input_unchanged",
        "sync_noop_semantic_input_unchanged",
        tl({
          de: "Der Wiederholversuch hätte exakt denselben Eingang an den Provider geschickt — nur in anderer Transportform. Der Lauf wurde vorher gestoppt und die Kosten erstattet.",
          en: "The retry would have sent the provider exactly the same input, only in a different transport form. The run was stopped beforehand and the cost refunded.",
          es: "El reintento habría enviado al proveedor exactamente la misma entrada, solo con otro transporte. La ejecución se detuvo antes y el coste fue reembolsado.",
        }),
        422,
        {
          v461_semantic_fingerprint: v461Fingerprint.semantic,
          v461_seen_fingerprints: v461SeenFingerprints,
          provider_call_made: false,
          pass_idx: currentPassIdx,
        },
      );
    }
    (pass as any).semantic_input_fingerprint = v461Fingerprint.semantic;
    (pass as any).noop_semantic_fingerprints = Array.from(
      new Set([...v461SeenFingerprints, v461Fingerprint.semantic]),
    ).slice(-8);


    const videoInput: Record<string, unknown> = { type: "video", url: wireVideoUrl };
    // v124 — Hard whitelist sanitizer + ASD mutex. Supersedes the partial
    // v106 blacklist scrub. For `model: "sync-3"` ONLY `sync_mode` and
    // `active_speaker_detection` survive the call. When ASD has
    // `bounding_boxes`/`bounding_boxes_url`, `frame_number`/`coordinates`
    // are dropped (mutex). Stripped keys are logged with `v124_sync3_sanitize`.
    const v124Sanitized = sanitizeSync3Options(wireModel, syncOptions, {
      scene: sceneId,
      pass: currentPassIdx + 1,
      speaker: String(pass.speaker_name ?? ""),
    });
    const payloadOptions = v124Sanitized.options;
    const payload: Record<string, unknown> = {
      model: wireModel,
      input: [
        videoInput,
        { type: "audio", url: wireAudioUrl },
      ],
      options: payloadOptions,
      webhookUrl: diagnosticWebhookUrl,
      webhook_url: diagnosticWebhookUrl,
    };


    // v105 — Compliance probe of the ACTUAL outgoing Sync.so payload.
    // We previously persisted v102/v103 probes computed from the per-speaker
    // full-length WAV, which masked the real input. v105 reads back from
    // `payload.input[].audio.url` so the dispatch log proves auto_detect
    // is OFF for N>=2 and the ASD shape is the one Sync.so docs require.
    const asdForProbe = (syncOptions as any).active_speaker_detection ?? null;
    const v105Probe = {
      stage: speakers.length >= 2
        ? "v204-preclip-bbox-clipspace"
        : usePassPreclip
          ? "preclip-sync3-autodetect-v105"
          : "fullplate-sync3-deterministic-v105",
      model_intent: "sync-3",
      payload_model: payloadModel,
      dispatch_video_kind: dispatchVideoKind,
      canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
      input_space: dispatchInputSpace,
      preclip_used: usePassPreclip,
      retry_variant: retryVariant,
      asd_mode: asdForProbe?.auto_detect === true
        ? "auto_detect"
        : asdForProbe?.bounding_boxes_url
          ? "bounding_boxes_url"
          : Array.isArray(asdForProbe?.bounding_boxes)
            ? "bounding_boxes_inline"
            : asdForProbe?.frame_number != null
              ? "coordinates"
              : "unknown",
      asd_auto_detect: asdForProbe?.auto_detect === true,
      asd_has_bounding_boxes_url: !!asdForProbe?.bounding_boxes_url,
      asd_has_coordinates: Array.isArray(asdForProbe?.coordinates),
      asd_frame_number: asdForProbe?.frame_number ?? null,
      sync_mode: (syncOptions as any).sync_mode,
      speakers: speakers.length,
      payload_audio_url: (pass as any).sync_audio_url ?? pass.audio_url,
      payload_audio_normalized: !!(pass as any).sync_audio_url,
      audio_normalization: (pass as any).audio_normalization ?? null,
      payload_video_url: dispatchVideoUrl,
      // v143 — Rehost telemetry so dispatch logs prove whether Sync.so saw a
      // stable lipsync-plates URL or the raw Replicate URL.
      v143_rehost_url: rehostInfo ? dispatchVideoUrl : null,
      v143_rehost_source_url: rehostInfo ? rawDispatchVideoUrl : null,
      v143_rehost_uploaded: rehostInfo?.uploaded ?? null,
      v143_rehost_bytes: rehostInfo?.bytes ?? null,
      v143_rehost_ms: rehostInfo?.ms ?? null,
      // v106 — full options-key list so any future doc-drift (unsupported
      // field smuggled into sync-3) is visible in dispatch logs.
      options_keys: Object.keys(payloadOptions),
      v124_stripped_opts: v124Sanitized.strippedOpts,
      v124_stripped_asd: v124Sanitized.strippedAsd,
    };
    (pass as any)._v105_probe = v105Probe;
    (pass as any)._v106_probe = v105Probe;

    // v169 — Multi-speaker must NEVER use auto_detect, including preclips.
    // Each pass should carry deterministic frame_number+coordinates or a
    // bounding_boxes_url/inline bbox. If any legacy branch still produced
    // auto_detect:true, fail before provider spend instead of black-boxing
    // into wrong-speaker / black-scene / infinite-loading behaviour.
    if (speakers.length >= 2 && asdForProbe?.auto_detect === true) {
      return await failBeforeProviderDispatch(
        "multi_speaker_auto_detect_blocked",
        usePassPreclip
          ? "asd_auto_detect_on_multi_speaker_preclip"
          : "asd_auto_detect_on_multi_speaker_fullplate",
        "Refusing to dispatch Sync.so with auto_detect=true on a multi-speaker scene; deterministic ASD is required.",
        500,
        { v105_probe: v105Probe, canonical_lipsync_pipeline: "v204_preclip_bbox_clipspace" },
      );
    }

    // v204 — Preclip wire is the canonical multi-speaker path (rolled back v203 block).

    // v129.1 — Payload-Contract Preflight (DISPATCH_BLOCKED_PAYLOAD_PRECHECK).
    // Refuses to call Sync.so when a Multi-Speaker preclip pass would either:
    //  (a) send auto_detect:true despite persisted plate-space coords + crop, or
    //  (b) carry transformed coordinates that fall outside the preclip canvas, or
    //  (c) be missing the coords/crop required for the v106 doc-strict transform.
    // No retry. Idempotent refund via failBeforeProviderDispatch.
    // See docs/lipsync/v129-implementation.md.
    const v1291Diag = (pass as any)._v1291 ?? null;
    const v1291Block = (pass as any)._v1291_block ?? null;
    const v1291Ambig = (pass as any)._v1291_ambiguity ?? null;
    if (usePassPreclip && speakers.length >= 2) {
      const hasCoords = !!v1291Diag && Array.isArray(v1291Diag.plate_coords);
      const wouldAutoDetect = asdForProbe?.auto_detect === true;
      // v129.24 — auto_detect:true on a single-face preclip is now the
      // CORRECT path (reproduced 2026-06-18: explicit ASD coords cause
      // `generation_unknown_error` while auto_detect succeeds). The legacy
      // v129.2.1 block treated `wouldAutoDetect && hasCoords` as a contract
      // violation — invert that: it's only a violation when the preclip
      // ALSO has more than one face (genuine ambiguity).
      const rawPassFc = (pass as any).preclip_face_count;
      const passFcNum =
        rawPassFc === null || rawPassFc === undefined || !Number.isFinite(Number(rawPassFc))
          ? null
          : Number(rawPassFc);
      // v129.25 — clean crop with unknown face_count is also "unambiguous".
      // Only confirmed multi-face crops force the explicit-ASD path.
      const ambiguityCleanPre =
        v1291Ambig === null || v1291Ambig?.risk === "clean";
      const preclipUnambiguous =
        ambiguityCleanPre && passFcNum !== 0 && !(passFcNum !== null && passFcNum > 1);
      const ambiguousAutoDetect =
        wouldAutoDetect &&
        !!v1291Ambig?.sibling_centers_inside_crop &&
        !preclipUnambiguous;
      const wrongAutoDetect =
        hasCoords && wouldAutoDetect && !preclipUnambiguous;
      if (v1291Block || wrongAutoDetect || ambiguousAutoDetect) {
        const reasonLabel = v1291Block
          ? v1291Block.reason
          : ambiguousAutoDetect
            ? "auto_detect_with_ambiguous_crop"
            : "auto_detect_with_persisted_coords";
        return await failBeforeProviderDispatch(
          "DISPATCH_BLOCKED_PAYLOAD_PRECHECK",
          "internal_payload_contract_violation",
          `v129.24 preflight blocked dispatch: ${reasonLabel}`,
          500,
          {
            v1291: v1291Diag,
            v1291_block: v1291Block,
            v1291_ambiguity: v1291Ambig,
            v105_probe: v105Probe,
            preclip_face_count: passFcNum,
            provider_call_made: false,
            refund_reason: "dispatch_blocked_payload_precheck",
          },
        );
      }
    }

    console.log(
      `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} v105_doc_strict ${JSON.stringify(v105Probe)} tight=${tightAudioInfo ? `${tightAudioInfo.durSec.toFixed(2)}s` : "none"} windows=${JSON.stringify(speakerWindowsSecs)} turnStartFrame=${startFrame}`,
    );

    // ── Length sanity log ────────────────────────────────────────────────
    // compose-twoshot-audio writes mono 16-bit WAV @ 44.1kHz → ~88200 bytes/sec
    // (+ 44 byte header). Use the audio probe's Content-Length to estimate the
    // per-speaker track duration and warn loudly if it's shorter than the
    // scene plate — that's the classic "video stops mid-way" cause because
    // Sync.so cut_off trims to the shorter input.
    const WAV_BYTES_PER_SEC = 44100 * 1 * 2;
    const audioProbeIdx = passSpeakers.findIndex(({ originalIdx }) => originalIdx === pass.speaker_idx);
    const audioProbeBytes = audioProbeIdx >= 0 ? (audioProbes[audioProbeIdx]?.bytes ?? 0) : 0;
    const audioApproxSec = audioProbeBytes > 44
      ? Math.round(((audioProbeBytes - 44) / WAV_BYTES_PER_SEC) * 100) / 100
      : null;
    const videoBytes = videoProbe?.bytes ?? 0;
    const lengthMismatch =
      audioApproxSec !== null && audioApproxSec + 0.5 < totalSec;
    if (lengthMismatch) {
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} LENGTH_MISMATCH pass=${currentPassIdx + 1} ` +
        `audio≈${audioApproxSec}s < expected ${totalSec}s — Sync.so will truncate output. ` +
        `Re-run compose-twoshot-audio to re-pad per-speaker tracks.`,
      );
    }
    console.log(
      `[compose-dialog-segments] scene=${sceneId} DISPATCH pass=${currentPassIdx + 1}/${passes.length} ` +
      `speaker=${pass.speaker_name} coords=${JSON.stringify(pass.coords)} ` +
      `totalSec=${totalSec} audio≈${audioApproxSec}s videoBytes=${videoBytes} ` +
      `variant=${retryVariant} model=${payload.model} diagnostic=${diagnosticId} ` +
      `frame=${referenceFrameNumber} sync_mode=${String(syncOptions.sync_mode)} input=${dispatchVideoUrl.slice(0, 80)} audio=${pass.audio_url.slice(0, 80)}`,
    );

    // v129.9 — Live Face-Gate: run Gemini Vision on the EXACT video URL
    // + frame + coord we are about to send. If Gemini is confident the
    // promise won't hold (no_face / yes_but_not_at_coord / multi_face in
    // multi-speaker context) refund + fail BEFORE we burn a Sync.so credit.
    // v254 — `attempt` is initialized at the top of the per-pass scope. Value
    // is 0 here because the provider retry loop has not started yet.
    {
      const gateAsd: any = (syncOptions as any)?.active_speaker_detection ?? {};
      const gateFrame: number | null = Number.isFinite(gateAsd?.frame_number)
        ? Number(gateAsd.frame_number)
        : (Number.isFinite(referenceFrameNumber) ? Number(referenceFrameNumber) : null);
      const gateCoord: [number, number] | null = Array.isArray(gateAsd?.coordinates) && gateAsd.coordinates.length >= 2
        ? [Number(gateAsd.coordinates[0]), Number(gateAsd.coordinates[1])]
        : null;
      const gateMulti = speakers.length >= 2;
      const preclipDimsForGate = (pass as any).preclip_dims ?? null;
      const preclipCropForGate = (pass as any).preclip_crop ?? null;
      const gateWidth = usePassPreclip
        ? Number(preclipDimsForGate?.width ?? preclipCropForGate?.outputSize ?? 0)
        : Number(plateDims?.width ?? 0);
      const gateHeight = usePassPreclip
        ? Number(preclipDimsForGate?.height ?? preclipCropForGate?.outputSize ?? 0)
        : Number(plateDims?.height ?? 0);
      const preclipTrustedForGate = usePassPreclip &&
        Number((pass as any).preclip_face_count ?? 0) === 1 &&
        String((pass as any)._v1291_ambiguity?.risk ?? "clean") === "clean";
      // v136 — Always run the face-gate. The previous "auto_detect preclip
      // trusted" short-circuit (v131.4) is gone because we no longer dispatch
      // auto_detect on preclips; we send explicit center coords and the gate
      // (+ Sync.so auto-snap) is the safety net against drift.
      const gate = await verifyFaceBeforeDispatch({
        videoUrl: dispatchVideoUrl,
        frameNumber: gateFrame,
        coord: gateCoord,
        isMultiSpeakerContext: gateMulti,
        // v129.22.3 — enable auto-snap on heuristic/inferred coords
        plateWidth: Number.isFinite(gateWidth) && gateWidth > 0 ? gateWidth : undefined,
        plateHeight: Number.isFinite(gateHeight) && gateHeight > 0 ? gateHeight : undefined,
        prebuiltFrameUrl: typeof (pass as any).probe_frame_url === "string" ? (pass as any).probe_frame_url : undefined,
        userId,
        projectId: String((scene as any).project_id ?? "shared"),
        sceneId,
        passIdx: currentPassIdx,
        preclipTrusted: preclipTrustedForGate,
        // V538 C — the v400 gate (V461 A, ~line 9539) already passed for this
        // pass; failing it here would terminalize a dispatch that satisfies
        // the authoritative input contract. Only a LARGER competing face
        // still fails closed.
        v461Passed: v461Gate.ok === true,
      });
      if (gate.frame_jpeg_url) {
        (pass as any).probe_frame_url = gate.frame_jpeg_url;
        (pass as any).probe_frame_cached = !!gate.frame_cached;
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v129.23.2_face_gate pass=${currentPassIdx + 1} source=${usePassPreclip ? "preclip" : "plate"} preclip_trusted=${preclipTrustedForGate} dims=${gateWidth || "?"}x${gateHeight || "?"} code=${gate.code} ok=${gate.ok} extract_ms=${gate.extract_ms ?? 0} gemini_ms=${gate.gemini_ms ?? 0} jpeg=${gate.frame_jpeg_url ? "yes" : "no"} snap=${gate.snapped_coord ? JSON.stringify(gate.snapped_coord) : "no"} reason=${gate.reason ?? ""} reply="${gate.raw_reply ?? ""}"`,
      );
      // ── v130 — Post-Probe Snap as a Re-Invocation of the Same Strategy ──
      // Previously (v129.22.3 → v129.30) the Face-Gate's `ok_after_snap`
      // branch was an ad-hoc patch: it overwrote `syncOptions` and
      // `payload.options` inline, with shape decisions duplicated from
      // Block A. That created two sources of truth and was the root
      // cause of "Snap-Kandidat erkannt, noch nicht im Dispatch
      // angewandt" (v124 sanitizer stripping mismatched coords).
      //
      // v130 collapses this: when the gate snaps, we re-invoke the SAME
      // `buildAsdStrategy` function with the snapped coord injected as a
      // `preflight` input. The strategy returns mode `preflight_coord`
      // with a doc-strict ASD — structurally identical to a fresh
      // first-attempt dispatch where preflight had succeeded. Single
      // source of truth, no shape drift possible.
      if (gate.ok && gate.code === "ok_after_snap" && Array.isArray(gate.snapped_coord)) {
        const snappedCoord: [number, number] = [Number(gate.snapped_coord[0]), Number(gate.snapped_coord[1])];
        const snapFrame: number = Number.isFinite(gateFrame as number) ? Number(gateFrame) : 0;
        if (!usePassPreclip) (pass as any).coords = snappedCoord;
        else (pass as any).dispatch_coords_snapped = snappedCoord;
        (pass as any).coords_snapped_at = new Date().toISOString();
        (pass as any).coords_snap_origin = gate.original_coord ?? null;
        (pass as any).coords_snap_space = usePassPreclip ? "preclip" : "plate";
        (pass as any).snap_applied_to_dispatch = true;
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v140_snap_recorded_no_payload_mutation pass=${currentPassIdx + 1} snapped=[${snappedCoord[0]},${snappedCoord[1]}] frame=${snapFrame} space=${usePassPreclip ? "preclip" : "plate"}`,
        );
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: snappedCoord, frame_number: snapFrame,
          http_status: 0, sync_status: "COORD_AUTO_SNAPPED",
          error_class: "coord_auto_snap",
          error_message: (gate.reason ?? "auto_snapped").slice(0, 240),
          ...preclipMetricsForPass(pass as any, attempt, usePassPreclip),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v130",
              code: gate.code,
              snapped_coord: snappedCoord,
              original_coord: gate.original_coord ?? gateCoord,
              snap_distance_px: gate.snap_distance_px ?? null,
              frame_jpeg_url: gate.frame_jpeg_url,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            snap_applied_to_dispatch: true,
            asd_strategy: {
              mode: "snap_recorded_no_payload_mutation",
              source: "face_gate",
              coord_space: usePassPreclip ? "preclip" : "plate",
              diagnostics: { reason: "v140_single_wire_builder_prevents_late_asd_mutation" },
            },
            source: "preflight-snap",
          },
        });
      }

      // Honest non-blocking signal: when the Lovable AI gateway can't probe
      // (extract failure or transient 5xx), log it but let the dispatch
      // through. The Forensik UI surfaces this clearly so we don't silently
      // pretend the probe passed.
      if (gate.ok && gate.code === "probe_unavailable") {
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: gateCoord, frame_number: gateFrame,
          http_status: gate.http_status ?? 0, sync_status: "FACE_GATE_PROBE_UNAVAILABLE",
          error_class: "face_probe_unavailable",
          error_message: (gate.reason ?? "face_probe_unavailable").slice(0, 240),
          ...preclipMetricsForPass(pass as any, attempt, usePassPreclip),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v129.23.2",
              code: gate.code,
              reason: gate.reason,
              raw_reply: gate.raw_reply,
              raw_error: gate.raw_error,
              http_status: gate.http_status,
              frame_jpeg_url: gate.frame_jpeg_url,
              frame_cached: gate.frame_cached,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            non_blocking: true,
          },
        });
      }
      if (!gate.ok) {
        const reason = `face_gate_${gate.code}:${(gate.reason ?? "").slice(0, 180)}`;
        await logSyncDispatch(supabase, {
          scene_id: sceneId, user_id: userId, engine: "sync-segments",
          sync_source_kind: "segments", video_url: dispatchVideoUrl,
          coords: gateCoord, frame_number: gateFrame,
          http_status: 0, sync_status: "FACE_GATE_BLOCKED",
          error_class: "face_validation_failed",
          error_message: reason,
          ...preclipMetricsForPass(pass as any, attempt, usePassPreclip),
          meta: {
            diagnostic_id: diagnosticId,
            retry_variant: retryVariant,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            face_gate: {
              version: "v129.23.2",
              code: gate.code,
              reason: gate.reason,
              raw_reply: gate.raw_reply,
              frame_jpeg_url: gate.frame_jpeg_url,
              frame_cached: gate.frame_cached,
              extract_ms: gate.extract_ms,
              gemini_ms: gate.gemini_ms,
            },
            outbound_payload_intent: { model: payload.model, options: payload.options },
          },
        });
        pass.status = "failed";
        pass.error = reason;
        await failLipSync({
          supabase,
          sceneId,
          reason,
          userId,
          refundCredits: totalCost,
          syncApiKey,
        });
        // v431 G3.1b — Face-Gate blockt vor dem Provider-Call.
        await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
          errorCode: "face_gate_blocked",
          outcome: "rejected",
        });
        return json(
          { error: "face_gate_blocked", code: gate.code, reason: gate.reason ?? null, provider_error_code: "no_face_pre_sync" },
          422,
        );
      }
    }

    // ── v140 — Final single wire builder for ASD ────────────────────────
    // From here to `fetch`, the outgoing payload is canonicalized exactly
    // once. No branch may mutate `active_speaker_detection` after this point.
    try {
      const canonicalAsd = normalizeCanonicalAsd(
        (payload.options as any)?.active_speaker_detection ??
          (syncOptions as any)?.active_speaker_detection,
      );
      (syncOptions as any).active_speaker_detection = canonicalAsd;
      (payload.options as any).active_speaker_detection = canonicalAsd;
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v140_ASD_CANONICAL asd=${JSON.stringify(canonicalAsd)}`,
      );
      if ((canonicalAsd as any)?.auto_detect === true) {
        const v153WasPrimary = !!(pass as any)._v153BboxPrimary;
        if (v153WasPrimary) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} v153.3_preclip_overwrite_detected — v153 set bbox-url-pro but ASD was rewritten to auto_detect before wire. retry_variant=${retryVariant} use_pass_preclip=${usePassPreclip} preclip_url=${(pass as any).preclip_url ? "yes" : "no"}`,
          );
        }
        return await failBeforeProviderDispatch(
          "v153_auto_detect_wire_blocked",
          "v153_auto_detect_blocked",
          v153WasPrimary
            ? "v153.3 assert: auto_detect:true reached wire AFTER unified bbox path was active — legacy preclip overwrite still present."
            : "v153.3 assert: auto_detect:true is forbidden in dialog lip-sync; expected bbox-url-pro.",
          500,
          {
            retry_variant: retryVariant,
            plate_hydration_source: plateHydrationSource,
            speaker_plate_boxes: speakerPlateBboxes,
            plate_dims: plateDims,
            is_advance: isAdvance,
            is_retry: isRetry,
            v153_was_primary: v153WasPrimary,
            use_pass_preclip: usePassPreclip,
            had_preclip_url: !!(pass as any).preclip_url,
          },
        );
      }
      if ((canonicalAsd as any)?.auto_detect === false) {
        const hasBoxes = !!(canonicalAsd as any)?.bounding_boxes_url || Array.isArray((canonicalAsd as any)?.bounding_boxes);
        if (!hasBoxes) {
          return await failBeforeProviderDispatch(
            "v201_bbox_required",
            "bbox_required",
            "Dialog lip-sync dispatch is locked to sync-3 + bounding_boxes_url/bounding_boxes. Coordinate-only ASD is blocked to prevent speaker drift.",
            500,
            {
              canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
              speakers_source: speakersSource,
              dialog_turns_count: canonicalDialogTurnsCount,
              final_asd: canonicalAsd,
              retry_variant: retryVariant,
            },
          );
        }
      }
    } catch (canonErr) {
      return await failBeforeProviderDispatch(
        "DISPATCH_BLOCKED_V140_CANONICAL_ASD",
        "canonical_asd_invalid",
        `v140 canonical ASD builder rejected payload: ${(canonErr as Error)?.message ?? canonErr}`,
        500,
        {
          final_asd: (payload.options as any)?.active_speaker_detection ?? null,
          retry_variant: retryVariant,
          compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
        },
      );
    }

    // ── v136 — Doc-strict ASD sanitizer (replaces v131.5 final override) ──
    // With v136 we dispatch explicit preclip-centered coordinates on preclip
    // passes, so the previous "force auto_detect:true at the wire" override
    // no longer applies — that override was the very thing causing Sync.so
    // sync-3 to silently no-op on every speaker. We keep ONLY the mutex
    // sanitizer + the doc-strict shape assertion so that any code path
    // intentionally using auto_detect:true (e.g. the post-snap re-strategy
    // when no coord is available) still sends a legal payload.
    {
      const sanAsd: any = (payload.options as any)?.active_speaker_detection;
      if (sanAsd && sanAsd.auto_detect === true) {
        if ("coordinates" in sanAsd) delete sanAsd.coordinates;
        if ("frame_number" in sanAsd) delete sanAsd.frame_number;
        if ("bounding_boxes" in sanAsd) delete sanAsd.bounding_boxes;
        if ("bounding_boxes_url" in sanAsd) delete sanAsd.bounding_boxes_url;
      }

      const assertAsd: any = (payload.options as any)?.active_speaker_detection;
      if (
        assertAsd?.auto_detect === true &&
        (Array.isArray(assertAsd?.coordinates) || assertAsd?.frame_number != null)
      ) {
        return await failBeforeProviderDispatch(
          "DISPATCH_BLOCKED_V136_ASSERT",
          "asd_auto_detect_with_coords_violation",
          "v136 assert: active_speaker_detection.auto_detect=true must not carry coordinates/frame_number",
          500,
          { final_asd: assertAsd, retry_variant: retryVariant, compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION },
        );
      }
    }

    // v139.1 — Pre-dispatch coords-shape assertion. Sync.so sync-3 expects
    // `coordinates: [x, y]` flat (2 finite numbers). Any other shape (nested,
    // length≠2, non-number) is rejected with HTTP 400 "must contain at least
    // 2 elements". Catch this client-side so we get a clear error code + log
    // instead of a generic Sync.so 400 — and so a future regression like v136
    // is impossible to ship unnoticed.
    {
      const coordsAsd: any = (payload.options as any)?.active_speaker_detection;
      if (coordsAsd && coordsAsd.auto_detect === false) {
        const c = coordsAsd.coordinates;
        const hasBoxes = coordsAsd.bounding_boxes || coordsAsd.bounding_boxes_url;
        const coordsOk =
          Array.isArray(c) &&
          c.length === 2 &&
          c.every((n: unknown) => typeof n === "number" && Number.isFinite(n));
        if (!hasBoxes && !coordsOk) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} BAD_COORDS_SHAPE coords=${JSON.stringify(c)} retry_variant=${retryVariant}`,
          );
          return await failBeforeProviderDispatch(
            "BAD_COORDS_SHAPE",
            "coords_shape_violation",
            `v139.1 assert: active_speaker_detection.coordinates must be flat [x, y] (got ${JSON.stringify(c)})`,
            500,
            { final_asd: coordsAsd, retry_variant: retryVariant, compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION },
          );
        }
        if (coordsOk) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} coords_shape ok=[${c[0]},${c[1]}] frame_number=${coordsAsd.frame_number}`,
          );
        } else if (hasBoxes) {
          const boxesKind = coordsAsd.bounding_boxes_url ? "bounding_boxes_url" : "bounding_boxes";
          console.log(
            `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} coords_shape ok=${boxesKind} frame_number=${coordsAsd.frame_number ?? "n/a"}`,
          );
        }
      }
    }

    // v139.2 — WIRE_PAYLOAD forensik. Logs the EXACT options object that
    // Sync.so will see, immediately before fetch. This is the only way to
    // attribute a Sync.so 400 to a specific shape — every earlier mutation
    // point becomes irrelevant once we have the wire bytes. Truncate to
    // 1500 chars so multi-frame bounding_boxes don't flood the log.
    try {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} WIRE_PAYLOAD version=${COMPOSE_DIALOG_SEGMENTS_VERSION} model=${(payload as any)?.model} options=${JSON.stringify((payload as any)?.options ?? null).slice(0, 1500)}`,
      );
    } catch (_logErr) {
      // never let logging crash dispatch
    }

    // v169 Stage A — Stale-Job Reconcile (best-effort, ≤500ms). Frees Sync.so
    // concurrency slots held by zombie jobs from earlier failed runs so this
    // dispatch doesn't hit a spurious 429.
    try {
      await reconcileStaleSyncJobs(supabase, {
        userId,
        syncApiKey,
        apiBase: SYNC_API_BASE,
      });
    } catch (_e) {
      // never block dispatch on reconcile
    }

    // v169 Stage B — 429-Backoff. Sync.so concurrency_limit_reached is
    // transient (other passes in this scene or a parallel scene). Retry
    // identical payload up to 3× with exponential backoff + jitter before
    // falling through to the existing dispatch-failure path.
    // ══ V510-P0 — LATE FAN-OUT FENCE ═══════════════════════════════════
    //
    // The V459 fence sits ~3800 lines and dozens of awaits earlier, before
    // preclip rendering, Rekognition, Lambda and every upload. It saves
    // work; it cannot prevent payment. In generation 10 pass 1 cleared that
    // fence while the run was healthy, spent minutes in preflight, and
    // dispatched into a run that had terminalized AND refunded in between.
    //
    // This is the last statement before money is spent, so the question it
    // asks is the only one that matters here: is the run STILL open?
    {
      const { data: lateRow } = await supabase
        .from("composer_scenes").select("dialog_shots").eq("id", sceneId).maybeSingle();
      const lateState: any = (lateRow as any)?.dialog_shots ?? null;
      const lateGate = mayDispatchProvider({
        dialogShots: lateState,
        runId: v510RunId,
        fanoutClosed: isFanoutClosed(lateState),
      });
      if (!lateGate.ok) {
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v510_late_fanout_fence blocked reason=${lateGate.reason} — no provider call`,
        );
        // Own slot only, and no refund: the pass that terminalized the run
        // already settled the money. Leaving this slot `rendering_preflight`
        // would make the watchdog re-kick a dead run forever.
        await supabase.rpc("update_dialog_pass_slot", {
          _scene_id: sceneId,
          _pass_idx: currentPassIdx,
          _patch: {
            status: "failed",
            late_fanout_fence: "blocked",
            late_fanout_fence_reason: lateGate.reason,
            last_error: `v510_${lateGate.reason}`,
            last_error_class: "v510_late_fanout_fence",
            finished_at: new Date().toISOString(),
          },
        });
        // Provably never sent to the provider — the same certainty the
        // v431 G3.1b pre-dispatch path claims, and therefore the same
        // ledger outcome. "uncertain" here would leak a phantom job.
        await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
          errorCode: `v510_${lateGate.reason}`,
          outcome: "rejected",
        });
        try {
          await logSyncDispatch(supabase, {
            scene_id: sceneId, user_id: userId, engine: "sync-segments",
            sync_source_kind: "segments", video_url: dispatchVideoUrl,
            sync_status: "LATE_FANOUT_FENCE_BLOCKED",
            error_class: "v510_late_fanout_fence",
            error_message: String(lateGate.reason),
            meta: {
              diagnostic_id: diagnosticId,
              retry_variant: retryVariant,
              pass_idx: currentPassIdx,
              total_passes: passes.length,
              run_id: v510RunId,
              late_fanout_fence: "blocked",
            },
          });
        } catch { /* never block the fence on logging */ }
        return json({
          ok: true,
          skipped: lateGate.reason,
          late_fanout_fence: "blocked",
          scene_id: sceneId,
          pass_idx: currentPassIdx,
        }, 202);
      }
    }

    const BACKOFFS_MS = [4_000, 10_000, 22_000];
    let resp: Response;
    // v253 — `attempt` is hoisted above the face-gate block; reset here.
    attempt = 0;
    while (true) {
      resp = await fetch(`${SYNC_API_BASE}/generate`, {
        method: "POST",
        headers: { "x-api-key": syncApiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status !== 429 || attempt >= BACKOFFS_MS.length) break;
      const base = BACKOFFS_MS[attempt];
      const jitter = Math.floor(Math.random() * (base * 0.2));
      const waitMs = base + jitter;
      attempt++;
      console.warn(
        `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx} 429_RETRY attempt=${attempt}/${BACKOFFS_MS.length} backoff_ms=${waitMs}`,
      );
      try { await resp.body?.cancel(); } catch (_e) { /* ignore */ }
      await new Promise((r) => setTimeout(r, waitMs));
    }


    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      // v139.2 — Correlate failure with the wire shape that triggered it.
      // Re-log options on failure so request+response sit in one query.
      console.error(
        `[compose-dialog-segments] scene=${sceneId} dispatch FAILED pass=${currentPassIdx} status=${resp.status} body=${errTxt.slice(0, 600)} wire_options=${JSON.stringify((payload as any)?.options ?? null).slice(0, 800)}`,
      );
      // Refund only if no previous pass succeeded (i.e. this is pass 0 fresh
      // dispatch) — if a later pass fails, we still refund the full cost since
      // the partial output is unusable.
      const alreadyRefunded = !!(prevState as any)?.refunded;
      if (!alreadyRefunded) {
        const { data: w2 } = await supabase
          .from("wallets").select("balance").eq("user_id", userId).single();
        await supabase
          .from("wallets")
          .update({
            balance: Number(w2?.balance ?? 0) + totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      pass.status = "failed";
      pass.error = `dispatch_${resp.status}:${errTxt.slice(0, 200)}`;
      // ── V510-P0 — same lost-update class as the pre-dispatch failure ──
      // This site runs AFTER the provider call, so by construction siblings
      // have had even longer to write their job ids. Own slot only.
      await v510Terminalize({
        passIdx: currentPassIdx,
        passPatch: buildTerminalPassPatch({
          reason: String(pass.error),
          errorClass: classifySyncError(errTxt),
          diagnostics: {
            diagnostic_id: diagnosticId,
            http_status: resp.status,
            v510_terminalized_by: "provider_dispatch_http_failure",
          },
        }),
        rootPatch: {
          version: 5,
          engine: "sync-segments",
          status: "failed",
          current_pass: currentPassIdx,
          total_passes: passes.length,
          multi_pass: passes.length > 1,
          source_clip_url: sourceClipUrl,
          total_sec: totalSec,
          segments: pass.segments,
          cost_credits: totalCost,
          refunded: !alreadyRefunded,
          error: pass.error,
          finished_at: new Date().toISOString(),
        },
        scenePatch: {
          lip_sync_status: "failed",
          twoshot_stage: "failed",
          clip_error: resp.status === 429
            ? "syncso_concurrency_exhausted"
            : `syncso_segments_dispatch_${resp.status}`,
        },
        reason: String(pass.error),
      });
      await logSyncDispatch(supabase, {
        scene_id: sceneId, user_id: userId, engine: "sync-segments",
        sync_source_kind: "segments", video_url: dispatchVideoUrl,
        http_status: resp.status, sync_status: "DISPATCH_FAILED",
        error_class: classifySyncError(errTxt),
        error_message: errTxt.slice(0, 500),
        ...preclipMetricsForPass(pass as any, attempt, usePassPreclip),
        meta: { diagnostic_id: diagnosticId, retry_variant: retryVariant, pass_idx: currentPassIdx, total_passes: passes.length, payload_summary: payload, v249_preclip_metrics_persisted: true },
      });
      await recordCircuitFailure(supabase, "sync.so", classifySyncError(errTxt));
      // v431 G3.1b — 4xx = bewiesene Ablehnung; 429/5xx/unklar = recoverable.
      await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
        errorCode: `syncso_dispatch_${resp.status}`,
        outcome: resp.status >= 400 && resp.status < 500 && resp.status !== 429
          ? "rejected"
          : "uncertain",
      });
      return json(
        { error: "syncso_dispatch_failed", status: resp.status, body: errTxt.slice(0, 400) },
        502,
      );
    }

    const data = await resp.json();
    const shape = validateSyncResponseShape(data);
    if (!shape.ok) {
      console.error(
        `[compose-dialog-segments] scene=${sceneId} SCHEMA_DRIFT missing=${shape.missingKeys.join(",")}`,
      );
      await emitSystemAlert(supabase, {
        alert_type: "syncso_schema_drift", severity: "critical", source: "sync.so",
        message: `Sync.so /generate response missing keys: ${shape.missingKeys.join(", ")}`,
        payload: { missing_keys: shape.missingKeys, sample: data },
      });
      // Antwort unlesbar ⇒ der Provider kann den Auftrag dennoch angenommen
      // haben: Ungewissheit darf nicht terminalisiert werden.
      await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
        errorCode: "syncso_schema_drift",
        outcome: "uncertain",
      });
      return json({ error: "schema_drift", missing: shape.missingKeys }, 502);
    }
    const jobId = String(data.id ?? "");
    if (!jobId) {
      await settleLedgerDispatchFailure(supabase, v431SyncLedgerJob?.id ?? null, {
        errorCode: "syncso_no_job_id",
        outcome: "uncertain",
      });
      return json({ error: "no_job_id" }, 502);
    }

    await registerInflightSyncJob(supabase, {
      job_id: jobId, user_id: userId, scene_id: sceneId, engine: "sync-segments",
    });
    await recordCircuitSuccess(supabase, "sync.so");

    // v431 G3.1f — Ledger-Bindung und Transport-Pointer entstehen atomar in
    // EINER Transaktion; der Pass-Index wird gegen die Ledger-Identität geprüft.
    // Ohne Ledger-Zeile bleibt der Legacy-Pfad (nur `job_id`) bestehen.
    if (v431SyncLedgerJob?.id) {
      await bindSyncPassAttempt(supabase, {
        pipelineJobId: v431SyncLedgerJob.id,
        sceneId,
        passIdx: currentPassIdx,
        externalJobId: jobId,
      });
      (pass as any).pipeline_job_id = v431SyncLedgerJob.id;
    }
    pass.job_id = jobId;
    passes[currentPassIdx] = pass;

    // ── V510-P0 — provider accepted DURING terminalization ─────────────
    //
    // The late fence closes the window; it does not make it zero. If a
    // sibling terminalized between the fence and this 201, the job is real
    // and billable, so the correct move is the opposite of discarding it:
    // record it. The slot write below and the ledger binding above are what
    // let the webhook reconcile it and the watchdog cancel it — dropping
    // the id here would create exactly the unreconcilable phantom job the
    // fence exists to prevent.
    //
    // What must NOT happen is the root going back to `running`. That is
    // refused inside composer_touch_dialog_run_progress, under the row
    // lock — not by this check, which only records why.
    let v510AcceptedAfterTerminal = false;
    {
      const { data: raceRow } = await supabase
        .from("composer_scenes").select("dialog_shots").eq("id", sceneId).maybeSingle();
      const raceState: any = (raceRow as any)?.dialog_shots ?? null;
      if (isRunTerminal(raceState, v510RunId) || isFanoutClosed(raceState)) {
        v510AcceptedAfterTerminal = true;
        (pass as any).v510_accepted_after_terminal = true;
        (pass as any).v510_accepted_after_terminal_at = new Date().toISOString();
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v510_accepted_after_terminal job=${jobId} — job id recorded, root stays terminal`,
        );
      }
    }


    const nowIso = new Date().toISOString();
    // v59 — Preserve v58 multipass markers across every state write so a
    // pass-level retry cannot accidentally fall back into the broken
    // sync-3 segments[] path. Source of truth is the body flag OR any
    // previously-stored marker on the scene state.
    // FROZEN — see mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.3)
    const prevForceMultipass =
      (prevState as any)?.force_multipass === true ||
      (existing as any)?.force_multipass === true;
    const prevMultipassAttempted =
      (prevState as any)?.multipass_fallback_attempted === true ||
      (existing as any)?.multipass_fallback_attempted === true;
    // v60 — For every multi-speaker scene (N≥2) the chained per-speaker
    // pipeline is the canonical path. Set the sticky markers from the
    // very first state write so any later retry (pass-level, scene-level,
    // webhook-triggered) cannot accidentally route back into the v56
    // segments[] dispatch. FROZEN — see FROZEN-INVARIANTS.md (I.1, I.3)
    const isMultiSpeakerV60 = speakers.length >= 2;
    const carryForceMultipass = forceMultipass || prevForceMultipass || isMultiSpeakerV60;
    const carryMultipassAttempted = forceMultipass || prevMultipassAttempted || isMultiSpeakerV60;
    // Soft-log invariant guard: if prev state had a marker but neither the
    // carry nor the body flag would re-emit it, that is a regression.
    if (
      (prevForceMultipass && !carryForceMultipass) ||
      (prevMultipassAttempted && !carryMultipassAttempted)
    ) {
      console.error(
        `INVARIANT_VIOLATION_v59_state_carryover scene=${sceneId} prevForce=${prevForceMultipass} prevAttempted=${prevMultipassAttempted} carryForce=${carryForceMultipass} carryAttempted=${carryMultipassAttempted} — see FROZEN-INVARIANTS.md I.3`,
      );
    }
    const state: SegmentsState = {
      version: 5,
      engine: "sync-segments",
      status: "rendering",
      multi_pass: passes.length > 1,
      passes,
      current_pass: currentPassIdx,
      total_passes: passes.length,
      sync_job_id: jobId,
      source_clip_url: sourceClipUrl,
      total_sec: totalSec,
      segments: pass.segments,
      cost_credits: isRetry || isAdvance ? Number(prevState?.cost_credits ?? totalCost) : totalCost,
      refunded: false,
      started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      first_started_at: prevState?.first_started_at ?? prevState?.started_at ?? nowIso,
      retry_count: Number(prevState?.retry_count ?? 0),
      retry_variant: retryVariant,
      fallback_history: prevState?.fallback_history ?? [],
      last_diagnostic_id: diagnosticId,
      final_url: null,
      // Plate dims (probed once on pass 0) — render-sync-segments-audio-mux
      // uses these for the Lambda canvas; multi-speaker fix uses them so
      // pickSpeakerCoordinates produces plate-space coords.
      video_width: videoDims.width,
      video_height: videoDims.height,
      plate_identity: v153PlateIdentitySnapshot,
      // v59 carry-over: keep multipass markers across retries.
      ...(carryForceMultipass ? { force_multipass: true } : {}),
      ...(carryMultipassAttempted ? { multipass_fallback_attempted: true } : {}),
      ...((prevState as any)?.multipass_fallback_reason
        ? { multipass_fallback_reason: (prevState as any).multipass_fallback_reason }
        : {}),
    } as SegmentsState;

    // v129.4b — Provider Input Fingerprint (telemetry only).
    // Single structured block per dispatch so a future Sync.so support
    // bundle can be assembled from `syncso_dispatch_log` alone, without
    // grepping edge logs or replaying probes. No behaviour change.
    const hashUrl = async (u: string | null | undefined): Promise<string | null> => {
      if (!u || typeof u !== "string") return null;
      try {
        const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(u));
        return Array.from(new Uint8Array(buf)).slice(0, 6)
          .map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch { return null; }
    };
    const fpAudioDiag = audioDiagnostics.find((dx) => dx.pass === pass.idx) as any;
    const fpNorm = (pass as any).audio_normalization ?? null;
    const fpVideoUrl = dispatchVideoUrl;
    const fpAudioUrl = ((pass as any).sync_audio_url ?? pass.audio_url) as string;
    const fpAsd: any = (syncOptions as any).active_speaker_detection ?? {};
    const fpVideoDurSec = typeof (pass as any).preclip_duration_sec === "number"
      ? Number((pass as any).preclip_duration_sec)
      : null;
    // ── V461 C — the telemetry must describe the file that was ACTUALLY
    // dispatched. Pre-clip dispatches used to inherit the plate probe
    // (1284×718 / 4.8 MB) although 720×720 / ~470 kB went over the wire.
    // Unknown is now reported as `null` — never as a plate value.
    const v461DispatchProbe = usePassPreclip
      ? await probeAsset(dispatchVideoUrl, "video", 10_000).catch(() => null)
      : videoProbe;
    const v461VideoTelemetry = buildDispatchVideoTelemetry({
      url: dispatchVideoUrl,
      probeBytes: v461DispatchProbe?.bytes ?? null,
      probeContentType: v461DispatchProbe?.contentType ?? null,
      preclipOutputSize: usePassPreclip
        ? Number((pass as any).preclip_crop?.outputSize ?? 0) || null
        : null,
      width: usePassPreclip
        ? ((pass as any).preclip_dims?.width ?? null)
        : (plateDims?.width ?? videoDims?.width ?? null),
      height: usePassPreclip
        ? ((pass as any).preclip_dims?.height ?? null)
        : (plateDims?.height ?? videoDims?.height ?? null),
    });
    const fpVideoDims = v461VideoTelemetry.width && v461VideoTelemetry.height
      ? { width: v461VideoTelemetry.width, height: v461VideoTelemetry.height }
      : null;
    const fpVideoFps = Number((pass as any).preclip_fps ?? 30) || 30;
    const fpVideoFrameCount = Number((pass as any).preclip_frame_count ?? 0) ||
      (fpVideoDurSec != null ? Math.max(1, Math.ceil(fpVideoDurSec * fpVideoFps)) : null);
    const fpAsdCoords = Array.isArray(fpAsd.coordinates) ? fpAsd.coordinates : null;
    const fpAsdInBounds = (() => {
      if (!fpAsdCoords || !fpVideoDims) return null;
      const w = Number(fpVideoDims?.width ?? 0);
      const h = Number(fpVideoDims?.height ?? 0);
      if (!w || !h) return null;
      const [x, y] = fpAsdCoords;
      return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x < w && y >= 0 && y < h;
    })();
    const providerInputFingerprint = {
      model: payload.model,
      sync_mode: (syncOptions as any).sync_mode ?? null,
      dispatch_video_kind: usePassPreclip ? "preclip" : "full_plate",
      // V461 B — semantic vs. transport identity of this dispatch.
      semantic_fingerprint: v461Fingerprint.semantic,
      transport_fingerprint: v461Fingerprint.transport,
      fingerprint_version: v461Fingerprint.version,
      fingerprint_parts: v461Fingerprint.parts,
      face_gate: (pass as any).v461_face_gate ?? null,
      video: {
        url_hash: await hashUrl(fpVideoUrl),
        object_path: v461VideoTelemetry.object_path,
        duration_sec: fpVideoDurSec,
        width: v461VideoTelemetry.width,
        height: v461VideoTelemetry.height,
        dims_source: v461VideoTelemetry.source,
        fps: fpVideoFps,
        frame_count: fpVideoFrameCount,
        bytes: v461VideoTelemetry.bytes,
        content_type: v461VideoTelemetry.content_type,
      },
      audio: {
        url_hash: await hashUrl(fpAudioUrl),
        normalized: !!(pass as any).sync_audio_url,
        duration_sec: fpAudioDiag?.wav?.durSec ?? null,
        lead_in_sec: fpAudioDiag?.wav?.leadInSec ?? null,
        voiced_end_sec: fpNorm?.last_voiced_sec_after_trim ?? null,
        peak_dbfs: fpAudioDiag?.wav?.peakDbFs ?? null,
        sample_rate: fpAudioDiag?.wav?.sampleRate ?? null,
        channels: fpAudioDiag?.wav?.channels ?? null,
        bits_per_sample: fpAudioDiag?.wav?.bitsPerSample ?? null,
        codec: "pcm_s16le",
        bytes: audioProbes[audioProbeIdx]?.bytes ?? null,
      },
      asd: {
        auto_detect: !!fpAsd.auto_detect,
        frame_number: fpAsd.frame_number ?? null,
        coordinates: fpAsdCoords,
        has_bounding_boxes_url: !!fpAsd.bounding_boxes_url,
        has_bounding_boxes_inline: Array.isArray(fpAsd.bounding_boxes),
        coord_in_bounds: fpAsdInBounds,
      },
      preclip_ambiguity: (pass as any)._v1291_ambiguity ?? null,
      speakers: speakers.length,
      retry_variant: retryVariant,
      v1294_fingerprint: true,
    };

    await logSyncDispatch(supabase, {
      scene_id: sceneId, user_id: userId, engine: "sync-segments",
      job_id: jobId, sync_source_kind: "segments",
      video_url: dispatchVideoUrl,
      video_bytes: videoProbe.bytes,
      video_content_type: videoProbe.contentType,
      // v129.9 — Persist final ASD top-level so syncso-preflight reads the
      // exact frame/coord we sent (not stale pass.coords).
      coords: Array.isArray((syncOptions as any)?.active_speaker_detection?.coordinates)
        ? (syncOptions as any).active_speaker_detection.coordinates as [number, number]
        : (Array.isArray(pass.coords) ? pass.coords as [number, number] : null),
      frame_number: Number.isFinite((syncOptions as any)?.active_speaker_detection?.frame_number)
        ? Number((syncOptions as any).active_speaker_detection.frame_number)
        : (Number.isFinite(referenceFrameNumber) ? Number(referenceFrameNumber) : null),
      window_start_sec: 0, window_end_sec: totalSec,
      // v134 §3 — Populate dedicated turn_idx column so SQL forensics no longer
      // requires pulling pass_idx out of meta JSON.
      turn_idx: Number.isFinite(currentPassIdx) ? Number(currentPassIdx) : null,
      http_status: resp.status, sync_status: "DISPATCHED",
      ...preclipMetricsForPass(pass as any, attempt, usePassPreclip),
      meta: {
        v249_preclip_metrics_persisted: true,
        // v131.5 — version pin for forensic attribution
        compose_version: COMPOSE_DIALOG_SEGMENTS_VERSION,
        canonical_lipsync_pipeline: speakers.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
        speakers_source: speakersSource,
        dialog_turns_count: canonicalDialogTurnsCount,
        canonical_speaker_ids: canonicalSpeakerIds,
        asd_mode: (payload.options as any)?.active_speaker_detection?.bounding_boxes_url
          ? "bounding_boxes_url"
          : Array.isArray((payload.options as any)?.active_speaker_detection?.bounding_boxes)
            ? "bounding_boxes"
            : (payload.options as any)?.active_speaker_detection?.coordinates
              ? "coordinates"
              : (payload.options as any)?.active_speaker_detection?.auto_detect
                ? "auto_detect"
                : "unknown",
        v131_5_final_override: (pass as any)._v131_5_final_override ?? null,
        input_space: dispatchInputSpace,
        preclip_used: usePassPreclip,
        fullplate_bbox_only: false,
        diagnostic_id: diagnosticId,
        pass_idx: currentPassIdx,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        character_id: pass.character_id,
        coords: pass.coords,
          reference_frame_number: referenceFrameNumber,
          face_repair: pass.face_repair ?? null,
          audio_repair: (pass as any).audio_repair ?? null,
        retry_variant: retryVariant,
        model: payload.model,
        is_retry: isRetry,
        is_advance: isAdvance,
        face_map_source: faceMap?.source ?? null,
        sync_mode: syncOptions.sync_mode,
        audio_approx_sec: audioApproxSec,
        expected_total_sec: totalSec,
        length_mismatch: lengthMismatch,
        audio_probe: audioProbes[audioProbeIdx] ?? null,
        final_audio_gate: {
          peak_dbfs: Number.isFinite(finalPeakDbFs) ? finalPeakDbFs : null,
          voiced_sec: Number.isFinite(finalVoicedSec) ? finalVoicedSec : 0,
          longest_voiced_run: Number.isFinite(finalLongestRun) ? finalLongestRun : 0,
        },
        // v116 (Fix D) — per-pass identity/preclip diagnostics so a future
        // failure can be debugged in <5 min from syncso_dispatch_log alone.
        v116_diag: {
          // v129.1 — asd_mode now reflects doc-strict coordinate dispatch.
          // For multi-speaker preclip passes the value is
          // "preclip_coords_doc_strict" (was "preclip_auto_detect" in v116).
          asd_mode: (() => {
            const asd = (syncOptions as any).active_speaker_detection ?? {};
            if (usePassPreclip) {
              if (asd.auto_detect === false && Array.isArray(asd.coordinates)) {
                return "preclip_coords_doc_strict";
              }
              if (asd.bounding_boxes_url) return "preclip_bbox_url";
              if (Array.isArray(asd.bounding_boxes)) return "preclip_bbox_inline";
              return "preclip_auto_detect";
            }
            if (asd.bounding_boxes_url) return "bbox_url";
            if (asd.bounding_boxes) return "bbox_inline";
            if (asd.coordinates) return "coords_point";
            return "auto_detect";
          })(),
          coords_sent: syncOptions.active_speaker_detection?.coordinates ?? null,
          preclip_face_count: (pass as any).preclip_face_count ?? null,
          preclip_crop: (pass as any).preclip_crop ?? null,
          preclip_repair_attempts: (pass as any).preclip_repair_attempts ?? 0,
          coord_source: coordSources[Number(pass.speaker_idx ?? -1)] ?? "unknown",
          plate_identity_resolved: plateIdentityMap?.resolvedCount ?? 0,
          plate_identity_total: plateIdentityMap?.faces?.length ?? 0,
          plate_identity_method: (plateIdentityMap as any)?.identityMethod ?? null,
          plate_identity_min_conf: (plateIdentityMap as any)?.minConfidence ?? null,
          plate_identity_min_margin: (plateIdentityMap as any)?.minMargin ?? null,
          plate_identity_cross_check: (plateIdentityMap as any)?.crossCheck ?? null,
          plate_dims: plateDims ?? null,

        },
        // v129.1 — Outbound payload contract evidence. `outbound_payload`
        // captures the EXACT options dispatched to Sync.so (URLs intentionally
        // omitted — they are already on `video_url` / `payload_video_url`).
        // `coord_transform` proves the plate→preclip math per pass.
        v1291_payload_contract: true,
        outbound_payload: {
          model: payload.model,
          options: payload.options,
        },
        coord_transform: (pass as any)._v1291 ?? null,
        v1291_block: (pass as any)._v1291_block ?? null,
        video_probe: videoProbe,
        audio_diagnostics: audioDiagnostics.find((d) => d.pass === pass.idx) ?? null,
        // v102 Step A — alignment probe persisted on every DISPATCHED row so
        // we can query syncso_dispatch_log.meta->'v102_probe' across all
        // failing passes to verify the bbox/video/audio frame-count mismatch
        // hypothesis without grepping edge logs.
        v102_probe: (pass as any)._v102_probe ?? null,
        v103_probe: (pass as any)._v102_probe ?? null,
        v105_probe: (pass as any)._v105_probe ?? null,
        // v131.2 — top-level keys for fast SQL filtering. Always populated:
        // `asd_rule_fired` falls back to the strategy mode when the rule
        // diagnostic isn't set (Rule 3/4/5 don't emit a `rule` key).
        asd_mode_chosen: (pass as any)._v130_asd_strategy?.mode ?? null,
        asd_rule_fired:
          (pass as any)._v1291?.rule ??
          (pass as any)._v130_asd_strategy?.mode ??
          null,
        preclip_trust:
          (pass as any)._v1291?.preclip_trust ??
          (pass as any)._v130_asd_strategy?.preclip_trust ??
          null,

        preclip_duration_sec: (pass as any).preclip_duration_sec ?? null,
        preclip_frame_count: (pass as any).preclip_frame_count ?? null,
        preclip_fps: (pass as any).preclip_fps ?? null,
        preclip_dims: (pass as any).preclip_dims ?? null,
        preclip_crop: (pass as any).preclip_crop ?? null,
        dispatch_video_kind: dispatchVideoKind,

        payload_summary: {
          model: payload.model,
          input_video: dispatchVideoUrl,
          audio: pass.audio_url,
          frame_number: referenceFrameNumber,
          coordinates: pass.coords,
          options: payload.options,
        },
        // v129.4b — Provider input fingerprint (telemetry only, no behavior).
        provider_input_fingerprint: providerInputFingerprint,
      },
    });

    // v168 — Phase 1 of Per-Pass-Lock rollout: replace full-row dialog_shots
    // UPDATE with atomic per-slot RPC writes. With Plan-D fan-out, up to N
    // parallel dispatchers race here; a full-row UPDATE causes Lost-Update
    // (the last writer overwrites sibling-pass job_ids). The RPCs use
    // jsonb_set/||-merge at the row-lock level, so each pass writes only
    // its own slot atomically.
    //
    //   1) update_dialog_pass_slot(scene, pass_idx, patch)
    //      → writes `dialog_shots.passes[pass_idx] = passes[pass_idx] || patch`
    //   2) update_dialog_shots_root_merge(scene, patch)
    //      → merges root-level fields (cost_credits, fallback_history)
    //        WITHOUT touching `passes[]`. `passes` is stripped defensively.
    //   3) plain UPDATE for top-level scene columns (lip_sync_status,
    //      twoshot_stage, …) — these are idempotent across passes (latest
    //      writer's value is fine for status/diagnostic fields).
    {
      const v510SlotPatch = { ...passRunStamp, ...(pass as Record<string, unknown>) };
      const { error: slotErr } = await supabase.rpc("update_dialog_pass_slot", {
        _scene_id: sceneId,
        _pass_idx: currentPassIdx,
        _patch: v510SlotPatch,
      });
      if (slotErr) {
        // ── V510-P0 — the full-row fallback IS the lost update ──────────
        //
        // The old fallback re-read and re-merged, which narrows the window
        // but does not close it: between the SELECT and the UPDATE a
        // sibling can still land, and its slot is then overwritten from a
        // snapshot that never saw it. A read-modify-write on the same
        // column the RPC exists to protect cannot be the RPC failure path.
        //
        // Retry the atomic write instead. If it still fails, the job id is
        // NOT lost: registerInflightSyncJob recorded it above, and the",
        // ledger binding (pipeline_job_id ↔ external_job_id) is the
        // authoritative reconciliation key the webhook actually uses —
        // `dialog_shots.passes[i].job_id` is a convenience mirror, not the
        // source of truth. Losing the mirror is recoverable; overwriting a
        // sibling job id is not.
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} v168_per_slot_write pass=${currentPassIdx + 1} rpc_error=${slotErr.message} — retrying atomic slot write`,
        );
        const { error: slotRetryErr } = await supabase.rpc("update_dialog_pass_slot", {
          _scene_id: sceneId,
          _pass_idx: currentPassIdx,
          _patch: v510SlotPatch,
        });
        if (slotRetryErr) {
          console.error(
            `[compose-dialog-segments] scene=${sceneId} v510_slot_write_unrecoverable pass=${currentPassIdx + 1} ` +
              `job=${jobId} pipeline_job=${v431SyncLedgerJob?.id ?? "none"} err=${slotRetryErr.message} — ` +
              `slot mirror not written; reconcile via ledger`,
          );
        }
      }

      // ── V510-P0 — monotonic root + scene write ─────────────────────────
      //
      // WAS: an unconditional root merge plus an unconditional scene-column
      // UPDATE setting lip_sync_status="running" and clip_error=null. The
      // comment above them said last-writer-wins was "tolerable" — true
      // among running siblings, false once one of them has terminalized.
      // That is precisely how generation 10 came back to life after it had
      // already failed and refunded.
      //
      // Both writes now go through one RPC that refuses when THIS run is
      // terminal. The decision is taken under the row lock, so it cannot be
      // raced the way a caller-side SELECT-then-UPDATE could.
      const { passes: _drop, ...rootOnly } = state as any;
      const v510Progress = await v510TouchProgress(
        {
          ...rootOnly,
          canonical_lipsync_pipeline: passes.length >= 2 ? "v204_preclip_bbox_clipspace" : "v201_id_bbox_sync3",
          input_space: passes.length >= 2 ? "plate" : undefined,
          preclip_used: passes.length >= 2 ? false : undefined,
        },
        {
          lip_sync_status: "running",
          twoshot_stage: passes.length > 1 ? `syncso_pass_${currentPassIdx + 1}_of_${passes.length}` : "syncso_segments",
          lip_sync_source_clip_url: sourceClipUrl,
          replicate_prediction_id: `sync:${jobId}`,
          clip_error: null,
        },
        String(currentPassIdx + 1),
      );
      if (!v510Progress.applied) {
        // The run ended while this pass was in flight. The provider job is
        // recorded and the ledger will reconcile it; the run stays terminal.
        console.warn(
          `[compose-dialog-segments] scene=${sceneId} pass=${currentPassIdx + 1} ` +
            `v510_root_resurrection_prevented reason=${v510Progress.reason} job=${jobId} ` +
            `accepted_after_terminal=${v510AcceptedAfterTerminal}`,
        );
      }
    }

    // ── Plan D (v93) — flag-gated parallel fan-out, supersedes hard `false`.
    //    Default flag composer.parallel_sync_so_passes = false → behaves as
    //    v60 unified serial chain (FROZEN I.9 v60 semantics preserved).
    //    When flag is ON, dispatch up to composer.sync_so_concurrency_cap
    //    additional passes in parallel via background self-invokes. Each
    //    pass is an independent Sync.so job against the SAME original plate
    //    (no chaining). Passes beyond the cap stay `pending` and are
    //    chained by the webhook's pendingIdxs[0] kick on each COMPLETE.
    //    Race-safety: per-pass state writes go through
    //    public.update_dialog_pass_slot() RPC (atomic per-slot jsonb_set).
    //    See mem/architecture/lipsync/FROZEN-INVARIANTS.md (I.9) +
    //    mem/architecture/lipsync/v93-parallel-sync-so-passes.md
    // v138 — Defaults flipped ON. Plan-D parallel fan-out is now the
    // standard path. DB flags act as KILL-SWITCHES only (set to false
    // explicitly to force the legacy serial chain). Env var also
    // defaults true. Previously all three defaulted false → 17-23 min
    // serial runs even when ops set DB flags to true (deploy lag).
    let parallelFlagOn = true;
    // v192 — Default cap raised from 2 → 4. For 4-speaker scenes this collapses
    // two serial Sync.so waves back into one parallel wave (v169 tempo). DB row
    // `composer.sync_so_concurrency_cap` still acts as the down-ward kill-switch.
    let concurrencyCap = 4;
    let fanoutForceEnableDb = true;
    try {
      const { data: pFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.parallel_sync_so_passes").maybeSingle();
      if (pFlag && (pFlag.value === false || pFlag.value === "false")) {
        parallelFlagOn = false;
      }
      const { data: cFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.sync_so_concurrency_cap").maybeSingle();
      const rawCap = (cFlag as any)?.value;
      const parsedCap = typeof rawCap === "number" ? rawCap : Number(rawCap);
      if (Number.isFinite(parsedCap) && parsedCap >= 1) {
        concurrencyCap = Math.min(4, Math.max(1, Math.floor(parsedCap)));
      }
      const { data: fFlag } = await supabase
        .from("system_config").select("value")
        .eq("key", "composer.plan_d_fanout_force_enable").maybeSingle();
      if (fFlag && (fFlag.value === false || fFlag.value === "false")) {
        fanoutForceEnableDb = false;
      }
    } catch { /* defaults */ }
    // v138 — Env killswitch defaults TRUE. Set FEATURE_PLAN_D_FANOUT=false
    // explicitly to force serial mode for emergency rollback.
    const planDFanoutEnvOn = (Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "true")
      .toLowerCase() === "true";
    const fanOutAllowed = (planDFanoutEnvOn || fanoutForceEnableDb) && parallelFlagOn && passes.length >= 2;
    if (parallelFlagOn && passes.length >= 2 && !planDFanoutEnvOn && !fanoutForceEnableDb && !isAdvance && !isRetry) {

      try {
        await logSyncDispatch(supabase, {
          scene_id: sceneId,
          user_id: userId,
          engine: "sync-segments",
          sync_status: "PLAN_D_FANOUT_BLOCKED_V139",
          meta: {
            v139_blocked: true,
            pass_idx: currentPassIdx,
            total_passes: passes.length,
            attempt_id: pass?.attempt_id ?? null,
            variant: pass?.retry_variant ?? null,
            model: pass?.retry_variant ?? null,
            dispatch_source: "compose-dialog-segments",
            reason: "FEATURE_PLAN_D_FANOUT=false AND composer.plan_d_fanout_force_enable=false",
          },
        });
      } catch { /* ignore log errors */ }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} PLAN_D_FANOUT_BLOCKED_V139 ` +
          `(env=${Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "<unset>"} db_force=${fanoutForceEnableDb}, ${passes.length} passes) — webhook will chain serially`,
      );
    }
    // ── v170 — Seed sibling pass skeletons BEFORE fan-out ────────────────
    // Regression fix (June 2026): on fresh multi-speaker dispatch the v168
    // per-slot RPC above only writes `passes[0]`, and the root merge strips
    // `passes` defensively. The parallel `{ advance: true, pass_idx: i }`
    // self-invokes therefore loaded `prevState.passes.length === 1`, hit the
    // "no pass at cursor" guard, and silently returned. Result in DB:
    // `total_passes: 4` but `passes` length 1 → UI shows 1/1 and only the
    // first speaker is ever lip-synced.
    //
    // Fix: BEFORE fanning out, persist a pending skeleton for every sibling
    // pass (slots 1..N-1) via the same atomic RPC. Each skeleton carries the
    // full pass metadata (idx, speaker_idx, character_id, audio_url, coords,
    // segments, retry_variant, audio_url_full, v137_mapping). The fan-out
    // self-invokes then find their slot and dispatch normally.
    if (!isAdvance && !isRetry && passes.length > 1) {
      try {
        const seedResults = await Promise.allSettled(
          passes.slice(1).map(async (sibling, offset) => {
            const slotIdx = offset + 1;
            // Defensive deep-copy so we never persist `rendering`/`job_id`
            // state inherited from a shared reference.
            const skeleton: Record<string, unknown> = {
              ...(sibling as any),
              status: "pending",
              job_id: null,
              output_url: null,
              started_at: null,
              finished_at: null,
              error: null,
              // v431 G3.1f — Attempt-Paar wird immer gemeinsam zurückgesetzt.
              pipeline_job_id: null,
            };
            const { error } = await supabase.rpc("update_dialog_pass_slot", {
              _scene_id: sceneId,
              _pass_idx: slotIdx,
              _patch: { ...passRunStamp, ...skeleton },
            });
            if (error) throw new Error(error.message);
            return slotIdx;
          }),
        );
        const seededIdxs = seedResults
          .map((r, i) => (r.status === "fulfilled" ? i + 1 : null))
          .filter((v): v is number => v !== null);
        const failedSeeds = seedResults
          .map((r, i) => (r.status === "rejected" ? { idx: i + 1, reason: (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason) } : null))
          .filter((v): v is { idx: number; reason: string } => v !== null);
        console.log(
          `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed ok=${seededIdxs.join(",") || "none"} total_passes=${passes.length}${failedSeeds.length ? ` failed=${JSON.stringify(failedSeeds)}` : ""}`,
        );
        if (failedSeeds.length > 0) {
          // Fallback: write the full array via the legacy UPDATE so siblings
          // are at least present (last-writer-wins is acceptable here because
          // pass 0 was already persisted via the per-slot RPC above).
          try {
            const { data: freshRow2 } = await supabase
              .from("composer_scenes")
              .select("dialog_shots")
              .eq("id", sceneId)
              .maybeSingle();
            const freshDs: any = (freshRow2 as any)?.dialog_shots ?? {};
            const freshPasses: any[] = Array.isArray(freshDs?.passes)
              ? freshDs.passes.slice()
              : [];
            for (let i = 0; i < passes.length; i++) {
              if (!freshPasses[i]) freshPasses[i] = passes[i];
            }
            await supabase
              .from("composer_scenes")
              .update({
                dialog_shots: mergeDialogShots(freshDs, { passes: freshPasses, total_passes: passes.length, multi_pass: passes.length > 1 }),
                updated_at: nowIso,
              })
              .eq("id", sceneId);
          } catch (fallbackErr) {
            console.warn(
              `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed_fallback_failed: ${(fallbackErr as Error)?.message ?? fallbackErr}`,
            );
          }
        }
      } catch (seedErr) {
        console.error(
          `[compose-dialog-segments] scene=${sceneId} v170_pass_skeleton_seed_threw: ${(seedErr as Error)?.message ?? seedErr}`,
        );
      }
    }

    if (!isAdvance && !isRetry && fanOutAllowed) {
      // Pass 0 was just dispatched above. Fan out passes [1 .. cap-1] now;
      // any beyond cap remain `pending` and get kicked by the webhook.
      // v193: use EdgeRuntime.waitUntil instead of bare setTimeout. Bare timers
      // can be dropped when the Edge Function returns, which silently collapses
      // a supposed one-wave fanout back into webhook-chained serial dispatch.
      const fanOutEnd = Math.min(passes.length, concurrencyCap);
      try {
        EdgeRuntime.waitUntil(Promise.allSettled(
          Array.from({ length: Math.max(0, fanOutEnd - 1) }, async (_, offset) => {
            const i = offset + 1;
            const delayMs = i * 250; // small jitter prevents Sync.so burst spike
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const resp = await fetch(`${supabaseUrl}/functions/v1/compose-dialog-segments`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ scene_id: sceneId, advance: true, pass_idx: i }),
            });
            console.log(
              `[compose-dialog-segments] scene=${sceneId} v193_fanout_self_invoke pass=${i + 1}/${passes.length} status=${resp.status}`,
            );
          }),
        ));
      } catch (err) {
        console.warn(`[compose-dialog-segments] plan_d waitUntil fan-out setup threw: ${(err as Error)?.message ?? err}`);
      }
      console.log(
        `[compose-dialog-segments] scene=${sceneId} v193_parallel_pass_fanout_start cap=${concurrencyCap} fanout_size=${fanOutEnd} N_passes=${passes.length} env=${Deno.env.get("FEATURE_PLAN_D_FANOUT") ?? "<unset>"} db_force=${fanoutForceEnableDb}`,
      );

      // ── v167 Speedup Schritt 2 — Preclip Pre-Fanout für Passes jenseits des Caps ──
      // Wenn N > cap (z.B. N=4, cap=3), wartet Pass[cap..N-1] aktuell auf den
      // Webhook eines früheren Passes UND rendert dann erst seinen ~90-120s
      // Preclip. Dieser Block startet die Preclip-Renders für die "wartenden"
      // Passes als Background-Task SOFORT (parallel zur sync-3-Verarbeitung
      // der Fanout-Passes). Wenn der Webhook später `advance` für Pass N-1
      // triggert, ist `preclip_url` bereits gesetzt → der Per-Pass-Lazy-Render
      // (Z. 3727) wird übersprungen, Pass N-1 dispatched direkt.
      //
      // Hinter Env-Flag `FEATURE_PRECLIP_PREFANOUT` (default OFF). Aktivieren
      // mit `FEATURE_PRECLIP_PREFANOUT=true` in den Edge-Secrets.
      // Fallback: bei Failure greift der bestehende Per-Pass-Render in der
      // späteren `advance`-Invocation → keine Regression möglich.
      // v192 — Default flipped ON. Preclip pre-fanout is retry-path insurance;
      // no cost on the v153.2 bbox-url-pro happy path. Set to "false" explicitly
      // to disable.
      const preFanoutEnabled = (Deno.env.get("FEATURE_PRECLIP_PREFANOUT") ?? "true")
        .toLowerCase() === "true";
      if (preFanoutEnabled && passes.length > concurrencyCap && plateDims && sourceClipUrl) {
        const waitingIdxs: number[] = [];
        for (let i = concurrencyCap; i < passes.length; i++) {
          const wp = passes[i];
          if ((wp as any)?.preclip_url && (wp as any)?.preclip_crop) continue; // already cached
          if (!Array.isArray(wp?.coords) || wp.coords.length !== 2) continue;
          if (!Number.isFinite(Number(wp.coords[0])) || !Number.isFinite(Number(wp.coords[1]))) continue;
          waitingIdxs.push(i);
        }
        if (waitingIdxs.length > 0) {
          console.log(
            `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout START waiting_passes=${waitingIdxs.join(",")} cap=${concurrencyCap} N=${passes.length}`,
          );
          try {
            EdgeRuntime.waitUntil((async () => {
              await Promise.allSettled(waitingIdxs.map(async (waitIdx) => {
                const wp = passes[waitIdx];
                try {
                  const wpSegments = Array.isArray(wp.segments) ? wp.segments : [];
                  const wpWindows: Array<[number, number]> = wpSegments
                    .map((s: any) => [Number(s.startTime), Number(s.endTime)] as [number, number])
                    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
                  if (wpWindows.length === 0) {
                    console.warn(`[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} skip: no audio windows`);
                    return;
                  }
                  const wpUnionStart = Math.max(0, Math.min(...wpWindows.map(([s]) => s)));
                  const wpUnionEnd = Math.min(totalSec, Math.max(...wpWindows.map(([, e]) => e)));
                  const wpSiblings: Array<[number, number]> = [];
                  for (let k = 0; k < speakers.length; k++) {
                    if (k === wp.speaker_idx) continue;
                    const c = (speakers as any[])[k]?.coords;
                    if (Array.isArray(c) && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1]))) {
                      wpSiblings.push([Number(c[0]), Number(c[1])]);
                    }
                  }
                  const wpPlateBox = speakerPlateBboxes?.[wp.speaker_idx] ?? null;
                  const wpPreclip = await renderPassFacePreclip(
                    supabase,
                    serviceKey,
                    supabaseUrl,
                    {
                      sceneId,
                      projectId: String((scene as any).project_id ?? ""),
                      // V447 — Run-Identität: bindet den Preclip an Lauf + Generation.
                      runId: String((scene as any).active_run_id ?? "") || null,
                      plateGeneration: Number.isFinite(Number((scene as any).plate_generation)) ? Number((scene as any).plate_generation) : null,
                      userId,
                      passIdx: waitIdx,
                      masterVideoUrl: sourceClipUrl,
                      srcWidth: plateDims.width,
                      srcHeight: plateDims.height,
                      coords: [Number(wp.coords[0]), Number(wp.coords[1])],
                      bbox: wpPlateBox,
                      mouth: speakerPlateMouths?.[wp.speaker_idx] ?? null,
                      siblingCoords: wpSiblings.length > 0 ? wpSiblings : null,
                      startSec: wpUnionStart,
                      endSec: wpUnionEnd,
                    },
                    300_000,
                  );
                  if (wpPreclip.ok && wpPreclip.preclipUrl && wpPreclip.crop) {
                    const patch = {
                      preclip_url: wpPreclip.preclipUrl,
                      preclip_render_id: wpPreclip.preclipRenderId ?? null,
                      preclip_crop: {
                        x: wpPreclip.crop.x,
                        y: wpPreclip.crop.y,
                        size: wpPreclip.crop.size,
                        outputSize: wpPreclip.crop.outputSize,
                      },
                      preclip_start_sec: Number(wpUnionStart.toFixed(3)),
                      preclip_end_sec: Number(wpUnionEnd.toFixed(3)),
                      preclip_fps: Number(wpPreclip.fps ?? 30),
                      preclip_frame_count: Number.isFinite(Number(wpPreclip.frameCount)) && Number(wpPreclip.frameCount) > 0
                        ? Math.max(1, Math.round(Number(wpPreclip.frameCount)))
                        : Math.max(1, Math.ceil((wpPreclip.durationSec ?? Math.max(0.2, wpUnionEnd - wpUnionStart)) * Number(wpPreclip.fps ?? 30))),
                      preclip_duration_sec: Number((wpPreclip.durationSec ?? Math.max(0.2, wpUnionEnd - wpUnionStart)).toFixed(3)),
                      preclip_error: null,
                    };
                    await supabase.rpc("update_dialog_pass_slot", {
                      _scene_id: sceneId,
                      _pass_idx: waitIdx,
                      _patch: patch,
                    });
                    console.log(
                      `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} OK persisted url=…${wpPreclip.preclipUrl.slice(-60)}`,
                    );
                  } else {
                    console.warn(
                      `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} render failed err=${wpPreclip.error} — per-pass lazy-render will retry on advance`,
                    );
                  }
                } catch (e) {
                  console.warn(
                    `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout pass=${waitIdx + 1} threw: ${(e as Error)?.message ?? e} — per-pass lazy-render will retry on advance`,
                  );
                }
              }));
              console.log(
                `[compose-dialog-segments] scene=${sceneId} v167_preclip_prefanout DONE waiting_passes=${waitingIdxs.join(",")}`,
              );
            })());
          } catch { /* EdgeRuntime not available in some test contexts */ }
        }
      }
    } else if (!isAdvance && !isRetry && passes.length > 1) {
      console.log(
        `[compose-dialog-segments] scene=${sceneId} SERIAL mode (${passes.length} speakers, v60 unified, parallel_flag=${parallelFlagOn}) — webhook will chain pass 2..N as pass 1..N-1 complete`,
      );
    }


    return json(
      {
        ok: true,
        status: "rendering",
        scene_id: sceneId,
        sync_job_id: jobId,
        pass: currentPassIdx + 1,
        total_passes: passes.length,
        speaker: pass.speaker_name,
        cost_credits: totalCost,
      },
      202,
    );
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e ?? "unknown");
    const errStack = e instanceof Error ? e.stack ?? "" : "";
    console.error(
      `[compose-dialog-segments] dispatch_crash scene=${crashSceneId ?? "n/a"} err=${errMsg}\n${errStack}`,
    );
    // v100 — Crash-safe envelope: if we already knew which scene we were
    // dispatching for, mark it failed+refund immediately so the user does not
    // see a phantom `pending` for 4 min until lipsync-watchdog fires
    // STALE_PREFLIGHT_MS. The Schicht A auto-reset above will then self-heal
    // on the next 30s auto-tick without manual intervention.
    if (crashSceneId && crashUserId && crashSupabase) {
      try {
        await logSyncDispatch(crashSupabase, {
          scene_id: crashSceneId,
          user_id: crashUserId,
          engine: "sync-segments",
          sync_status: "DISPATCH_CRASH",
          error_class: "dispatch_crash",
          error_message: errMsg.slice(0, 500),
          meta: { stack: errStack.slice(0, 1000) },
        });
      } catch (logErr) {
        console.warn(
          `[compose-dialog-segments] crash_log_failed scene=${crashSceneId} err=${(logErr as Error)?.message ?? logErr}`,
        );
      }
      try {
        await failLipSync({
          supabase: crashSupabase,
          sceneId: crashSceneId,
          userId: crashUserId,
          reason: `dispatch_crash: ${errMsg.slice(0, 160)}`,
          refundCredits: 0,
          syncApiKey: crashSyncApiKey,
        });
      } catch (failErr) {
        console.warn(
          `[compose-dialog-segments] crash_failLipSync_failed scene=${crashSceneId} err=${(failErr as Error)?.message ?? failErr}`,
        );
      }
    }
    return json({ error: errMsg }, 500);
  } finally {
    if (lockSupabase && lockSceneId && lockHolder) {
      try {
        await lockSupabase.rpc("release_dialog_lock", {
          _scene_id: lockSceneId,
          _holder: lockHolder,
          _pass_idx: lockPassIdx,
        });
      } catch (e) {
        console.warn(`[compose-dialog-segments] lock release failed (scene=${lockSceneId} pass=${lockPassIdx}): ${(e as Error)?.message ?? e}`);
      }
    }
  }
})(req)));

