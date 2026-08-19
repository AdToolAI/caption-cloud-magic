/**
 * v404 — report-lipsync-motion-probe (TELEMETRY ONLY)
 * ------------------------------------------------------------------
 * Client (computeMouthYavg) posts here after a lipsync pass completes.
 *
 * v404: this function has NO role in the motion/noop decision anymore.
 * The authoritative metric is measured SERVER-SIDE and SYNCHRONOUSLY in
 * `sync-so-webhook` via `measureProviderMotionSync()` (Remotion stills →
 * Rec.601 luma variance → PURE `classifyMotionProbe`). Nothing in the
 * completion path reads what this endpoint writes.
 *
 * Client-reported metrics are therefore persisted under a dedicated
 * `client_telemetry` namespace in `syncso_dispatch_log.meta_yavg_probe`
 * so they can never be mistaken for the authoritative measurement.
 *
 * v404 P1-B: this function owns NO scene/pass state at all — there is no
 * `update_dialog_pass_slot` call and no `yavg_probed_at` write. Browser
 * de-dupe is session-local (`probedThisSession` in useMouthYavgProbe).
 * Every telemetry write requires the complete key scene_id + job_id +
 * pass_idx AND an exact job-slot match; otherwise ZERO writes happen.
 *

 * Auth: user JWT (scene must belong to the caller's project).
 */


import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { withLang } from "../_shared/i18n.ts";
import { resolveTelemetryTarget } from "../_shared/telemetry-target.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_LIPSYNC_MOTION_PROBE_VERSION = "v404-telemetry-only";

// v404 observability — module-load boot marker. Proves which build is actually
// running inside Edge Runtime (vs a stale cached copy). Look for this exact
// string in logs immediately after any deploy to confirm the new code is live.
console.log(
  `[report-lipsync-motion-probe] BOOT version=${REPORT_LIPSYNC_MOTION_PROBE_VERSION} deploy_marker=${Date.now()} pid=${(globalThis as any).Deno?.pid ?? "?"}`,
);

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

    // ── v404 P1-B — TELEMETRY ONLY, FAIL-CLOSED KEY ────────────────────────
    // This function owns NO scene/pass state. Before ANY write we require the
    // complete key (scene_id + job_id + pass_idx) AND an exact job-slot match
    // against the immutable dispatch snapshot. Anything short of that is a
    // strict no-op with ZERO database writes.
    const reportedJobId = typeof body.job_id === "string" && body.job_id.length > 0
      ? body.job_id
      : null;
    if (!reportedJobId) {
      console.warn(
        `[report-lipsync-motion-probe] v404_telemetry_key_missing scene=${body.scene_id} pass=${body.pass_idx} job_id=none → no-op`,
      );
      return json({ ok: true, ignored: "job_id_missing" });
    }

    const dialogShots = (scene as { dialog_shots?: { passes?: unknown[] } }).dialog_shots ?? {};
    const passes = Array.isArray((dialogShots as { passes?: unknown[] }).passes)
      ? (dialogShots as { passes: Record<string, unknown>[] }).passes
      : [];
    const pass = passes[body.pass_idx] as Record<string, unknown> | undefined;
    if (!pass) {
      console.warn(
        `[report-lipsync-motion-probe] v404_telemetry_pass_missing scene=${body.scene_id} pass=${body.pass_idx} → no-op`,
      );
      return json({ ok: true, ignored: "pass_not_found" });
    }

    // v431 G2.1/G2.2 — run provenance comes exclusively from the pass slot
    // frozen at dispatch time (immutable), never from the live scene.
    const passRunId = (pass as Record<string, unknown>).run_id ?? null;
    const passPlateGeneration = (pass as Record<string, unknown>).plate_generation ?? null;
    const slotJobId = typeof pass.job_id === "string" && pass.job_id.length > 0 ? pass.job_id : null;
    const jobSlotMatch = !!slotJobId && slotJobId === reportedJobId;
    console.log(
      `[report-lipsync-motion-probe] v431_g2_2 scene=${body.scene_id} pass=${body.pass_idx} ` +
        `run=${passRunId ?? "none"} gen=${passPlateGeneration ?? "none"} ` +
        `slot_job=${slotJobId ?? "none"} reported_job=${reportedJobId} match=${jobSlotMatch}`,
    );
    if (!jobSlotMatch) {
      console.warn(
        `[report-lipsync-motion-probe] v431_g2_2 job_slot_mismatch scene=${body.scene_id} pass=${body.pass_idx} ` +
          `expected=${slotJobId ?? "none"} got=${reportedJobId} → no-op`,
      );
      return json({ ok: true, ignored: "job_slot_mismatch" });
    }

    // v404 — client metrics are TELEMETRY. They live in their own namespace
    // and are never read by the completion path (`sync-so-webhook` measures
    // server-side), so no consumer can bind to them as authority.
    const metaYavgProbe: Record<string, unknown> = {
      client_telemetry: {
        yavg: body.yavg,
        yavg_normalized: body.yavg_normalized ?? null,
        frames: body.frames ?? null,
        method: body.method ?? "canvas-mouth-band-v248",
        is_noop_hint: isNoop,
        threshold: YAVG_NOOP_THRESHOLD,
        preclip_metric: isMotionMetric(body.preclip_metric) ? body.preclip_metric : null,
        provider_metric: isMotionMetric(body.provider_metric) ? body.provider_metric : null,
      },
      authority: "server:measure-provider-motion-sync",
      reported_at: nowIso,
    };

    // Exact-row resolution. `job_id` is dispatch-unique; if it still resolves
    // to more than one row we narrow by the persisted pass identity
    // (`turn_idx`) and otherwise fail closed — never a bulk update.
    let telemetryRows = 0;
    try {
      const { data: candidates } = await admin
        .from("syncso_dispatch_log")
        .select("id, turn_idx")
        .eq("scene_id", body.scene_id)
        .eq("job_id", reportedJobId);
      const target = resolveTelemetryTarget(
        (candidates ?? []) as Array<{ id: string; turn_idx: number | null }>,
        body.pass_idx,
      );
      if (!target.ok) {
        console.warn(
          `[report-lipsync-motion-probe] v404_telemetry_key_unresolved scene=${body.scene_id} ` +
            `job=${reportedJobId} pass=${body.pass_idx} reason=${target.reason} → no write`,
        );
        return json({ ok: true, ignored: `telemetry_key_${target.reason}` });
      }
      const { error: updErr } = await admin
        .from("syncso_dispatch_log")
        .update({ noop_mouth_yavg: body.yavg, meta_yavg_probe: metaYavgProbe })
        .eq("id", target.id);
      if (updErr) throw new Error(updErr.message);
      telemetryRows = 1;

    } catch (e) {
      console.warn(`[report-lipsync-motion-probe] log update failed: ${(e as Error).message}`);
    }

    // v404 — telemetry only: no verdict, no retry, no scene/pass mutation.
    // The authoritative motion/noop/indeterminate verdict lives in
    // sync-so-webhook (server-side measurement + PURE classifier).
    console.log(
      `[report-lipsync-motion-probe] v404_telemetry scene=${body.scene_id} pass=${body.pass_idx} ` +
        `yavg=${body.yavg.toFixed(3)} rows=${telemetryRows} slot_writes=0`,
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
