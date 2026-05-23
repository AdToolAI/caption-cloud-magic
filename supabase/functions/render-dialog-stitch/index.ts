/**
 * render-dialog-stitch — Lambda dispatcher for the cinematic-sync dialog
 * stitching step. Replaces the forbidden Edge-Runtime ffmpeg call that was
 * previously inside poll-dialog-shots.
 *
 * Input  : { sceneId }
 * Reads  : composer_scenes.dialog_shots (v4 state with all shots ready)
 * Action : creates a video_renders row, invokes the Remotion Lambda with the
 *          DialogStitchVideo composition, returns 202. The remotion-webhook
 *          edge function picks up the result and writes back to
 *          composer_scenes.clip_url / lip_sync_applied_at on success
 *          (source = 'dialog-stitch').
 *
 * Idempotency: if dialog_shots.stitch.render_id is already set and the
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

interface DialogShot {
  idx: number;
  window: [number, number];
  /** v9: slightly expanded render range (lead-in/tail). Stitch prefers this
   *  so its overlay slice matches the Sync.so `segments_secs` exactly. */
  render_window?: [number, number];
  status: string;
  output_url?: string;
  speaker_name?: string;
}

interface DialogShotsState {
  version: number;
  status: string;
  shots: DialogShot[];
  source_clip_url: string;
  master_audio_url: string;
  total_sec: number;
  cost_credits: number;
  video_width?: number;
  video_height?: number;
  refunded?: boolean;
  stitch?: {
    render_id: string;
    dispatched_at: string;
  };
}

function evenDimension(value: unknown, fallback: number): number {
  const n = Number(value);
  const safe = Number.isFinite(n) && n >= 64 ? Math.round(n) : fallback;
  return safe % 2 === 0 ? safe : safe - 1;
}

async function markSceneError(
  supabase: ReturnType<typeof createClient>,
  sceneId: string,
  state: DialogShotsState | null,
  message: string,
) {
  const patch: Record<string, unknown> = {
    lip_sync_status: "stitching",
    twoshot_stage: "dialog_stitching",
    clip_error: `dialog_stitch_dispatch: ${message}`.slice(0, 300),
    updated_at: new Date().toISOString(),
  };
  if (state) {
    patch.dialog_shots = {
      ...state,
      status: "stitching",
      stitch_error: message.slice(0, 500),
    };
  }
  await supabase
    .from("composer_scenes")
    .update(patch)
    .eq("id", sceneId);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      .select("id, project_id, dialog_shots, lip_sync_applied_at")
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) {
      return json({ error: `scene not found: ${sceneErr?.message ?? ""}` }, 404);
    }
    if (scene.lip_sync_applied_at) {
      return json({ ok: true, already_done: true });
    }

    const state = (scene.dialog_shots ?? null) as DialogShotsState | null;
    if (!state || !Array.isArray(state.shots) || state.shots.length === 0) {
      return json({ error: "no dialog_shots state" }, 400);
    }

    const allReady = state.shots.every(
      (s) => s.status === "ready" && !!s.output_url,
    );
    if (!allReady) {
      return json({ error: "not all shots ready" }, 409);
    }

    // ── Idempotency: existing render still in flight ────────────────────
    if (state.stitch?.render_id) {
      const { data: existing } = await supabase
        .from("video_renders")
        .select("status")
        .eq("render_id", state.stitch.render_id)
        .maybeSingle();
      if (
        existing &&
        ["pending", "rendering", "completed"].includes(String(existing.status))
      ) {
        return json({
          ok: true,
          already_dispatched: true,
          render_id: state.stitch.render_id,
          status: existing.status,
        });
      }
    }

    // ── Project / user lookup ───────────────────────────────────────────
    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .single();
    const userId = project?.user_id;
    if (!userId) return json({ error: "project user_id missing" }, 500);

    // ── Build Lambda payload ────────────────────────────────────────────
    const fps = 30;
    const totalSec = Number(state.total_sec) || 6;
    const durationInFrames = Math.max(30, Math.ceil(totalSec * fps));
    const width = evenDimension(state.video_width, 1280);
    const height = evenDimension(state.video_height, 720);

    const inputProps = {
      masterVideoUrl: state.source_clip_url,
      masterAudioUrl: state.master_audio_url,
      totalSec,
      targetWidth: width,
      targetHeight: height,
      shots: state.shots
        .filter((s) => s.output_url)
        .map((s) => {
          const win = (s.render_window ?? s.window) as [number, number];
          return {
            startSec: Math.max(0, Number(win?.[0]) || 0),
            endSec: Math.min(totalSec, Number(win?.[1]) || totalSec),
            outputUrl: s.output_url as string,
          };
        }),
    };

    const renderId = crypto.randomUUID();
    const outName = `dialog-stitch-${sceneId}-${Date.now()}.mp4`;

    const { error: insertErr } = await supabase
      .from("video_renders")
      .insert({
        render_id: renderId,
        project_id: scene.project_id,
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
        },
        subtitle_config: {},
      });
    if (insertErr) {
      console.error("[render-dialog-stitch] insert failed:", insertErr);
      await markSceneError(supabase, sceneId, state, `insert render: ${insertErr.message}`);
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
          source: "dialog-stitch",
          composer_scene_id: sceneId,
          composer_project_id: scene.project_id,
        },
      },
    };

    // Persist the dispatch on the scene BEFORE invoking, so a duplicate
    // call can short-circuit even if the Lambda invoke is in flight.
    const updatedState: DialogShotsState = {
      ...state,
      status: "stitching",
      stitch: {
        render_id: renderId,
        dispatched_at: new Date().toISOString(),
      },
    };
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: updatedState,
        lip_sync_status: "stitching",
        twoshot_stage: "dialog_stitching",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    const invokeResp = await fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
    });
    const invokeRaw = await invokeResp.text().catch(() => "");
    let invokeResult: unknown = null;
    try { invokeResult = invokeRaw ? JSON.parse(invokeRaw) : null; } catch { invokeResult = invokeRaw; }

    if (!invokeResp.ok) {
      const invokeMessage = typeof invokeResult === "object" && invokeResult && "error" in invokeResult
        ? String((invokeResult as any).error)
        : invokeRaw;
      console.error("[render-dialog-stitch] invoke failed:", invokeResp.status, invokeMessage);
      await supabase
        .from("video_renders")
        .update({
          status: "failed",
          error_message: `invoke failed ${invokeResp.status}: ${invokeMessage}`.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("render_id", renderId);
      const retryState: DialogShotsState = { ...state, status: "stitching" };
      delete retryState.stitch;
      await markSceneError(supabase, sceneId, retryState, `invoke ${invokeResp.status}: ${invokeMessage}`);
      return json({ error: `invoke ${invokeResp.status}: ${invokeMessage}` }, 500);
    }

    return json({
      ok: true,
      render_id: renderId,
      lambda: invokeResult ?? null,
    });
  } catch (e) {
    console.error("[render-dialog-stitch] fatal", e);
    if (sceneIdForDiagnostics) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        await markSceneError(
          supabase,
          sceneIdForDiagnostics,
          null,
          e instanceof Error ? e.message : "unknown fatal",
        );
      } catch {
        // best-effort diagnostics only
      }
    }
    return json(
      { error: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
