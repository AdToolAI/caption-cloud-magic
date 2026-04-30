import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-e2e-token, x-qa-mock",
};

interface E2EResult {
  test_name: string;
  status: "pass" | "fail" | "skip" | "timeout";
  latency_ms?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

interface IngestPayload {
  run_id?: string;
  base_url?: string;
  commit_sha?: string;
  branch?: string;
  results: E2EResult[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Shared-secret token check (CI sets this header)
  const expected = Deno.env.get("E2E_INGEST_TOKEN");
  const provided = req.headers.get("x-e2e-token");
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: IngestPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(payload.results) || payload.results.length === 0) {
    return new Response(JSON.stringify({ error: "Missing results" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const runMeta = {
    run_id: payload.run_id ?? crypto.randomUUID(),
    base_url: payload.base_url,
    commit_sha: payload.commit_sha,
    branch: payload.branch,
  };

  const rows = payload.results.map((r) => ({
    test_name: String(r.test_name).slice(0, 500),
    test_type: "e2e_playwright",
    status: r.status,
    latency_ms: typeof r.latency_ms === "number" ? Math.round(r.latency_ms) : null,
    error_message: r.error_message?.slice(0, 4000) ?? null,
    metadata: { ...runMeta, ...(r.metadata ?? {}) },
  }));

  const { error, count } = await supabase
    .from("smoke_test_runs")
    .insert(rows, { count: "exact" });

  if (error) {
    console.error("Insert failed:", error);
    return new Response(
      JSON.stringify({ error: "Insert failed", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, inserted: count ?? rows.length, run_id: runMeta.run_id }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
