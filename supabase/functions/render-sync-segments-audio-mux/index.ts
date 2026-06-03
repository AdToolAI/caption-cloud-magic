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

  let sceneIdForDiagnostics: string | undefined;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sceneId: string | undefined = body?.sceneId ?? body?.scene_id;
    sceneIdForDiagnostics = sceneId;
    if (!sceneId) return json({ error: "sceneId is required" }, 400);

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select(
        "id, project_id, dialog_shots, audio_plan, lip_sync_applied_at, clip_url",
      )
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: `scene not found: ${sceneErr?.message ?? ""}` }, 404);
    }

    const state = ((scene as any).dialog_shots ?? null) as DialogShotsState | null;
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
    if (state.audio_mux?.render_id) {
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
    const isFanout = donePasses.length >= 2;
    const sourcePlateUrl = String((state as any).source_clip_url ?? "");
    const masterVideoUrlForMux = isFanout && sourcePlateUrl ? sourcePlateUrl : finalLipsyncUrl;
    // Face-mask radius: smaller for crowded scenes; uses smaller plate axis
    // so the circle never exceeds the frame. ~22% of min-axis for 2 speakers,
    // scales down for 3 (≈18%) and 4 (≈15%).
    const minAxis = Math.min(width, height);
    const radiusForCount =
      donePasses.length <= 2 ? minAxis * 0.22 :
      donePasses.length === 3 ? minAxis * 0.18 :
      minAxis * 0.15;
    const fanoutShots = isFanout
      ? donePasses.map((p: any) => ({
          startSec: 0,
          endSec: totalSec,
          outputUrl: String(p.output_url),
          faceMask: {
            cx: Number(p.coords[0]),
            cy: Number(p.coords[1]),
            radius: radiusForCount,
          },
        }))
      : [];

    const inputProps = {
      masterVideoUrl: masterVideoUrlForMux,
      masterAudioUrl,
      totalSec,
      targetWidth: width,
      targetHeight: height,
      srcWidth: width,
      srcHeight: height,
      shots: fanoutShots,
    };

    console.log(
      `[render-sync-segments-audio-mux] scene=${sceneId} mode=${isFanout ? `fanout-${donePasses.length}-speakers` : "single-audio-swap"} master=${masterVideoUrlForMux.slice(0, 80)} shots=${fanoutShots.length}`,
    );

    const renderId = crypto.randomUUID();
    const outName = `dialog-stitch-muxed-${sceneId}-${Date.now()}.mp4`;

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
