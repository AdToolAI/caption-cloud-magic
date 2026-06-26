/**
 * reset-lipsync-scene — explicit user-triggered "clean restart" endpoint.
 *
 * Always-safe entry point to abort whatever lip-sync state a scene is in
 * and put it back into a clean `pending` state ready for a brand-new run.
 *
 * Steps (idempotent):
 *   1. Verify caller owns the scene (auth via JWT).
 *   2. Call `failLipSync()` — cancels open Sync.so jobs, frees inflight slots,
 *      refunds credits once.
 *   3. Hard-reset the scene back to `pending` / null stages, clear
 *      dialog_shots + replicate_prediction_id so the auto-trigger sees a
 *      fresh candidate.
 *
 * Returns 200 on success. The auto-trigger (or a manual button click) then
 * starts a brand-new run.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { failLipSync } from "../_shared/lipsync-fail.ts";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "reset-lipsync-scene" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey);

  // Caller auth (JWT)
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: "unauthenticated" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const sceneId = String(body?.scene_id ?? "").trim();
  const force = body?.force === true;
  if (!sceneId) return json({ error: "scene_id_required" }, 400);

  // Ownership: scene → project → user
  const { data: scene } = await admin
    .from("composer_scenes")
    .select("id, project_id, dialog_shots, lip_sync_applied_at, lip_sync_source_clip_url, clip_url, clip_status, audio_plan")
    .eq("id", sceneId)
    .maybeSingle();
  if (!scene) return json({ error: "scene_not_found" }, 404);

  const { data: proj } = await admin
    .from("composer_projects")
    .select("id, user_id")
    .eq("id", (scene as any).project_id)
    .maybeSingle();
  if (!proj || (proj as any).user_id !== userId) {
    return json({ error: "forbidden" }, 403);
  }

  if ((scene as any).lip_sync_applied_at && !force) {
    return json({ ok: true, status: "already_applied" });
  }

  const refundCredits = Number((scene as any).dialog_shots?.cost_credits) || 0;
  await failLipSync({
    supabase: admin,
    sceneId,
    userId,
    reason: "user_reset",
    refundCredits,
    syncApiKey: getSyncApiKey() || null,
  });

  // Hard reset → ready for a brand-new auto-trigger pick-up.
  // Also clear the cached faceMap inside audio_plan.twoshot so the next run
  // re-detects faces against the current plate; a stale faceMap from a
  // previous (different aspect-ratio) clip would otherwise feed wrong
  // coordinates into Sync.so on every retry.
  const prevPlan = ((scene as any).audio_plan ?? {}) as Record<string, unknown>;
  const prevTwoshot = (prevPlan as any).twoshot ?? {};
  const cleanedTwoshot = { ...prevTwoshot };
  delete (cleanedTwoshot as any).faceMap;
  delete (cleanedTwoshot as any).anchor_face_audit;
  delete (cleanedTwoshot as any).sync_job_id;
  delete (cleanedTwoshot as any).segments_payload;
  delete (cleanedTwoshot as any).last_segments;
  delete (cleanedTwoshot as any).audio_input_mode;
  const cleanedPlan = { ...prevPlan, twoshot: cleanedTwoshot };
  const restoredSourceClip =
    force && typeof (scene as any).lip_sync_source_clip_url === "string"
      ? (scene as any).lip_sync_source_clip_url
      : (scene as any).clip_url;

  await admin
    .from("composer_scenes")
    .update({
      lip_sync_status: "pending",
      twoshot_stage: null,
      replicate_prediction_id: null,
      dialog_shots: null,
      clip_error: null,
      clip_url: restoredSourceClip ?? null,
      clip_status: restoredSourceClip ? "ready" : ((scene as any).clip_status ?? "pending"),
      lip_sync_source_clip_url: null,
      lip_sync_applied_at: null,
      audio_plan: cleanedPlan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sceneId);

  return json({ ok: true, status: "reset", scene_id: sceneId });
});
