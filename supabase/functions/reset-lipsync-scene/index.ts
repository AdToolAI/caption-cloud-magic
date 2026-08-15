/**
 * reset-lipsync-scene — explicit user-triggered "clean restart" endpoint.
 *
 * v431 RS3 (Option A): der komplette Reset ist EIN atomarer DB-Commit
 * (`composer_reset_lipsync_with_attempt_cancellation`):
 *   - offene Lip-Sync-Ledger-Attempts (`sync_segment`, `audio_mux`) werden
 *     `cancelled` / `error_code='user_reset'`; terminale bleiben unberührt,
 *   - die Szene wird auf den bekannten Reset-Feldsatz zurückgesetzt,
 *   - ein Reset-Marker (`audio_plan.twoshot.rs3_reset`) autorisiert genau einen
 *     On-Demand-Nachfolger je Stage/Segment und fenced alle Pre-Reset-Callbacks.
 *
 * Diese Funktion macht danach nur noch: Auth/Ownership, den RPC-Aufruf und
 * NACH dem Commit best-effort Provider-Cancels + den idempotenten Refund.
 * Eigene Scene-Writes gibt es hier nicht mehr.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";
import { getSyncApiKey } from "../_shared/syncso-preflight.ts";

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
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
    .select("id, project_id, active_run_id, plate_generation, dialog_shots, audio_plan")
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

  // Zusätzliche Provider-IDs aus dem Legacy-State einsammeln, bevor der RPC
  // `dialog_shots` löscht — sie werden nur für Best-effort-Cancels benutzt.
  const legacyJobIds = new Set<string>();
  const ds: any = (scene as any).dialog_shots ?? null;
  for (const p of Array.isArray(ds?.passes) ? ds.passes : []) {
    if (typeof p?.job_id === "string" && p.job_id) legacyJobIds.add(p.job_id);
  }
  for (const s of Array.isArray(ds?.shots) ? ds.shots : []) {
    if (typeof s?.sync_job_id === "string" && s.sync_job_id) legacyJobIds.add(s.sync_job_id);
  }
  if (typeof ds?.sync_job_id === "string" && ds.sync_job_id) legacyJobIds.add(ds.sync_job_id);

  // ── RS3: ein Commit ────────────────────────────────────────────────────
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "composer_reset_lipsync_with_attempt_cancellation",
    {
      _scene_id: sceneId,
      _expected_run_id: (scene as any).active_run_id ?? null,
      _expected_plate_generation: typeof (scene as any).plate_generation === "number"
        ? (scene as any).plate_generation
        : null,
      _force: force,
    },
  );
  if (rpcError) {
    console.error(`[reset-lipsync-scene] rs3_reset_failed scene=${sceneId}: ${rpcError.message}`);
    return json({ error: "reset_failed", detail: rpcError.message }, 500);
  }
  const result: any = rpcData ?? {};
  if (result?.ok !== true) {
    return json({ ok: false, status: result?.outcome ?? "reset_rejected", scene_id: sceneId }, 409);
  }
  if (result.outcome === "already_applied") {
    return json({ ok: true, status: "already_applied" });
  }

  // ── Post-Commit: best-effort Provider-Cancels ──────────────────────────
  for (const id of (Array.isArray(result.external_job_ids) ? result.external_job_ids : [])) {
    if (typeof id === "string" && id.length > 0) legacyJobIds.add(id.replace(/^sync:/, ""));
  }
  const ids = Array.from(legacyJobIds);
  if (ids.length > 0) {
    try {
      await admin.from("syncso_inflight_jobs").delete().in("job_id", ids);
    } catch (e) {
      console.warn(`[reset-lipsync-scene] inflight cleanup: ${(e as Error).message}`);
    }
    const syncApiKey = getSyncApiKey() || null;
    if (syncApiKey) {
      await Promise.all(ids.map((id) =>
        fetch(`https://api.sync.so/v2/generations/${id}`, {
          method: "DELETE",
          headers: { "x-api-key": syncApiKey },
        })
          .then((r) => console.log(`[reset-lipsync-scene] sync.so DELETE ${id} → ${r.status}`))
          .catch((e) => console.warn(`[reset-lipsync-scene] sync.so DELETE ${id}: ${(e as Error).message}`))
      ));
    }
  }

  // ── Post-Commit: Refund. Der Anspruch wurde im Reset-Commit EINMALIG
  // beansprucht (`refund_claimed`), deshalb kann er hier nicht doppeln.
  const refundCredits = Number(result.refund_credits) || 0;
  let refunded = false;
  if (result.refund_claimed === true && refundCredits > 0) {
    try {
      const { data: wallet } = await admin
        .from("wallets").select("balance").eq("user_id", userId).single();
      if (wallet) {
        await admin.from("wallets").update({
          balance: Number((wallet as any).balance ?? 0) + refundCredits,
          updated_at: new Date().toISOString(),
        }).eq("user_id", userId);
        refunded = true;
      }
    } catch (e) {
      console.warn(`[reset-lipsync-scene] refund crash: ${(e as Error).message}`);
    }
  }

  console.log(`[reset-lipsync-scene] rs3 reset scene=${sceneId}`, JSON.stringify({
    reset_id: result.reset_id,
    canceled: result.canceled_job_ids,
    authorized_segments: result.authorized_segments,
    refunded,
  }));

  return json({
    ok: true,
    status: "reset",
    scene_id: sceneId,
    reset_id: result.reset_id,
    canceled_job_ids: result.canceled_job_ids ?? [],
    authorized_segments: result.authorized_segments ?? [],
    refunded,
  });
});

