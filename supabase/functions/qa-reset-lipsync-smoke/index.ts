// TEMPORARY QA smoke harness for v431 G1 composer_reset_lipsync_full.
// Deployed only for the acceptance smoke and deleted afterwards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PROJECT_ID = "04b80fab-090d-4108-a734-63e651c1b41c";

const AUDIO_PLAN = {
  twoshot: {
    // runtime keys (must be dropped)
    faceMap: { a: 1 },
    anchor_face_audit: { ok: true },
    sync_job_id: "job-1",
    segments_payload: [1],
    last_segments: [1],
    audio_input_mode: "mix",
    passes: [1],
    syncJobs: ["job-1", "job-2"],
    heartbeat: { at: "now" },
    lipsyncedAt: "2026-01-01",
    diagnostics: { x: 1 },
    anchor_attempts: 2,
    postFixReset: true,
    // planning keys (must survive)
    turns: [{ id: "t1" }],
    speakers: ["A", "B"],
    plan_version: 3,
  },
  other: { keep: true },
};

async function snapshot(db: any, id: string) {
  const { data } = await db.from("composer_scenes").select("*").eq("id", id).maybeSingle();
  const s: any = data ?? {};
  return {
    plate_generation: s.plate_generation,
    lip_sync_status: s.lip_sync_status,
    lip_sync_applied_at: s.lip_sync_applied_at,
    lip_sync_source_clip_url: s.lip_sync_source_clip_url,
    base_video_url: s.base_video_url,
    clip_url: s.clip_url,
    processed_video_url: s.processed_video_url,
    dialog_shots: s.dialog_shots,
    active_run_id: s.active_run_id,
    twoshot_keys: Object.keys(s.audio_plan?.twoshot ?? {}).sort(),
    audio_plan_other: s.audio_plan?.other,
    lip_sync_with_voiceover: s.lip_sync_with_voiceover,
    dialog_mode: s.dialog_mode,
    engine_override: s.engine_override,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const out: any = {};
  const created: string[] = [];

  const mk = async (extra: Record<string, unknown>) => {
    const { data, error } = await db
      .from("composer_scenes")
      .insert({
        project_id: PROJECT_ID,
        order_index: 999,
        duration_seconds: 5,
        audio_plan: AUDIO_PLAN,
        lip_sync_with_voiceover: true,
        dialog_mode: true,
        engine_override: "cinematic-sync",
        dialog_shots: [{ shot: 1, job_id: "job-1" }, { shot: 2, job_id: "job-2" }],
        ...extra,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    created.push(data.id);
    return data.id as string;
  };

  try {
    // A) running lip-sync
    const a = await mk({
      base_video_url: "https://x/base-a.mp4",
      clip_url: "https://x/processed-a.mp4",
      processed_video_url: "https://x/processed-a.mp4",
      lip_sync_status: "processing",
      lip_sync_source_clip_url: "https://x/base-a.mp4",
    });
    out.A_before = await snapshot(db, a);
    out.A_rpc = (await db.rpc("composer_reset_lipsync_full", {
      _scene_id: a, _expected_generation: 1, _expected_run_id: null,
    })).data;
    out.A_after = await snapshot(db, a);

    // B) already applied
    const b = await mk({
      base_video_url: "https://x/base-b.mp4",
      clip_url: "https://x/processed-b.mp4",
      processed_video_url: "https://x/processed-b.mp4",
      lip_sync_status: "completed",
      lip_sync_applied_at: new Date().toISOString(),
    });
    out.B_before = await snapshot(db, b);
    out.B_rpc = (await db.rpc("composer_reset_lipsync_full", {
      _scene_id: b, _expected_generation: 1, _expected_run_id: null,
    })).data;
    out.B_after = await snapshot(db, b);

    // C) stale (wrong expected generation)
    const c = await mk({
      base_video_url: "https://x/base-c.mp4",
      clip_url: "https://x/processed-c.mp4",
      processed_video_url: "https://x/processed-c.mp4",
      lip_sync_status: "processing",
    });
    out.C_before = await snapshot(db, c);
    out.C_rpc = (await db.rpc("composer_reset_lipsync_full", {
      _scene_id: c, _expected_generation: 99, _expected_run_id: null,
    })).data;
    out.C_after = await snapshot(db, c);

    // D) no base plate (processed set, no base, no source clip) -> fail closed
    const d = await mk({
      clip_url: "https://x/processed-d.mp4",
      processed_video_url: "https://x/processed-d.mp4",
      lip_sync_status: "processing",
    });
    out.D_before = await snapshot(db, d);
    out.D_rpc = (await db.rpc("composer_reset_lipsync_full", {
      _scene_id: d, _expected_generation: 1, _expected_run_id: null,
    })).data;
    out.D_after = await snapshot(db, d);

    // E) credits/reservations untouched
    out.credits = {
      reservations: (await db.from("composer_run_reservations").select("id", { count: "exact", head: true })).count,
    };

    return new Response(JSON.stringify({ ok: true, created, ...out }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, created }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (created.length && new URL(req.url).searchParams.get("keep") !== "1") {
      await db.from("composer_scenes").delete().in("id", created);
    }
  }
});
