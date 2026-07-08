/**
 * render-sync-segments-audio-mux — Lambda dispatcher that replaces the
 * audio track of a v5 sync-segments multi-pass output with the merged
 * master WAV (which contains all speakers' voices).
 *
 * Why this exists:
 *   Sync.so v2 replaces the entire audio track of its output with the audio
 *   you submit. For multi-pass dialog (N speakers chained), each pass
 *   overwrites the previous audio with that speaker's WAV → the final video
 *   ends up with only the last speaker audible. The merged master WAV (with
 *   all speakers correctly mixed) already exists in
 *   `audio_plan.twoshot.url`; we just need to mux it back onto the
 *   final lipsynced video. ffmpeg is forbidden in the Supabase Edge Runtime,
 *   so we do the mux on Lambda by reusing `DialogStitchVideo` with `shots=[]`:
 *   it renders the master video muted and overlays the master audio as the
 *   single AAC track.
 *
 * Input  : { sceneId }
 * Reads  : composer_scenes.dialog_shots (must be engine='sync-segments',
 *          status='audio_muxing', final_url set), audio_plan.twoshot.url
 * Output : a Lambda render is dispatched. remotion-webhook (source =
 *          'dialog-stitch') writes the muxed url back to
 *          composer_scenes.clip_url and sets lip_sync_applied_at.
 *
 * Idempotency: if `dialog_shots.audio_mux.render_id` is already set and the
 * corresponding video_renders row is in {pending,rendering,completed} we
 * return that render_id without dispatching again.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { appendWebhookToken } from "../_shared/webhook-auth.ts";
import { DEFAULT_BUCKET_NAME } from "../_shared/aws-lambda.ts";

import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// v205 mux/v169 parity — telemetry only. Mask stops live in the Remotion
// template (`DialogStitchVideo.tsx`); this constant just tags the render so
// operators can grep for the active mask profile.
const OVERLAY_MASK_VERSION = "v169_parity";
const COLOR_MATCH_ENABLED = false;

function evenDimension(value: unknown, fallback: number): number {
  const n = Number(value);
  const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
  return safe % 2 === 0 ? safe : safe - 1;
}

interface DialogShotsState {
  engine?: string;
  version?: number;
  status?: string;
  passes?: Array<Record<string, unknown>>;
  final_url?: string | null;
  total_sec?: number;
  video_width?: number;
  video_height?: number;
  source_clip_url?: string;
  audio_mux?: {
    render_id: string;
    dispatched_at: string;
  };
  [k: string]: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "audio" });
  }

  let sceneIdForDiagnostics: string | undefined;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    // v94 — Lambda warm-ping. sync-so-webhook fires this when the
    // second-to-last pass completes, so the edge function (and ideally the
    // downstream Remotion Lambda container) is warm by the time the real
    // dispatch arrives ~25-45s later. No DB read, no Lambda invoke.
    if (body?.warmup === true) {
      return json({ ok: true, warmed: true });
    }
    const sceneId: string | undefined = body?.sceneId ?? body?.scene_id;
    const forceRemux = body?.force === true || body?.force_remux === true;
    sceneIdForDiagnostics = sceneId;
    if (!sceneId) return json({ error: "sceneId is required" }, 400);

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, dialog_shots, audio_plan, lip_sync_applied_at, lip_sync_status, clip_url",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: `scene not found: ${sceneErr?.message ?? ""}` }, 404);
    }

    const state = ((scene as any).dialog_shots ?? null) as DialogShotsState | null;
    if ((scene as any).lip_sync_status === "canceled" || (state as any)?.status === "canceled") {
      return json({ ok: true, skipped: "canceled", scene_id: sceneId });
    }
    if (!state || state.engine !== "sync-segments") {
      return json(
        { error: "not_sync_segments", message: "scene is not a sync-segments scene" },
        400,
      );
    }
    const finalLipsyncUrl = String(state.final_url ?? (scene as any).clip_url ?? "");
    if (!finalLipsyncUrl) {
      return json(
        { error: "missing_final_url", message: "dialog_shots.final_url is required" },
        400,
      );
    }

    const twoshot = ((scene as any).audio_plan?.twoshot ?? {}) as Record<string, unknown>;
    const masterAudioUrl = String((twoshot as any).url ?? "");
    const totalSec = Number((twoshot as any).totalSec ?? state.total_sec ?? 0);
    if (!masterAudioUrl || totalSec <= 0) {
      return json(
        {
          error: "missing_master_audio",
          message:
            "audio_plan.twoshot.url and totalSec are required for the audio mux step",
        },
        400,
      );
    }

    // ── Idempotency: existing mux render still in flight ─────────────────
    if (!forceRemux && state.audio_mux?.render_id) {
      const { data: existing } = await supabase
        .from("video_renders")
        .select("status")
        .eq("render_id", state.audio_mux.render_id)
        .maybeSingle();
      if (
        existing &&
        ["pending", "rendering", "completed"].includes(String(existing.status))
      ) {
        return json({
          ok: true,
          already_dispatched: true,
          render_id: state.audio_mux.render_id,
          status: existing.status,
        });
      }
    }

    // ── Project / user lookup ───────────────────────────────────────────
    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", (scene as any).project_id)
      .single();
    const userId = (project as any)?.user_id;
    if (!userId) return json({ error: "project user_id missing" }, 500);

    // ── Build Lambda payload ─────────────────────────────────────────────
    // v25 Fan-Out: for multi-pass scenes the master video is the ORIGINAL
    // pristine plate, and each speaker pass overlays via a soft circular
    // face-mask through its full-frame Sync.so output. For single-speaker
    // scenes we keep the legacy audio-swap path (shots: []).
    const fps = 30;
    const durationInFrames = Math.max(30, Math.ceil(totalSec * fps));
    const width = evenDimension(state.video_width, 1280);
    const height = evenDimension(state.video_height, 720);

    const passes = Array.isArray((state as any).passes) ? (state as any).passes : [];
    const donePasses = passes.filter(
      (p: any) =>
        p?.status === "done" &&
        typeof p?.output_url === "string" &&
        Array.isArray(p?.coords) &&
        Number.isFinite(Number(p.coords[0])) &&
        Number.isFinite(Number(p.coords[1])),
    );
    // v175 — Overlay-Mode wieder für ALLE N≥1 (revert v169). Mit v175 ist die
    // N=1 Plate closed-mouth (compose-video-clips), Tight-Slice ist wieder an
    // (compose-dialog-segments) → der Sync.so-Output liegt im Speaker-Window
    // und außerhalb zeigt die pristine Plate einen geschlossenen Mund. Damit
    // ist Tail-Talk gelöst OHNE Tight-Slice/Overlay für N=1 zu deaktivieren,
    // und der v64-Fix gegen `generation_unknown_error` (trailing silence)
    // bleibt aktiv.
    const anyTight = donePasses.some((p: any) => !!p?.audio_tight);
    const isFanout = donePasses.length >= 2;
    const useOverlay = isFanout || (donePasses.length >= 1 && anyTight);


    const sourcePlateUrl = String((state as any).source_clip_url ?? "");

    // v75 — Professional Artlist-style default: keep the moving i2v master
    // plate underneath and composite Sync.so outputs only during each
    // speaker's true dialogue window. The v72/v74 static-anchor + hold-to-end
    // path made characters look frozen and could let one overlay dominate the
    // remaining scene, so it is intentionally not used for normal muxes.
    const masterVideoUrlForMux = useOverlay && sourcePlateUrl
      ? sourcePlateUrl
      : finalLipsyncUrl;

    const minAxis = Math.min(width, height);
    // v114 — Floor radius at 0.28 regardless of speaker count. The previous
    // 0.15..0.22 floor for ≥3 speakers produced 108–158 px masks on a 720 px
    // axis, which routinely clipped the chin/mouth (radial gradient inner
    // edge at 68% radius → ~73–107 px). The mouth movement was happening in
    // the Sync.so output but hidden behind the mask edge. We trade a bit of
    // overlap risk between adjacent speakers for guaranteed mouth visibility.
    const radiusForCount = minAxis * 0.28;

    // Keep overlays windowed to the actual speaker turns. This is the
    // Sync.so-compliant behavior: target face + target audio + exact timeline
    // window. Do not stretch any speaker overlay to scene end.
    // v90: asymmetric pad — generous onset, tight tail — so lips don't
    // twitch after the script ends.
    // v91: short turns (<0.6s raw) get a relaxed 0.08s tail to match the
    // dynamic-floor in compose-dialog-segments and stay aligned with the
    // Sync.so output window for that turn.
    const SHOT_PAD_START = 0.06;
    const SHOT_PAD_END_TIGHT = 0.02;
    const SHOT_PAD_END_SHORT = 0.08;
    const SHORT_TURN_THRESHOLD_SEC = 0.6;

    // v197 — Listener mouth mattes are disabled by default. v193 patched
    // non-speaking mouths inside active speaker windows, but that violates
    // the v169 single-face-layer invariant and can read as a second face
    // state over the plate. Keep the code only as an explicit diagnostic
    // rollback path.
    let listenerMouthMatteEnabled = false;
    try {
      const { data: matteRow } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "composer.listener_mouth_matte_v193")
        .maybeSingle();
      const raw = (matteRow as any)?.value;
      if (raw !== undefined && raw !== null) {
        listenerMouthMatteEnabled = String(raw).toLowerCase() === "true";
      }
    } catch {
      listenerMouthMatteEnabled = false;
    }

    // v195 — Silent-Face Freeze (professional). For every done pass we emit a
    // FULL-SCENE freeze tile on the master plate at that speaker's
    // `preclip_crop` bbox, frame 0. Active Sync.so overlays for that speaker
    // draw ON TOP during voiced windows, so the frozen tile only shows during
    // silence (head + gaps + tail). Because the tile is a crop of the SAME
    // master plate at frame 0, the geometry, identity, color, and lighting
    // match perfectly — no ghost, no morph (root cause of v183/v190
    // portrait-based overlays that were disabled in v192).
    //
    // Body, hands, hair, and background outside each face bbox continue to
    // animate from the live plate → "Bewegungen im Hintergrund zu jeder Zeit"
    // stays satisfied while pre/post-script lip motion is eliminated.
    //
    // Flag: system_config.composer.silent_anchor_v195 (default TRUE).
    let silentAnchorV195Enabled = true;
    try {
      const { data: v195Row } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "composer.silent_anchor_v195")
        .maybeSingle();
      const raw = (v195Row as any)?.value;
      if (raw !== undefined && raw !== null) {
        silentAnchorV195Enabled = String(raw).toLowerCase() !== "false";
      }
    } catch {
      silentAnchorV195Enabled = true;
    }

    // Legacy v183 portrait-based ghost overlay path — kept OFF by default.
    let silentFacesV183Enabled = false;
    try {
      const { data: v183Row } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "composer.silent_faces_v183")
        .maybeSingle();
      const raw = (v183Row as any)?.value;
      if (raw !== undefined && raw !== null) {
        silentFacesV183Enabled = String(raw).toLowerCase() === "true";
      }
    } catch {
      silentFacesV183Enabled = false;
    }

    // v197 silent-face freeze tiles — geometry-matched to the master plate,
    // but rendered ONLY during this speaker's silent windows. v195 rendered
    // tiles for the whole scene and relied on active Sync.so overlays covering
    // them; any bbox mismatch resurrected face-layer competition/morphs.
    type SilentFreezeWindow = { fromSec: number; toSec: number };
    type SilentFreeze = { x: number; y: number; size: number; speakerIdx: number; windows: SilentFreezeWindow[] };
    const silentFaceFreezes: SilentFreeze[] = [];
    if (silentAnchorV195Enabled && useOverlay) {
      for (const p of donePasses as any[]) {
        const sIdx = Number(p?.speaker_idx);
        const pc = p?.preclip_crop;
        if (
          !Number.isFinite(sIdx) ||
          !pc ||
          !Number.isFinite(Number(pc.x)) ||
          !Number.isFinite(Number(pc.y)) ||
          !Number.isFinite(Number(pc.size)) ||
          Number(pc.size) <= 0
        ) {
          continue;
        }
        const rawSegments = Array.isArray(p?.segments) ? p.segments : [];
        if (rawSegments.length === 0) continue;
        const voicedWindows = rawSegments
          .map((t: any) => {
            const rawDur = Math.max(0, Number(t?.endTime) - Number(t?.startTime));
            const tailPad = rawDur < SHORT_TURN_THRESHOLD_SEC ? SHOT_PAD_END_SHORT : SHOT_PAD_END_TIGHT;
            const fromSec = Math.max(0, Number(t?.startTime) - SHOT_PAD_START);
            const toSec = Math.min(totalSec, Number(t?.endTime) + tailPad);
            return { fromSec, toSec };
          })
          .filter((w: SilentFreezeWindow) => Number.isFinite(w.fromSec) && Number.isFinite(w.toSec) && w.toSec > w.fromSec + 0.05)
          .sort((a: SilentFreezeWindow, b: SilentFreezeWindow) => a.fromSec - b.fromSec);
        const windows: SilentFreezeWindow[] = [];
        let cursor = 0;
        for (const w of voicedWindows) {
          const fromSec = Math.max(0, Math.min(totalSec, Number(w.fromSec)));
          const toSec = Math.max(fromSec, Math.min(totalSec, Number(w.toSec)));
          if (fromSec > cursor + 0.08) {
            windows.push({ fromSec: Number(cursor.toFixed(3)), toSec: Number(fromSec.toFixed(3)) });
          }
          cursor = Math.max(cursor, toSec);
        }
        if (cursor < totalSec - 0.08) {
          windows.push({ fromSec: Number(cursor.toFixed(3)), toSec: Number(totalSec.toFixed(3)) });
        }
        if (windows.length === 0) continue;
        silentFaceFreezes.push({
          x: Number(pc.x),
          y: Number(pc.y),
          size: Number(pc.size),
          speakerIdx: sIdx,
          windows,
        });
      }
      const windowsTotal = silentFaceFreezes.reduce((sum, slot) => sum + slot.windows.length, 0);
      console.log(
        `[render-sync-segments-audio-mux] scene=${sceneId} v197_silent_windows slots=${silentFaceFreezes.length}/${donePasses.length} windows_total=${windowsTotal} enabled=${silentAnchorV195Enabled} isFanout=${isFanout}`,
      );
    }

    // Legacy v183 portrait-based path — only active when the old flag is on
    // AND v195 is off. Retained for emergency rollback.
    type SilentSlot = { x: number; y: number; size: number; anchorUrl: string | null };
    type MouthMatteSlot = { x: number; y: number; width: number; height: number };
    const silentSlotBySpeakerIdx = new Map<number, SilentSlot>();
    const mouthMatteBySpeakerIdx = new Map<number, MouthMatteSlot>();
    const charPortraitByCharId = new Map<string, string>();
    if (silentFacesV183Enabled && !silentAnchorV195Enabled && isFanout) {
      const uniqueCharIds = Array.from(
        new Set(
          donePasses
            .map((p: any) => (typeof p?.character_id === "string" ? p.character_id : null))
            .filter((x: any): x is string => !!x),
        ),
      );
      if (uniqueCharIds.length > 0) {
        const { data: chars } = await supabase
          .from("brand_characters")
          .select("id, portrait_url")
          .in("id", uniqueCharIds);
        for (const row of (chars ?? []) as any[]) {
          if (row?.id && typeof row?.portrait_url === "string" && row.portrait_url.length > 0) {
            charPortraitByCharId.set(String(row.id), String(row.portrait_url));
          }
        }
      }
      for (const p of donePasses as any[]) {
        const sIdx = Number(p?.speaker_idx);
        const pc = p?.preclip_crop;
        if (
          !Number.isFinite(sIdx) ||
          !pc ||
          !Number.isFinite(Number(pc.x)) ||
          !Number.isFinite(Number(pc.y)) ||
          !Number.isFinite(Number(pc.size)) ||
          Number(pc.size) <= 0
        ) {
          continue;
        }
        const charId = typeof p?.character_id === "string" ? p.character_id : null;
        const anchorUrl = charId ? charPortraitByCharId.get(charId) ?? null : null;
        silentSlotBySpeakerIdx.set(sIdx, {
          x: Number(pc.x),
          y: Number(pc.y),
          size: Number(pc.size),
          anchorUrl,
        });
      }
    }

    if (listenerMouthMatteEnabled && isFanout) {
      const persistedMouths: any[] = Array.isArray((state as any)?.plate_identity?.mouths)
        ? ((state as any).plate_identity.mouths as any[])
        : [];
      for (const p of donePasses as any[]) {
        const sIdx = Number(p?.speaker_idx);
        const pc = p?.preclip_crop;
        if (
          !Number.isFinite(sIdx) ||
          !pc ||
          !Number.isFinite(Number(pc.x)) ||
          !Number.isFinite(Number(pc.y)) ||
          !Number.isFinite(Number(pc.size)) ||
          Number(pc.size) <= 0
        ) {
          continue;
        }
        const cropX = Number(pc.x);
        const cropY = Number(pc.y);
        const cropSize = Number(pc.size);
        const mappedMouth = Array.isArray(p?.v137_mapping?.plate_mouth)
          ? p.v137_mapping.plate_mouth
          : (Array.isArray(persistedMouths[sIdx]) ? persistedMouths[sIdx] : null);
        const mouthX = mappedMouth && Number.isFinite(Number(mappedMouth[0]))
          ? Number(mappedMouth[0])
          : cropX + cropSize * 0.5;
        const mouthY = mappedMouth && Number.isFinite(Number(mappedMouth[1]))
          ? Number(mappedMouth[1])
          : cropY + cropSize * 0.66;
        const matteW = Math.max(18, Math.min(cropSize * 0.42, width * 0.16));
        const matteH = Math.max(10, Math.min(cropSize * 0.24, height * 0.10));
        const x = Math.max(cropX, Math.min(cropX + cropSize - matteW, mouthX - matteW / 2));
        const y = Math.max(cropY, Math.min(cropY + cropSize - matteH, mouthY - matteH * 0.45));
        mouthMatteBySpeakerIdx.set(sIdx, {
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          width: Number(matteW.toFixed(2)),
          height: Number(matteH.toFixed(2)),
        });
      }
      console.log(
        `[render-sync-segments-audio-mux] scene=${sceneId} v193_listener_matte_slots=${mouthMatteBySpeakerIdx.size}/${donePasses.length} enabled=${listenerMouthMatteEnabled}`,
      );
    }





    const fanoutShots = useOverlay
      ? donePasses.flatMap((p: any) => {
          const passSegs = Array.isArray(p?.segments) ? p.segments : [];
          const isTight = !!(p as any).audio_tight;
          const sourceTiming: "relative" | "absolute" = isTight ? "relative" : "absolute";
          // v90 — per-turn offsets inside the tight Sync.so output. Without
          // these, every turn of a multi-turn speaker restarts at output-t=0
          // (Sync.so output for tight WAV is a single concatenated render),
          // so turn 2 visibly replays the lip animation of turn 1.
          const outputOffsets: number[] = Array.isArray((p as any).audio_tight?.output_offsets_sec)
            ? ((p as any).audio_tight.output_offsets_sec as number[])
            : [];
          const preclipCrop = (p as any).preclip_crop;
          const preclipCropValid =
            preclipCrop &&
            Number.isFinite(Number(preclipCrop.x)) &&
            Number.isFinite(Number(preclipCrop.y)) &&
            Number.isFinite(Number(preclipCrop.size));
          // v122 — Defense in depth: if `coords` falls outside the stored
          // preclip_crop (drifted bbox at dispatch time), ignore the crop
          // overlay and fall back to the coords-centered circular faceMask.
          // This keeps historical scenes recoverable on re-mux without
          // re-rendering all preclips.
          const coordsInsidePreclipCrop = preclipCropValid && (() => {
            const cx = Number(p.coords?.[0]);
            const cy = Number(p.coords?.[1]);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return true;
            const x = Number(preclipCrop.x);
            const y = Number(preclipCrop.y);
            const s = Number(preclipCrop.size);
            return cx >= x && cx <= x + s && cy >= y && cy <= y + s;
          })();
          const hasPreclipCrop = preclipCropValid && coordsInsidePreclipCrop;
          if (preclipCropValid && !coordsInsidePreclipCrop) {
            console.warn(
              `[render-sync-segments-audio-mux] scene=${sceneId} pass speaker=${(p as any).speaker_idx} v122_preclip_coords_outside_crop ` +
              `coords=[${Number(p.coords?.[0])},${Number(p.coords?.[1])}] crop={x:${preclipCrop.x},y:${preclipCrop.y},size:${preclipCrop.size}} — using faceMask fallback`,
            );
          }
          // v190 — per-shot silent slots removed. Silent-face anchors are
          // now rendered globally (see `globalSilentSlots` on inputProps),
          // so the active overlay only needs to carry its own crop/mask.
          const overlayPayload: Record<string, unknown> = hasPreclipCrop
            ? {
                crop: {
                  x: Number(preclipCrop.x),
                  y: Number(preclipCrop.y),
                  size: Number(preclipCrop.size),
                },
              }
            : {
                faceMask: {
                  cx: Number(p.coords[0]),
                  cy: Number(p.coords[1]),
                  radius: radiusForCount,
                },
              };

          const mouthMattes = listenerMouthMatteEnabled && isFanout
            ? Array.from(mouthMatteBySpeakerIdx.entries())
                .filter(([speakerIdx]) => speakerIdx !== Number((p as any).speaker_idx))
                .map(([, slot]) => slot)
            : [];



          if (passSegs.length === 0) {
            return [{
              startSec: 0,
              endSec: totalSec,
              outputUrl: String(p.output_url),
              sourceTiming,
              sourceStartSec: 0,
              ...(mouthMattes.length > 0 ? { mouthMattes } : {}),
              ...overlayPayload,
            }];
          }
          // Sort turns by start so per-turn offsets line up with the tight
          // WAV concat order (sliceWavToWindows sorts internally too).
          const sortedSegs = [...passSegs].sort(
            (a: any, b: any) => Number(a.startTime) - Number(b.startTime),
          );
          return sortedSegs
            .map((t: any, i: number) => {
              const rawDur = Math.max(0, Number(t.endTime) - Number(t.startTime));
              const tailPad = rawDur < SHORT_TURN_THRESHOLD_SEC ? SHOT_PAD_END_SHORT : SHOT_PAD_END_TIGHT;
              const s = Math.max(0, Number(t.startTime) - SHOT_PAD_START);
              const e = Math.min(totalSec, Number(t.endTime) + tailPad);
              if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s + 0.05) return null;
              const sourceStartSec =
                sourceTiming === "relative" && Number.isFinite(outputOffsets[i])
                  ? Math.max(0, Number(outputOffsets[i]))
                  : 0;
              return {
                startSec: s,
                endSec: e,
                outputUrl: String(p.output_url),
                sourceTiming,
                sourceStartSec,
                ...(mouthMattes.length > 0 ? { mouthMattes } : {}),
                ...overlayPayload,
              };
            })
            .filter(Boolean);
        })
      : [];

    // v182 — N=1 Tail-Hold. Single-speaker tight-overlay scenes reveal the
    // raw provider plate again immediately after the final voiced window.
    // Kling can occasionally render subtle idle mouth movement despite the
    // closed-mouth prompt, so hold the full frame from the last lipsynced
    // window through scene end. This is deliberately a global full-frame hold,
    // not the old v164 per-face freeze tiles that caused ghost/morph artefacts.
    const isSingleSpeakerTight = donePasses.length === 1 && anyTight;
    const lastShotEndSec = fanoutShots.reduce((max: number, shot: any) => {
      const e = Number(shot?.endSec);
      return Number.isFinite(e) ? Math.max(max, e) : max;
    }, 0);
    // v195 supersedes v182: the per-pass silent-face freeze covers head +
    // tail + gap silence on the SAME crop the plate uses, so a scene-wide
    // freeze is no longer needed and produced the "everything frozen" look.
    // We keep v182 as an emergency fallback only when v195 emitted no slots
    // (e.g. no valid preclip_crop on the single pass).
    const tailFreezeFromSec =
      silentFaceFreezes.length === 0 && isSingleSpeakerTight && lastShotEndSec > 0 && lastShotEndSec < totalSec - 0.05
        ? Number(lastShotEndSec.toFixed(3))
        : null;
    if (tailFreezeFromSec !== null) {
      console.log(
        `[render-sync-segments-audio-mux] scene=${sceneId} v182_n1_tail_hold_fallback from=${tailFreezeFromSec.toFixed(3)} to=${totalSec.toFixed(3)} (v195 emitted 0 slots)`,
      );
    }


    // v190 legacy portrait tiles — only when v183 flag ON and v195 OFF.
    const globalSilentSlots =
      silentFacesV183Enabled && !silentAnchorV195Enabled && isFanout && donePasses.length >= 2
        ? Array.from(silentSlotBySpeakerIdx.values())
        : [];
    if (globalSilentSlots.length > 0) {
      const anchors = globalSilentSlots.filter((s) => !!s.anchorUrl).length;
      console.log(
        `[render-sync-segments-audio-mux] scene=${sceneId} v190_global_silent_slots=${globalSilentSlots.length} anchors=${anchors} fallback=${globalSilentSlots.length - anchors}`,
      );
    }

    const inputProps: Record<string, unknown> = {
      masterVideoUrl: masterVideoUrlForMux,
      masterAudioUrl,
      totalSec,
      targetWidth: width,
      targetHeight: height,
      srcWidth: width,
      srcHeight: height,
      shots: fanoutShots,
      ...(tailFreezeFromSec !== null ? { tailFreezeFromSec } : {}),
      ...(globalSilentSlots.length > 0 ? { globalSilentSlots } : {}),
      ...(silentFaceFreezes.length > 0 ? { silentFaceFreezes } : {}),
    };

    const shotSummary = fanoutShots.map((shot: any, idx: number) => ({
      idx,
      startSec: shot.startSec,
      endSec: shot.endSec,
      sourceTiming: shot.sourceTiming,
      sourceStartSec: shot.sourceStartSec ?? 0,
      crop: shot.crop ?? null,
      faceMask: shot.faceMask ?? null,
      mouthMattes: Array.isArray((shot as any).mouthMattes) ? (shot as any).mouthMattes.length : 0,
      outputUrl: String(shot.outputUrl ?? "").slice(0, 120),
    }));

    // v205 mux/v169 parity telemetry + guard.
    const cropsUsed = fanoutShots.filter((s: any) => s?.crop && Number(s.crop?.size) > 0).length;
    const facemasksUsed = fanoutShots.filter((s: any) => s?.faceMask && Number(s.faceMask?.radius) > 0).length;
    const silentSlotsUsed = Array.isArray((inputProps as any).silentFaceFreezes)
      ? ((inputProps as any).silentFaceFreezes as any[]).length
      : 0;
    console.log(
      `[render-sync-segments-audio-mux] scene=${sceneId} overlay_mask_version=${OVERLAY_MASK_VERSION} ` +
      `crops_used=${cropsUsed} facemasks_used=${facemasksUsed} silent_slots_used=${silentSlotsUsed} ` +
      `color_match_enabled=${COLOR_MATCH_ENABLED}`,
    );
    // Multi-speaker fanout MUST use preclip_crop overlays. A faceMask
    // fallback on N≥2 means one of the passes lost its preclip_crop — that
    // resurrects the wide-plate morph artefacts v204 was built to avoid.
    if (isFanout && donePasses.length >= 2 && facemasksUsed > 0) {
      const msg =
        `v205 guard: multi-speaker mux for scene=${sceneId} fell back to faceMask on ` +
        `${facemasksUsed}/${fanoutShots.length} shots (expected all preclip_crop). ` +
        `Refusing to dispatch — a pass is missing preclip_crop.`;
      console.error(`[render-sync-segments-audio-mux] ${msg}`);
      return json({ error: msg, code: "v205_facemask_fallback_on_multispeaker" }, 500);
    }

    // v194 diagnostic: how many done passes came from silent-stabilizers vs
    // active speakers. Silent stabilizers carry `is_silent_stabilizer=true`
    // on the pass row (written by compose-dialog-segments).
    const stabilizerPasses = donePasses.filter((p: any) => p?.is_silent_stabilizer === true || p?.stabilizer_pass === true);
    const activePasses = donePasses.filter((p: any) => !(p?.is_silent_stabilizer === true || p?.stabilizer_pass === true));
    console.log(
      `[render-sync-segments-audio-mux] scene=${sceneId} v164_mode=${useOverlay ? (isFanout ? `fanout-${donePasses.length}-speakers-windowed` : "single-tight-overlay") : "single-audio-swap"} master=${masterVideoUrlForMux.slice(0, 80)} shots=${fanoutShots.length} summary=${JSON.stringify(shotSummary)}`,
    );
    if (stabilizerPasses.length > 0) {
      console.log(
        `[render-sync-segments-audio-mux] scene=${sceneId} v194_silent_speaker_pass_composited passes=${donePasses.length} active=${activePasses.length} stabilizers=${stabilizerPasses.length} shots=${fanoutShots.length}`,
      );
    }

    const renderId = crypto.randomUUID();
    const outName = `dialog-stitch-muxed-${sceneId}-${Date.now()}.mp4`;
    const muxFramesPerLambda = Math.max(45, Math.ceil(durationInFrames / 5));

    const { error: insertErr } = await supabase
      .from("video_renders")
      .insert({
        render_id: renderId,
        project_id: (scene as any).project_id,
        user_id: userId,
        bucket_name: DEFAULT_BUCKET_NAME,
        source: "dialog-stitch",
        status: "pending",
        started_at: new Date().toISOString(),
        format_config: {
          format: "mp4",
          aspect_ratio: "16:9",
          width,
          height,
          fps,
        },
        content_config: {
          out_name: outName,
          durationInFrames,
          fps,
          width,
          height,
          totalDuration: totalSec,
          composer_scene_id: sceneId,
          stage: "sync_segments_audio_mux",
          shots: shotSummary,
        },
        subtitle_config: {},
      });
    if (insertErr) {
      console.error("[render-sync-segments-audio-mux] insert failed:", insertErr);
      return json({ error: `insert render: ${insertErr.message}` }, 500);
    }

    const webhookUrl = appendWebhookToken(
      `${supabaseUrl}/functions/v1/remotion-webhook`,
    );

    const lambdaPayload: Record<string, unknown> = {
      type: "start",
      serveUrl: Deno.env.get("REMOTION_SERVE_URL") || "",
      composition: "DialogStitchVideo",
      inputProps: {
        type: "payload",
        payload: JSON.stringify(inputProps),
      },
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 1,
      privacy: "public",
      logLevel: "warn",
      outName,
      bucketName: DEFAULT_BUCKET_NAME,
      width,
      height,
      fps,
      durationInFrames,
      framesPerLambda: muxFramesPerLambda,
      frameRange: [0, durationInFrames - 1],
      muted: false,
      audioCodec: "aac",
      scale: 1,
      envVariables: {},
      chromiumOptions: {},
      timeoutInMilliseconds: 600000,
      concurrencyPerLambda: 1,
      downloadBehavior: { type: "play-in-browser" },
      webhook: {
        url: webhookUrl,
        secret: null,
        customData: {
          pending_render_id: renderId,
          out_name: outName,
          user_id: userId,
          // Reuse the existing dialog-stitch webhook branch — it already
          // writes clip_url + lip_sync_applied_at + status='done' on success.
          source: "dialog-stitch",
          composer_scene_id: sceneId,
          composer_project_id: (scene as any).project_id,
          stage: "sync_segments_audio_mux",
        },
      },
    };

    console.log(
      `[render-sync-segments-audio-mux] scene=${sceneId} v193_mux_timing frames=${durationInFrames} framesPerLambda=${muxFramesPerLambda} estimated_lambdas=${Math.ceil(durationInFrames / muxFramesPerLambda)}`,
    );

    // Persist the dispatch on the scene BEFORE invoking, so a duplicate
    // call can short-circuit even if the Lambda invoke is in flight.
    const updatedState: DialogShotsState = {
      ...state,
      status: "audio_muxing",
      audio_mux: {
        render_id: renderId,
        dispatched_at: new Date().toISOString(),
      },
    };
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: updatedState,
        lip_sync_status: "audio_muxing",
        twoshot_stage: "audio_muxing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    const invokeResp = await fetch(
      `${supabaseUrl}/functions/v1/invoke-remotion-render`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
      },
    );
    const invokeRaw = await invokeResp.text().catch(() => "");
    let invokeResult: unknown = null;
    try { invokeResult = invokeRaw ? JSON.parse(invokeRaw) : null; } catch { invokeResult = invokeRaw; }

    if (!invokeResp.ok) {
      const invokeMessage =
        typeof invokeResult === "object" && invokeResult && "error" in invokeResult
          ? String((invokeResult as any).error)
          : invokeRaw;
      console.error(
        "[render-sync-segments-audio-mux] invoke failed:",
        invokeResp.status,
        invokeMessage,
      );
      await supabase
        .from("video_renders")
        .update({
          status: "failed",
          error_message: `invoke failed ${invokeResp.status}: ${invokeMessage}`.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("render_id", renderId);
      const retryState: DialogShotsState = { ...updatedState };
      delete retryState.audio_mux;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: {
            ...retryState,
            audio_mux_error: `invoke ${invokeResp.status}: ${invokeMessage}`.slice(0, 500),
          },
          lip_sync_status: "failed",
          twoshot_stage: "audio_mux_failed",
          clip_error: `audio_mux_dispatch: ${invokeMessage}`.slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      return json({ error: `invoke ${invokeResp.status}: ${invokeMessage}` }, 500);
    }

    console.log(
      `[render-sync-segments-audio-mux] scene=${sceneId} dispatched render=${renderId}`,
    );
    return json({
      ok: true,
      render_id: renderId,
      lambda: invokeResult ?? null,
    });
  } catch (e) {
    console.error("[render-sync-segments-audio-mux] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
