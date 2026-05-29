/**
 * render-dialog-turn — Per-Turn Preclip Lambda Dispatcher
 *
 * Materialisiert exakt das `render_window` eines Dialog-Turns als kurzen
 * MP4-Clip via Remotion Lambda (`DialogTurnClipVideo`). Sync.so bekommt
 * danach diesen kurzen Clip ab t=0 — ohne `segments_secs` —, was die
 * "An unknown error occurred"-Failures von Sync.so eliminiert.
 *
 * Input  : { sceneId, shotIdx }
 * Reads  : composer_scenes.dialog_shots.shots[shotIdx]
 * Action : - Idempotency-Check (shot.preclip_render_id + video_renders row)
 *          - video_renders insert (source='dialog-turn-preclip')
 *          - Lambda invoke via invoke-remotion-render
 *          - shot.preclip_status='rendering', shot.preclip_render_id set
 *          - remotion-webhook schreibt preclip_url + nudged poll-dialog-shots
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const sceneId: string | undefined = body?.sceneId ?? body?.scene_id;
    const shotIdx: number | undefined = Number.isFinite(body?.shotIdx)
      ? Number(body.shotIdx)
      : Number.isFinite(body?.shot_idx)
        ? Number(body.shot_idx)
        : undefined;
    if (!sceneId || shotIdx === undefined) {
      return json({ error: "sceneId and shotIdx required" }, 400);
    }

    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, dialog_shots, lip_sync_applied_at")
      .eq("id", sceneId)
      .single();
    if (sceneErr || !scene) return json({ error: "scene not found" }, 404);
    if (scene.lip_sync_applied_at) return json({ ok: true, already_done: true });

    const state = (scene as any).dialog_shots;
    if (!state || !Array.isArray(state.shots)) {
      return json({ error: "no dialog_shots state" }, 400);
    }
    const shots = state.shots.map((s: any) => ({ ...s }));
    const shot = shots[shotIdx];
    if (!shot) return json({ error: `shot ${shotIdx} not found` }, 404);

    // Already rendered or in flight?
    if (shot.preclip_url) return json({ ok: true, already_done: true, preclip_url: shot.preclip_url });
    if (shot.preclip_render_id) {
      const { data: existing } = await supabase
        .from("video_renders")
        .select("status")
        .eq("render_id", shot.preclip_render_id)
        .maybeSingle();
      if (existing && ["pending", "rendering", "completed"].includes(String(existing.status))) {
        return json({ ok: true, already_dispatched: true, render_id: shot.preclip_render_id, status: existing.status });
      }
    }

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", (scene as any).project_id)
      .single();
    const userId = (project as any)?.user_id;
    if (!userId) return json({ error: "project user_id missing" }, 500);

    const win = (Array.isArray(shot.render_window) && shot.render_window.length === 2
      ? shot.render_window
      : shot.window) as [number, number];
    const startSec = Math.max(0, Number(win?.[0]) || 0);
    const endSec = Math.max(startSec + 0.1, Number(win?.[1]) || startSec + 0.1);
    const fps = 30;
    const dur = endSec - startSec;
    const durationInFrames = Math.max(3, Math.ceil(dur * fps));
    const width = evenDimension(state.video_width, 1280);
    const height = evenDimension(state.video_height, 720);

    const inputProps = {
      masterVideoUrl: state.source_clip_url,
      startSec,
      endSec,
      targetWidth: width,
      targetHeight: height,
    };

    const renderId = crypto.randomUUID();
    const outName = `dialog-turn-${sceneId}-${shotIdx}-${Date.now()}.mp4`;

    const { error: insertErr } = await supabase
      .from("video_renders")
      .insert({
        render_id: renderId,
        project_id: (scene as any).project_id,
        user_id: userId,
        bucket_name: DEFAULT_BUCKET_NAME,
        source: "dialog-turn-preclip",
        status: "pending",
        started_at: new Date().toISOString(),
        format_config: { format: "mp4", aspect_ratio: "16:9", width, height, fps },
        content_config: {
          out_name: outName,
          durationInFrames,
          fps,
          width,
          height,
          composer_scene_id: sceneId,
          shot_idx: shotIdx,
        },
        subtitle_config: {},
      });
    if (insertErr) {
      return json({ error: `insert render: ${insertErr.message}` }, 500);
    }

    const webhookUrl = appendWebhookToken(`${supabaseUrl}/functions/v1/remotion-webhook`);

    const lambdaPayload: Record<string, unknown> = {
      type: "start",
      serveUrl: Deno.env.get("REMOTION_SERVE_URL") || "",
      composition: "DialogTurnClipVideo",
      inputProps: { type: "payload", payload: JSON.stringify(inputProps) },
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
      muted: true,
      audioCodec: "aac",
      scale: 1,
      envVariables: {},
      chromiumOptions: {},
      timeoutInMilliseconds: 300000,
      concurrencyPerLambda: 1,
      downloadBehavior: { type: "play-in-browser" },
      webhook: {
        url: webhookUrl,
        secret: null,
        customData: {
          pending_render_id: renderId,
          out_name: outName,
          user_id: userId,
          source: "dialog-turn-preclip",
          composer_scene_id: sceneId,
          composer_project_id: (scene as any).project_id,
          shot_idx: shotIdx,
        },
      },
    };

    // Persist render-id on the shot BEFORE invoking so duplicate calls
    // short-circuit via the idempotency check above.
    shot.preclip_render_id = renderId;
    shot.preclip_status = "rendering";
    shot.preclip_started_at = new Date().toISOString();
    shots[shotIdx] = shot;
    await supabase
      .from("composer_scenes")
      .update({
        dialog_shots: { ...state, shots },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sceneId);

    const invokeResp = await fetch(`${supabaseUrl}/functions/v1/invoke-remotion-render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ lambdaPayload, pendingRenderId: renderId, userId }),
    });
    const invokeRaw = await invokeResp.text().catch(() => "");
    if (!invokeResp.ok) {
      // Roll back the shot dispatch markers so the next tick retries.
      shot.preclip_render_id = undefined;
      shot.preclip_status = "failed";
      shot.preclip_error = `invoke ${invokeResp.status}: ${invokeRaw.slice(0, 240)}`;
      shots[shotIdx] = shot;
      await supabase
        .from("composer_scenes")
        .update({
          dialog_shots: { ...state, shots },
          updated_at: new Date().toISOString(),
        })
        .eq("id", sceneId);
      await supabase
        .from("video_renders")
        .update({
          status: "failed",
          error_message: `invoke ${invokeResp.status}: ${invokeRaw}`.slice(0, 500),
          completed_at: new Date().toISOString(),
        })
        .eq("render_id", renderId);
      return json({ error: `invoke ${invokeResp.status}: ${invokeRaw}` }, 500);
    }

    return json({ ok: true, render_id: renderId, shot_idx: shotIdx });
  } catch (e) {
    console.error("[render-dialog-turn] fatal", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
