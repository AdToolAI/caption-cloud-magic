/**
 * Layer 3 — Synthetic Probes
 *
 * External, read-only health checks that simulate real user traffic.
 * Runs every 5 min via pg_cron. Catches outages that Layers 1 & 2 miss:
 * frontend down (CDN/DNS), DB latency regression, auth-service down,
 * cold-start regression.
 */
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { withSentryCron } from "../_shared/sentryCron.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface ProbeResult {
  probe_name: string;
  status: "pass" | "fail" | "degraded";
  latency_ms: number;
  threshold_ms: number;
  error_message: string | null;
  metadata?: Record<string, unknown>;
}

async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; latency_ms: number; bodySnippet: string; error?: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const latency_ms = Date.now() - start;
    let bodySnippet = "";
    try {
      bodySnippet = (await res.text()).slice(0, 200);
    } catch { /* noop */ }
    return { ok: res.ok, status: res.status, latency_ms, bodySnippet };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - start,
      bodySnippet: "",
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}

function evaluate(
  name: string,
  ok: boolean,
  latency_ms: number,
  threshold_ms: number,
  error: string | null,
  metadata?: Record<string, unknown>,
): ProbeResult {
  let status: ProbeResult["status"] = "pass";
  if (!ok) status = "fail";
  else if (latency_ms > threshold_ms) status = "degraded";
  return {
    probe_name: name,
    status,
    latency_ms,
    threshold_ms,
    error_message: error,
    metadata,
  };
}

// ─── Probes ──────────────────────────────────────────────────────────────────

async function probeLandingPage(): Promise<ProbeResult> {
  const r = await timedFetch("https://useadtool.ai/", { method: "GET" }, 8_000);
  const hasContent = r.bodySnippet.toLowerCase().includes("<!doctype html") ||
    r.bodySnippet.toLowerCase().includes("<html");
  return evaluate(
    "landing_page",
    r.ok && hasContent,
    r.latency_ms,
    3_000,
    r.error ?? (!r.ok ? `HTTP ${r.status}` : !hasContent ? "no html content" : null),
  );
}

async function probeAuthEndpoint(): Promise<ProbeResult> {
  const r = await timedFetch(
    `${SUPABASE_URL}/auth/v1/health`,
    { headers: { apikey: SUPABASE_ANON_KEY } },
    5_000,
  );
  return evaluate(
    "auth_endpoint",
    r.ok,
    r.latency_ms,
    1_500,
    r.error ?? (!r.ok ? `HTTP ${r.status}` : null),
  );
}

async function probeDbRead(): Promise<ProbeResult> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const start = Date.now();
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    const latency_ms = Date.now() - start;
    return evaluate(
      "db_read_latency",
      !error,
      latency_ms,
      500,
      error?.message ?? null,
    );
  } catch (err) {
    return evaluate(
      "db_read_latency",
      false,
      Date.now() - start,
      500,
      (err as Error).message,
    );
  }
}

async function probeStorage(): Promise<ProbeResult> {
  const r = await timedFetch(
    `${SUPABASE_URL}/storage/v1/bucket`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
    5_000,
  );
  return evaluate(
    "storage_endpoint",
    r.ok,
    r.latency_ms,
    1_500,
    r.error ?? (!r.ok ? `HTTP ${r.status}` : null),
  );
}

async function probeEdgeColdStart(fn: string, threshold = 2_000): Promise<ProbeResult> {
  // OPTIONS preflight — measures cold-start + CORS, never spends credits
  const r = await timedFetch(
    `${SUPABASE_URL}/functions/v1/${fn}`,
    {
      method: "OPTIONS",
      headers: {
        Origin: "https://probe.local",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    },
    8_000,
  );
  const ok = r.ok || r.status === 204;
  return evaluate(
    `edge_${fn}`,
    ok,
    r.latency_ms,
    threshold,
    r.error ?? (!ok ? `HTTP ${r.status}` : null),
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Run all probes in parallel
  const probes = await Promise.all([
    probeLandingPage(),
    probeAuthEndpoint(),
    probeDbRead(),
    probeStorage(),
    probeEdgeColdStart("check-subscription", 2_500),
    probeEdgeColdStart("generate-caption", 2_500),
  ]);

  // Persist
  const { error: insertErr } = await supabase
    .from("synthetic_probe_runs")
    .insert(probes);

  if (insertErr) {
    console.error("[synthetic-probe] insert failed:", insertErr);
  }

  // Opportunistic cleanup (1% of runs ≈ once every ~8h at 5-min cadence)
  if (Math.random() < 0.01) {
    supabase.rpc("cleanup_synthetic_probe_runs").then(({ error }) => {
      if (error) console.warn("[synthetic-probe] cleanup failed:", error.message);
    });
  }

  const failed = probes.filter((p) => p.status === "fail");
  const degraded = probes.filter((p) => p.status === "degraded");
  const totalDurationMs = Date.now() - startedAt;

  const summary = {
    success: true,
    total: probes.length,
    passed: probes.length - failed.length - degraded.length,
    degraded: degraded.length,
    failed: failed.length,
    duration_ms: totalDurationMs,
    probes,
  };

  // Trigger Sentry error envelope (separate from cron check-in) on hard failures
  // so the team gets an immediate alert on top of the cron-monitor signal.
  if (failed.length > 0) {
    console.error(
      `[synthetic-probe] ${failed.length} FAILED:`,
      failed.map((f) => `${f.probe_name}=${f.error_message}`).join(" | "),
    );
  }

  // If anything failed, return 500 so Sentry Cron records "error"
  const status = failed.length > 0 ? 500 : 200;

  return new Response(JSON.stringify(summary), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

Deno.serve(
  withSentryCron(
    "synthetic-probe",
    { schedule: "*/5 * * * *", maxRuntime: 5, checkinMargin: 2 },
    handler,
  ),
);
