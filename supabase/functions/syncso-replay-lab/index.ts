/**
 * syncso-replay-lab — Root-Cause-Matrix
 *
 * Admin-only orchestrator that re-dispatches the SAME failed Sync.so pass
 * with a controlled variant matrix to isolate which input dimension is
 * actually causing `generation_unknown_error`. Strictly isolated:
 *
 *   - never writes to composer_scenes / dialog_shots
 *   - never refunds, never wakes the watchdog
 *   - reuses the existing `syncso-replay` single-preset dispatcher
 *     (which writes only to `syncso_replay_log` and points Sync.so at
 *     `syncso-replay-webhook`)
 *
 * Body: { scene_id, pass_index?, reason, confirm }
 * Returns immediately after dispatching; results land in
 * `syncso_replay_log` rows tagged with `notes = "lab:<batch_id>:<preset>"`.
 *
 * UI then polls those rows and shows the verdict.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Variant matrix — only presets that DON'T need ffmpeg asset transforms.
// Audio-trim / codec-renorm variants are documented as a follow-up; they
// need a separate ffmpeg-capable function (Replicate or similar). The five
// variants below are enough to isolate model / ASD / sync_mode / coords
// as root cause categories, which is what we need first.
const MATRIX: Array<{ preset: string; hypothesis: string }> = [
  { preset: "exact",          hypothesis: "Reproduces original failure (baseline)." },
  { preset: "omit_sync_mode", hypothesis: "If this PASSES → `cut_off` is the killer." },
  { preset: "auto_detect",    hypothesis: "If this PASSES → ASD coords/frame_number wrong." },
  { preset: "bboxes",         hypothesis: "If this PASSES → per-frame box path beats single-coord ASD." },
  { preset: "lipsync_2_pro",  hypothesis: "If this PASSES → sync-3 model itself is the incompat." },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return json({ error: "unauthorized", detail: userErr?.message ?? null }, 401);
  }
  const userId = userData.user.id;

  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "forbidden_admin_only" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const sceneId: string | undefined = body?.scene_id;
  const passIndex: number = Number.isInteger(body?.pass_index) ? body.pass_index : 0;
  const reason: string = (body?.reason ?? "").trim();
  const confirm: boolean = body?.confirm === true;

  if (!sceneId) return json({ error: "missing_scene_id" }, 400);
  if (reason.length < 5) return json({ error: "reason_required_min_5_chars" }, 400);
  if (!confirm) return json({ error: "confirm_required" }, 400);

  // Quick existence check
  const { data: scene, error: sceneErr } = await admin
    .from("composer_scenes")
    .select("id, dialog_shots")
    .eq("id", sceneId)
    .maybeSingle();
  if (sceneErr || !scene) return json({ error: "scene_not_found" }, 404);
  const passes = (scene as any)?.dialog_shots?.passes ?? [];
  if (!passes[passIndex]) {
    return json({ error: "pass_not_found", available: passes.length }, 404);
  }

  const batchId = crypto.randomUUID();
  const replayUrl = `${SUPABASE_URL}/functions/v1/syncso-replay`;

  // Fan out sequentially with small spacing to avoid hammering Sync.so's
  // validator and to keep webhook ordering interpretable.
  const dispatched: Array<Record<string, unknown>> = [];
  for (const variant of MATRIX) {
    const tag = `lab:${batchId}:${variant.preset}`;
    try {
      const r = await fetch(replayUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scene_id: sceneId,
          pass_index: passIndex,
          preset: variant.preset,
          reason: `${reason} [${tag}]`,
          confirm: true,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const data = await r.json().catch(() => ({}));

      // Tag the resulting row so the UI can collect this batch.
      if (data?.replay_log_id) {
        await admin
          .from("syncso_replay_log")
          .update({ notes: tag })
          .eq("id", data.replay_log_id);
      }

      dispatched.push({
        preset: variant.preset,
        hypothesis: variant.hypothesis,
        http_status: r.status,
        replay_log_id: data?.replay_log_id ?? null,
        replay_provider_job_id: data?.replay_provider_job_id ?? null,
        dispatch_status: data?.provider_status ?? null,
        dispatch_error: data?.provider_error ?? data?.error ?? null,
      });
    } catch (e) {
      dispatched.push({
        preset: variant.preset,
        hypothesis: variant.hypothesis,
        http_status: 0,
        replay_log_id: null,
        replay_provider_job_id: null,
        dispatch_status: "fanout_crash",
        dispatch_error: (e as Error)?.message ?? String(e),
      });
    }
    // small spacing
    await new Promise((res) => setTimeout(res, 400));
  }

  return json({
    ok: true,
    batch_id: batchId,
    scene_id: sceneId,
    pass_index: passIndex,
    dispatched,
    poll: {
      table: "syncso_replay_log",
      filter: `notes ILIKE 'lab:${batchId}:%'`,
      note: "Poll for provider_status in {completed, failed, dispatched, dispatching}. Webhook updates rows as Sync.so finishes (~30–90s/variant).",
    },
  });
});
