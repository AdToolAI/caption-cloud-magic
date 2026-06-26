/**
 * composer-cancel-project — hartes Reset eines Composer-Projekts.
 *
 * Stoppt idempotent ALLE laufenden Renders/Lip-Sync-Jobs der Szenen eines
 * Projekts und markiert das Projekt als archiviert. Wird aufgerufen wenn der
 * User auf "Neues Projekt" klickt, damit alte Replicate-/Sync.so-Jobs nicht
 * im Hintergrund weiterlaufen und Credits verbrennen.
 *
 * Schritte (alle best-effort, fehlerfest):
 *   1. Auth check — User muss Owner des Projekts sein.
 *   2. Lade alle composer_scenes des Projekts.
 *   3. Sammle alle Sync.so job_ids aus dialog_shots.shots + audio_plan.twoshot.syncJobs.
 *   4. DELETE auf Sync.so /v2/generations/{id}, syncso_inflight_jobs cleanup.
 *   5. Update composer_scenes: clip_status='canceled' für pending/generating;
 *      lip_sync_status='canceled' für pending/generating/syncing.
 *   6. composer_projects.status = 'canceled'.
 *
 * Bestehende Webhooks (compose-clip-webhook, sync-so-webhook) erkennen
 * status='canceled' und acken stumm.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "composer-cancel-project" });


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const projectId: string | undefined = body?.project_id ?? body?.projectId;
    if (!projectId) return json({ error: "project_id_required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Authorization
    const { data: project } = await supabase
      .from("composer_projects")
      .select("id, user_id, status")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return json({ error: "project_not_found" }, 404);
    if ((project as any).user_id !== userId) {
      return json({ error: "forbidden" }, 403);
    }

    // Load all scenes
    const { data: scenes } = await supabase
      .from("composer_scenes")
      .select(
        "id, clip_status, lip_sync_status, lip_sync_applied_at, dialog_shots, audio_plan, replicate_prediction_id",
      )
      .eq("project_id", projectId);

    const allJobIds: string[] = [];
    const sceneIdsWithLipsync: string[] = [];
    const sceneIdsWithClip: string[] = [];

    for (const s of (scenes ?? []) as any[]) {
      // Sync.so job ids from dialog_shots.shots
      const state = s.dialog_shots ?? null;
      if (Array.isArray(state?.shots)) {
        for (const sh of state.shots) {
          if (typeof sh?.sync_job_id === "string" && sh.sync_job_id.length > 0) {
            allJobIds.push(sh.sync_job_id);
          }
        }
      }
      // v5 master-pass syncJobs
      const v5Jobs: any[] = s?.audio_plan?.twoshot?.syncJobs?.jobs ?? [];
      for (const j of v5Jobs) {
        const id = typeof j === "string" ? j : (j?.id ?? j?.job_id ?? j?.sync_job_id);
        if (typeof id === "string" && id.length > 0) allJobIds.push(id);
      }
      // replicate_prediction_id with sync: prefix
      const predId = s?.replicate_prediction_id;
      if (typeof predId === "string" && predId.startsWith("sync:")) {
        allJobIds.push(predId.replace(/^sync:/, ""));
      }

      // Classify scene for batch updates (skip already-applied lipsync).
      const ls = s.lip_sync_status;
      if (
        !s.lip_sync_applied_at &&
        (ls === "pending" || ls === "generating" || ls === "syncing")
      ) {
        sceneIdsWithLipsync.push(s.id);
      }
      const cs = s.clip_status;
      if (cs === "pending" || cs === "generating") {
        sceneIdsWithClip.push(s.id);
      }
    }

    const uniqueJobIds = Array.from(new Set(allJobIds));

    // Sync.so DELETE + inflight cleanup
    if (uniqueJobIds.length > 0) {
      try {
        await supabase
          .from("syncso_inflight_jobs")
          .delete()
          .in("job_id", uniqueJobIds);
      } catch (e) {
        console.warn(
          `[composer-cancel-project] inflight cleanup failed: ${(e as Error).message}`,
        );
      }

      const syncSoKey =
        Deno.env.get("SYNC_SO_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY");
      if (syncSoKey) {
        await Promise.all(
          uniqueJobIds.map((id) =>
            fetch(`https://api.sync.so/v2/generations/${id}`, {
              method: "DELETE",
              headers: { "x-api-key": syncSoKey },
            })
              .then((r) =>
                console.log(
                  `[composer-cancel-project] sync.so DELETE job=${id} → ${r.status}`,
                ),
              )
              .catch((e) =>
                console.warn(
                  `[composer-cancel-project] sync.so DELETE job=${id} threw: ${(e as Error).message}`,
                ),
              ),
          ),
        );
      }
    }

    const nowIso = new Date().toISOString();

    // Cancel lipsync scenes
    if (sceneIdsWithLipsync.length > 0) {
      try {
        await supabase
          .from("composer_scenes")
          .update({
            lip_sync_status: "canceled",
            twoshot_stage: null,
            clip_error: "canceled_by_user_new_project",
            replicate_prediction_id: null,
            updated_at: nowIso,
          })
          .in("id", sceneIdsWithLipsync);
      } catch (e) {
        console.warn(
          `[composer-cancel-project] lipsync update failed: ${(e as Error).message}`,
        );
      }
    }

    // Cancel pending/generating clips
    if (sceneIdsWithClip.length > 0) {
      try {
        await supabase
          .from("composer_scenes")
          .update({
            clip_status: "canceled",
            clip_error: "canceled_by_user_new_project",
            updated_at: nowIso,
          })
          .in("id", sceneIdsWithClip);
      } catch (e) {
        console.warn(
          `[composer-cancel-project] clip update failed: ${(e as Error).message}`,
        );
      }
    }

    // Mark project canceled
    try {
      await supabase
        .from("composer_projects")
        .update({ status: "canceled", updated_at: nowIso })
        .eq("id", projectId);
    } catch (e) {
      console.warn(
        `[composer-cancel-project] project status update failed: ${(e as Error).message}`,
      );
    }

    console.log(
      `[composer-cancel-project] project=${projectId} user=${userId} scenes=${scenes?.length ?? 0} jobs=${uniqueJobIds.length} lipsync=${sceneIdsWithLipsync.length} clips=${sceneIdsWithClip.length}`,
    );

    return json({
      ok: true,
      project_id: projectId,
      canceled_scenes:
        sceneIdsWithLipsync.length + sceneIdsWithClip.length,
      canceled_lipsync: sceneIdsWithLipsync.length,
      canceled_clips: sceneIdsWithClip.length,
      canceled_syncso_jobs: uniqueJobIds.length,
    });
  } catch (e) {
    console.error("[composer-cancel-project] fatal", e);
    return json({ error: (e as Error).message ?? "unknown" }, 500);
  }
});
