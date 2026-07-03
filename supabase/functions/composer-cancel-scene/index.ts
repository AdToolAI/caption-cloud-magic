/**
 * composer-cancel-scene — user-triggered cancel for a single composer scene.
 *
 * Input: { scene_ids: string[] }  (accepts single or bulk)
 * Marks each scene's clip_status/lip_sync_status → 'canceled' when currently
 * in an in-flight state, and best-effort DELETEs Sync.so jobs.
 * RLS-safe: only scenes belonging to projects owned by the caller are touched.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

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

const LIVE_CLIP = new Set(["pending", "queued", "generating", "composing", "lipsync"]);
const LIVE_LIPSYNC = new Set(["pending", "generating", "syncing"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "composer-cancel-scene" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawIds: unknown = body?.scene_ids ?? body?.sceneIds ?? (body?.scene_id ? [body.scene_id] : null);
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return json({ error: "scene_ids_required" }, 400);
    }
    const sceneIds = rawIds.filter((x): x is string => typeof x === "string").slice(0, 500);
    if (sceneIds.length === 0) return json({ error: "scene_ids_required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch scenes + owning project to verify ownership
    const { data: scenes, error: fetchErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, clip_status, lip_sync_status, lip_sync_applied_at, dialog_shots, audio_plan, replicate_prediction_id")
      .in("id", sceneIds);
    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!scenes || scenes.length === 0) return json({ ok: true, canceled: 0 });

    const projectIds = Array.from(new Set(scenes.map((s: any) => s.project_id)));
    const { data: projects } = await supabase
      .from("composer_projects")
      .select("id, user_id")
      .in("id", projectIds);
    const ownedProjects = new Set(
      (projects ?? []).filter((p: any) => p.user_id === userId).map((p: any) => p.id),
    );

    const authorized = (scenes as any[]).filter((s) => ownedProjects.has(s.project_id));
    if (authorized.length === 0) return json({ error: "forbidden" }, 403);

    const clipIds: string[] = [];
    const lipsyncIds: string[] = [];
    const syncJobs: string[] = [];

    for (const s of authorized) {
      if (LIVE_CLIP.has(s.clip_status)) clipIds.push(s.id);
      if (!s.lip_sync_applied_at && LIVE_LIPSYNC.has(s.lip_sync_status)) lipsyncIds.push(s.id);

      const state = s.dialog_shots ?? null;
      if (Array.isArray(state?.shots)) {
        for (const sh of state.shots) {
          if (typeof sh?.sync_job_id === "string" && sh.sync_job_id) syncJobs.push(sh.sync_job_id);
        }
      }
      const v5Jobs: any[] = s?.audio_plan?.twoshot?.syncJobs?.jobs ?? [];
      for (const j of v5Jobs) {
        const id = typeof j === "string" ? j : (j?.id ?? j?.job_id ?? j?.sync_job_id);
        if (typeof id === "string" && id) syncJobs.push(id);
      }
      const predId = s?.replicate_prediction_id;
      if (typeof predId === "string" && predId.startsWith("sync:")) {
        syncJobs.push(predId.replace(/^sync:/, ""));
      }
    }

    const uniqueJobs = Array.from(new Set(syncJobs));
    if (uniqueJobs.length > 0) {
      try {
        await supabase.from("syncso_inflight_jobs").delete().in("job_id", uniqueJobs);
      } catch (e) {
        console.warn(`[composer-cancel-scene] inflight cleanup: ${(e as Error).message}`);
      }
      const syncSoKey = Deno.env.get("SYNC_SO_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY");
      if (syncSoKey) {
        await Promise.all(
          uniqueJobs.map((id) =>
            fetch(`https://api.sync.so/v2/generations/${id}`, {
              method: "DELETE",
              headers: { "x-api-key": syncSoKey },
            }).catch(() => null),
          ),
        );
      }
    }

    const nowIso = new Date().toISOString();
    if (clipIds.length > 0) {
      await supabase
        .from("composer_scenes")
        .update({
          clip_status: "canceled",
          clip_error: "canceled_by_user",
          updated_at: nowIso,
        })
        .in("id", clipIds);
    }
    if (lipsyncIds.length > 0) {
      await supabase
        .from("composer_scenes")
        .update({
          lip_sync_status: "canceled",
          twoshot_stage: null,
          clip_error: "canceled_by_user",
          replicate_prediction_id: null,
          updated_at: nowIso,
        })
        .in("id", lipsyncIds);
    }

    console.log(
      `[composer-cancel-scene] user=${userId} scenes=${authorized.length} clips=${clipIds.length} lipsync=${lipsyncIds.length} syncso=${uniqueJobs.length}`,
    );

    return json({
      ok: true,
      canceled: clipIds.length + lipsyncIds.length,
      canceled_clips: clipIds.length,
      canceled_lipsync: lipsyncIds.length,
      canceled_syncso_jobs: uniqueJobs.length,
    });
  } catch (e) {
    console.error("[composer-cancel-scene] fatal", e);
    return json({ error: (e as Error).message ?? "unknown" }, 500);
  }
});
