/**
 * v248 — report-lipsync-motion-probe
 * ------------------------------------------------------------------
 * Client-side probe (computeMouthYavg) posts here after a lipsync
 * pass completes. We persist `noop_mouth_yavg` into
 * `syncso_dispatch_log` and, if the value is below threshold, flag
 * the pass with `motion_noop=true` so the composer's retry
 * orchestration can act on it.
 *
 * Auth: requires a valid Supabase user JWT (scene must belong to the
 * user's project). No service-role secrets are exposed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const YAVG_NOOP_THRESHOLD = 4.0;

interface Payload {
  scene_id: string;
  job_id?: string | null;
  pass_idx: number;
  yavg: number;
  yavg_normalized?: number;
  frames?: number;
  method?: string;
}

function isPayload(x: unknown): x is Payload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return typeof p.scene_id === "string" &&
    typeof p.pass_idx === "number" &&
    typeof p.yavg === "number";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_bearer" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => null);
    if (!isPayload(body)) return json({ error: "invalid_payload" }, 400);

    const admin = createClient(url, service);

    // Ownership check: scene → project → user
    const { data: scene } = await admin
      .from("composer_scenes")
      .select("id, project_id, dialog_shots")
      .eq("id", body.scene_id)
      .maybeSingle();
    if (!scene) return json({ error: "scene_not_found" }, 404);
    const { data: proj } = await admin
      .from("composer_projects")
      .select("user_id")
      .eq("id", (scene as { project_id: string }).project_id)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== userId) {
      return json({ error: "forbidden" }, 403);
    }

    const isNoop = body.yavg < YAVG_NOOP_THRESHOLD;

    // Persist metric to dispatch log (best-effort, latest row for this job/pass).
    try {
      const query = admin
        .from("syncso_dispatch_log")
        .update({
          noop_mouth_yavg: body.yavg,
          meta_yavg_probe: {
            yavg: body.yavg,
            yavg_normalized: body.yavg_normalized ?? null,
            frames: body.frames ?? null,
            method: body.method ?? "canvas-mouth-band-v248",
            is_noop: isNoop,
            threshold: YAVG_NOOP_THRESHOLD,
            reported_at: new Date().toISOString(),
          },
        })
        .eq("scene_id", body.scene_id);
      if (body.job_id) await query.eq("job_id", body.job_id);
      else await query;
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] log update failed: ${(e as Error).message}`);
    }

    // Patch the pass with motion_noop flag so the composer retry
    // orchestration (v248.3, TBD) can pick it up.
    if (isNoop) {
      const passes: unknown = (scene as { dialog_shots?: { passes?: unknown[] } }).dialog_shots?.passes;
      if (Array.isArray(passes) && passes[body.pass_idx]) {
        try {
          await admin.rpc("update_dialog_pass_slot", {
            _scene_id: body.scene_id,
            _pass_idx: body.pass_idx,
            _patch: {
              motion_noop: true,
              motion_noop_yavg: body.yavg,
              motion_noop_reported_at: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.warn(`[report-lipsync-motion-probe] pass patch failed: ${(e as Error).message}`);
        }
      }
      console.warn(
        `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} → MOTION_NOOP`,
      );
    } else {
      console.log(
        `[report-lipsync-motion-probe] v248 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} OK`,
      );
    }

    return json({ ok: true, is_noop: isNoop, threshold: YAVG_NOOP_THRESHOLD });
  } catch (e) {
    console.error(`[report-lipsync-motion-probe] error: ${(e as Error).message}`);
    return json({ error: "internal", message: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
