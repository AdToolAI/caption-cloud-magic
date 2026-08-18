/**
 * v403 — report-lipsync-motion-probe
 * ------------------------------------------------------------------
 * Client (computeMouthYavg) posts here after a lipsync pass completes.
 *
 * This function is a PURE measurement helper. It persists mouth-band
 * motion metrics to `syncso_dispatch_log.meta_yavg_probe` and marks the
 * pass as probed (`yavg_probed_at`). It does NOT own retry decisions,
 * hard-fail states, or scene mutations.
 *
 * The authoritative motion/noop/indeterminate verdict lives in
 * `sync-so-webhook` (multi-speaker classifier, FA-4 Provider-No-op
 * Fix Contract C′) or the existing byte-based single-speaker gate.
 *
 * Auth: user JWT (scene must belong to the caller's project).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { withLang } from "../_shared/i18n.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YAVG_NOOP_THRESHOLD = 4.0;

interface MotionMetricPayload {
  mean: number;
  peak: number;
  frames?: number;
  method?: string;
}

interface Payload {
  scene_id: string;
  job_id?: string | null;
  pass_idx: number;
  yavg: number;
  yavg_normalized?: number;
  frames?: number;
  method?: string;
  // v403 — paired motion metrics for the multi-speaker classifier.
  preclip_metric?: MotionMetricPayload;
  provider_metric?: MotionMetricPayload;
}

function isMotionMetric(x: unknown): x is MotionMetricPayload {
  if (!x || typeof x !== "object") return false;
  const m = x as Record<string, unknown>;
  return typeof m.mean === "number" && typeof m.peak === "number";
}

function isPayload(x: unknown): x is Payload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return typeof p.scene_id === "string" &&
    typeof p.pass_idx === "number" &&
    typeof p.yavg === "number" &&
    (p.preclip_metric === undefined || isMotionMetric(p.preclip_metric)) &&
    (p.provider_metric === undefined || isMotionMetric(p.provider_metric));
}

Deno.serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401);

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
    const nowIso = new Date().toISOString();

    // v403 — Build paired motion metrics when available, otherwise fall back
    // to the legacy single-metric shape.
    const metaYavgProbe: Record<string, unknown> = {
      yavg: body.yavg,
      yavg_normalized: body.yavg_normalized ?? null,
      frames: body.frames ?? null,
      method: body.method ?? "canvas-mouth-band-v248",
      is_noop: isNoop,
      threshold: YAVG_NOOP_THRESHOLD,
      reported_at: nowIso,
    };
    if (isMotionMetric(body.preclip_metric) && isMotionMetric(body.provider_metric)) {
      metaYavgProbe.preclip_metric = body.preclip_metric;
      metaYavgProbe.provider_metric = body.provider_metric;
    }

    // Persist metric to dispatch log (best-effort, latest row for this job/pass).
    try {
      const query = admin
        .from("syncso_dispatch_log")
        .update({
          noop_mouth_yavg: body.yavg,
          meta_yavg_probe: metaYavgProbe,
        })
        .eq("scene_id", body.scene_id);
      if (body.job_id) await query.eq("job_id", body.job_id);
      else await query;
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] log update failed: ${(e as Error).message}`);
    }

    // Always mark the pass as probed so we don't re-probe on the client.
    const dialogShots = (scene as { dialog_shots?: { passes?: unknown[] } }).dialog_shots ?? {};
    const passes = Array.isArray((dialogShots as { passes?: unknown[] }).passes)
      ? (dialogShots as { passes: Record<string, unknown>[] }).passes
      : [];
    const pass = passes[body.pass_idx] as Record<string, unknown> | undefined;
    if (!pass) return json({ ok: true, is_noop: isNoop, threshold: YAVG_NOOP_THRESHOLD });

    // v431 G2.1/G2.2 — Run-Provenienz stammt ausschliesslich aus dem beim
    // Dispatch eingefrorenen Pass-Slot (immutable), nie aus der Live-Szene.
    // G2.2: bevor der Snapshot ueberhaupt genutzt wird, muss die gemeldete
    // job_id exakt zur Slot-job_id passen (fail-closed, No-op bei Mismatch).
    const passRunId = (pass as Record<string, unknown>).run_id ?? null;
    const passPlateGeneration = (pass as Record<string, unknown>).plate_generation ?? null;
    const slotJobId = typeof pass.job_id === "string" && pass.job_id.length > 0 ? pass.job_id : null;
    const reportedJobId = typeof body.job_id === "string" && body.job_id.length > 0 ? body.job_id : null;
    const jobSlotMatch = !!slotJobId && !!reportedJobId && slotJobId === reportedJobId;
    console.log(
      `[report-lipsync-motion-probe] v431_g2_2 scene=${body.scene_id} pass=${body.pass_idx} ` +
        `run=${passRunId ?? "none"} gen=${passPlateGeneration ?? "none"} ` +
        `slot_job=${slotJobId ?? "none"} reported_job=${reportedJobId ?? "none"} match=${jobSlotMatch}`,
    );

    if (!jobSlotMatch) {
      console.warn(
        `[report-lipsync-motion-probe] v431_g2_2 job_slot_mismatch scene=${body.scene_id} pass=${body.pass_idx} ` +
          `expected=${slotJobId ?? "none"} got=${reportedJobId ?? "none"} → no-op`,
      );
      return json({ ok: true, ignored: "job_slot_mismatch" });
    }

    try {
      await admin.rpc("update_dialog_pass_slot", {
        _scene_id: body.scene_id,
        _pass_idx: body.pass_idx,
        _patch: {
          yavg_probed_at: nowIso,
          yavg_value: body.yavg,
        },
      });
    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] pass probe patch failed: ${(e as Error).message}`);
    }

    // v403 — report-lipsync-motion-probe is a pure measurement helper.
    // The authoritative motion/noop/indeterminate verdict and any retry
    // decision live in sync-so-webhook (multi-speaker classifier) or the
    // existing byte-based single-speaker gate. We do NOT mutate scene state
    // or fire redispatches from here.
    console.log(
      `[report-lipsync-motion-probe] v403 scene=${body.scene_id} pass=${body.pass_idx} yavg=${body.yavg.toFixed(3)} metrics_persisted`,
    );
    return json({ ok: true, is_noop: isNoop, threshold: YAVG_NOOP_THRESHOLD, run_id: passRunId, plate_generation: passPlateGeneration });
  } catch (e) {
    console.error(`[report-lipsync-motion-probe] error: ${(e as Error).message}`);
    return json({ error: "internal", message: (e as Error).message }, 500);
  }
})(req)));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
