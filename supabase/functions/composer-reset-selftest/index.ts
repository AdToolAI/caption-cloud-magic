// composer-reset-selftest — v380
//
// Beweis statt Behauptung: prüft an einer REALEN Szene (read-only, ohne
// Dispatch), ob der Hard-Reset die Pipeline vollständig leert. Aufruf:
//   POST { scene_id: "<uuid>", dry_run?: true }
//
// dry_run=true (Default): liest nur den aktuellen Zustand und meldet, welche
// abgeleiteten Reste noch an der Szene hängen.
// dry_run=false: führt `hardResetScene` aus und verifiziert danach, dass jedes
// abgeleitete Feld leer und jeder offene Render/Attempt geschlossen ist.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hardResetScene,
  stripDerivedAudioPlan,
  stripDerivedSceneAssets,
} from "../_shared/scene-hard-reset.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sceneId = String(body?.scene_id ?? "").trim();
    const dryRun = body?.dry_run !== false;
    if (!sceneId) return json({ error: "missing_scene_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Aufrufer muss Eigentümer des Projekts sein.
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const callerId = userData?.user?.id ?? null;
    if (!callerId) return json({ error: "unauthorized" }, 401);

    const readScene = async () => {
      const { data } = await admin
        .from("composer_scenes")
        .select(
          "id, project_id, plate_generation, plate_ready_generation, active_run_id, clip_url, clip_status, clip_error, lip_sync_status, lip_sync_applied_at, lip_sync_source_clip_url, twoshot_stage, dialog_shots, dialog_takes, audio_plan, scene_assets, replicate_prediction_id",
        )
        .eq("id", sceneId)
        .maybeSingle();
      return data as Record<string, any> | null;
    };

    const before = await readScene();
    if (!before) return json({ error: "scene_not_found" }, 404);

    const { data: project } = await admin
      .from("composer_projects")
      .select("id, user_id")
      .eq("id", before.project_id)
      .maybeSingle();
    if (!project || project.user_id !== callerId) {
      return json({ error: "forbidden" }, 403);
    }

    const openArtifacts = async () => {
      const [renders, attempts, inflight, locks] = await Promise.all([
        admin
          .from("video_renders")
          .select("render_id, status, content_config")
          .contains("content_config", { composer_scene_id: sceneId })
          .in("status", ["pending", "queued"]),
        admin
          .from("plate_attempts")
          .select("id, generation, status")
          .eq("scene_id", sceneId)
          .in("status", ["open", "running", "dispatched"]),
        admin.from("syncso_inflight_jobs").select("job_id").eq("scene_id", sceneId),
        admin.from("dialog_dispatch_locks").select("scene_id").eq("scene_id", sceneId),
      ]);
      return {
        openRenders: renders.data ?? [],
        openAttempts: attempts.data ?? [],
        inflightJobs: inflight.data ?? [],
        dispatchLocks: locks.data ?? [],
      };
    };

    const artifactsBefore = await openArtifacts();

    if (dryRun) {
      const residue = {
        audio_plan_derived_keys_present:
          JSON.stringify(before.audio_plan ?? null) !==
          JSON.stringify(stripDerivedAudioPlan(before.audio_plan)),
        scene_assets_derived_keys_present:
          JSON.stringify(before.scene_assets ?? null) !==
          JSON.stringify(stripDerivedSceneAssets(before.scene_assets)),
      };
      return json({
        ok: true,
        mode: "dry_run",
        scene_id: sceneId,
        generation: before.plate_generation,
        active_run_id: before.active_run_id,
        residue,
        artifacts: {
          open_renders: artifactsBefore.openRenders.length,
          open_attempts: artifactsBefore.openAttempts.length,
          inflight_jobs: artifactsBefore.inflightJobs.length,
          dispatch_locks: artifactsBefore.dispatchLocks.length,
        },
      });
    }

    const result = await hardResetScene({
      supabase: admin as any,
      sceneId,
      userId: callerId,
      projectId: String(before.project_id),
      reason: "v380_selftest",
      syncApiKey: Deno.env.get("SYNC_SO_API_KEY") ?? null,
    } as any);

    const after = await readScene();
    const artifactsAfter = await openArtifacts();

    const checks: Check[] = [
      {
        name: "generation_bumped",
        pass: Number(after?.plate_generation ?? 0) > Number(before.plate_generation ?? 0),
        detail: `${before.plate_generation} → ${after?.plate_generation}`,
      },
      { name: "clip_url_cleared", pass: !after?.clip_url },
      { name: "clip_error_cleared", pass: !after?.clip_error },
      { name: "lip_sync_state_cleared", pass: !after?.lip_sync_status && !after?.lip_sync_applied_at },
      { name: "dialog_shots_cleared", pass: after?.dialog_shots == null },
      { name: "twoshot_stage_cleared", pass: after?.twoshot_stage == null },
      {
        name: "audio_plan_derived_stripped",
        pass:
          JSON.stringify(after?.audio_plan ?? null) ===
          JSON.stringify(stripDerivedAudioPlan(after?.audio_plan)),
      },
      {
        name: "scene_assets_derived_stripped",
        pass:
          JSON.stringify(after?.scene_assets ?? null) ===
          JSON.stringify(stripDerivedSceneAssets(after?.scene_assets)),
      },
      {
        name: "no_open_renders_from_old_generation",
        pass: artifactsAfter.openRenders.every(
          (r: any) =>
            Number(r?.content_config?.plate_generation ?? 0) >=
            Number(after?.plate_generation ?? 0),
        ),
        detail: `${artifactsAfter.openRenders.length} offen`,
      },
      {
        name: "no_open_plate_attempts",
        pass: artifactsAfter.openAttempts.length === 0,
        detail: `${artifactsAfter.openAttempts.length} offen`,
      },
      {
        name: "inflight_jobs_released",
        pass: artifactsAfter.inflightJobs.length === 0,
      },
      {
        name: "dispatch_locks_released",
        pass: artifactsAfter.dispatchLocks.length === 0,
      },
      {
        name: "no_active_run_after_reset",
        pass: !after?.active_run_id,
        detail: String(after?.active_run_id ?? "none"),
      },
    ];

    const failed = checks.filter((c) => !c.pass);
    console.log(
      `[composer-reset-selftest] scene=${sceneId} checks=${checks.length} failed=${failed.length} reset_errors=${result.errors.length}`,
    );

    return json({
      ok: failed.length === 0,
      mode: "reset",
      scene_id: sceneId,
      reset: result,
      checks,
      failed: failed.map((c) => c.name),
    });
  } catch (e) {
    return json({ error: "selftest_crash", message: (e as Error).message }, 500);
  }
});
