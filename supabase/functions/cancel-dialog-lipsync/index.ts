/**
 * cancel-dialog-lipsync — sauberes Abbrechen eines laufenden Dialog/Lip-Sync.
 *
 * Macht idempotent:
 *  1. Auth: User muss eingeloggt sein und Owner des Composer-Projekts dieser Szene sein.
 *  2. Per-Scene Dialog-Lock holen (best-effort, läuft notfalls auch ohne).
 *  3. Alle `sync_job_id`s aus `dialog_shots.shots` aus `syncso_inflight_jobs` entfernen.
 *  4. `dialog_shots` auf `status='canceled'` setzen, alle nicht-`ready` Shots auf `canceled`.
 *  5. `composer_scenes` setzen:
 *       lip_sync_status='canceled', twoshot_stage=null, clip_error='lipsync_canceled_by_user'
 *  6. Wenn `body.reset === true`: zusätzlich `dialog_shots=null`, `replicate_prediction_id=null`,
 *     `lip_sync_applied_at=null`, sodass der nächste Trigger sauber von vorne startet.
 *
 * Spätere Sync.so- oder Remotion-Webhooks erkennen `lip_sync_status='canceled'` bzw.
 * `dialog_shots.status='canceled'` und ack'en, ohne den Lauf wiederzubeleben.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockResponse({ corsHeaders, kind: "video" });


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
    const sceneId: string | undefined = body?.scene_id ?? body?.sceneId;
    const reset: boolean = body?.reset === true;
    if (!sceneId) return json({ error: "scene_id_required" }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Authorization: user must own the composer project of this scene.
    const { data: scene, error: sceneErr } = await supabase
      .from("composer_scenes")
      .select("id, project_id, dialog_shots, lip_sync_status, lip_sync_applied_at")
      .eq("id", sceneId)
      .maybeSingle();
    if (sceneErr || !scene) return json({ error: "scene_not_found" }, 404);

    const { data: project } = await supabase
      .from("composer_projects")
      .select("user_id")
      .eq("id", scene.project_id)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return json({ error: "forbidden" }, 403);
    }

    if (scene.lip_sync_applied_at) {
      return json({ ok: true, skipped: "already_applied" });
    }

    // Acquire per-scene dispatch lock (best-effort, short TTL).
    const holder = `cancel-${crypto.randomUUID()}`;
    let acquired = false;
    try {
      const { data } = await supabase.rpc("try_acquire_dialog_lock", {
        _scene_id: sceneId,
        _holder: holder,
        _ttl_seconds: 30,
      });
      acquired = data === true;
    } catch {
      // ignore — proceed without lock
    }

    try {
      // Re-read inside the lock to get the freshest snapshot.
      const { data: fresh } = await supabase
        .from("composer_scenes")
        .select("dialog_shots, lip_sync_status, lip_sync_applied_at")
        .eq("id", sceneId)
        .maybeSingle();
      if ((fresh as any)?.lip_sync_applied_at) {
        return json({ ok: true, skipped: "already_applied" });
      }
      const state: any = (fresh as any)?.dialog_shots ?? null;

      // Collect every Sync.so job id we know about (v4 per-turn shots + v5
      // master-pass jobs persisted under audio_plan.twoshot.syncJobs).
      const jobIds: string[] = [];
      if (Array.isArray(state?.shots)) {
        for (const s of state.shots) {
          if (typeof s?.sync_job_id === "string" && s.sync_job_id.length > 0) {
            jobIds.push(s.sync_job_id);
          }
        }
      }
      try {
        const { data: sceneFull } = await supabase
          .from("composer_scenes")
          .select("audio_plan, replicate_prediction_id")
          .eq("id", sceneId)
          .maybeSingle();
        const plan: any = (sceneFull as any)?.audio_plan ?? {};
        const v5Jobs: any[] = plan?.twoshot?.syncJobs?.jobs ?? [];
        for (const j of v5Jobs) {
          const id = typeof j === "string" ? j : (j?.id ?? j?.job_id ?? j?.sync_job_id);
          if (typeof id === "string" && id.length > 0) jobIds.push(id);
        }
        const predId = (sceneFull as any)?.replicate_prediction_id;
        if (typeof predId === "string" && predId.startsWith("sync:")) {
          jobIds.push(predId.replace(/^sync:/, ""));
        }
      } catch {
        /* best-effort */
      }
      const uniqueJobIds = Array.from(new Set(jobIds));

      // Release inflight slot rows.
      if (uniqueJobIds.length > 0) {
        try {
          await supabase
            .from("syncso_inflight_jobs")
            .delete()
            .in("job_id", uniqueJobIds);
        } catch (e) {
          console.warn(
            `[cancel-dialog-lipsync] inflight cleanup failed: ${(e as Error).message}`,
          );
        }
      }

      // Best-effort: tell Sync.so to stop billing for in-flight jobs.
      // Sync.so DELETE /v2/generations/{id} cancels a queued/running job.
      const syncSoKey = Deno.env.get("SYNC_SO_API_KEY") ?? Deno.env.get("SYNCSO_API_KEY");
      if (syncSoKey && uniqueJobIds.length > 0) {
        await Promise.all(
          uniqueJobIds.map((id) =>
            fetch(`https://api.sync.so/v2/generations/${id}`, {
              method: "DELETE",
              headers: { "x-api-key": syncSoKey },
            })
              .then((r) =>
                console.log(
                  `[cancel-dialog-lipsync] sync.so DELETE job=${id} → ${r.status}`,
                ),
              )
              .catch((e) =>
                console.warn(
                  `[cancel-dialog-lipsync] sync.so DELETE job=${id} threw: ${(e as Error).message}`,
                ),
              ),
          ),
        );
      }

      const nowIso = new Date().toISOString();
      const canceledState = state
        ? {
            ...state,
            status: "canceled",
            canceled_at: nowIso,
            canceled_by: userId,
            finished_at: state.finished_at ?? nowIso,
            shots: Array.isArray(state.shots)
              ? state.shots.map((s: any) =>
                  s?.status === "ready"
                    ? s
                    : { ...s, status: "canceled", completed_at: s?.completed_at ?? nowIso },
                )
              : state.shots,
          }
        : null;

      const patch: Record<string, unknown> = {
        lip_sync_status: "canceled",
        lip_sync_with_voiceover: false,
        dialog_mode: false,
        engine_override: "auto",
        lip_sync_applied_at: null,
        lip_sync_source_clip_url: null,
        twoshot_stage: null,
        clip_error: "lipsync_canceled_by_user",
        replicate_prediction_id: null,
        updated_at: nowIso,
      };
      if (reset) {
        patch.dialog_shots = null;
      } else if (canceledState) {
        patch.dialog_shots = canceledState;
      }

      await supabase.from("composer_scenes").update(patch).eq("id", sceneId);

      console.log(
        `[cancel-dialog-lipsync] scene=${sceneId} user=${userId} jobs=${uniqueJobIds.length} reset=${reset}`,
      );

      return json({
        ok: true,
        scene_id: sceneId,
        canceled_jobs: uniqueJobIds.length,
        reset,
      });
    } finally {
      if (acquired) {
        try {
          await supabase.rpc("release_dialog_lock", {
            _scene_id: sceneId,
            _holder: holder,
          });
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.error("[cancel-dialog-lipsync] fatal", e);
    return json({ error: (e as Error).message ?? "unknown" }, 500);
  }
});
