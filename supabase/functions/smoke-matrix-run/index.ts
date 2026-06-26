// Bond QA — Function Smoke Matrix Runner
//
// Iterates SMOKE_REGISTRY in parallel batches (default 12), calls each
// function with `x-qa-mock: true`, records pass/fail/skip/timeout per
// function in `qa_smoke_runs` linked to a `qa_smoke_sweeps` header row.
//
// Auth: requires the caller to be an admin (validated via has_role).
// No real money is ever spent because every entry routes through qaMock.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { SMOKE_REGISTRY, type SmokeEntry } from "../_shared/smokeRegistry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const DEFAULT_BATCH_SIZE = 12;
const DEFAULT_TIMEOUT_MS = 8000;

interface RunResult {
  function_name: string;
  category: string;
  status: "pass" | "fail" | "skip" | "timeout";
  status_code?: number;
  duration_ms: number;
  error?: string;
  response_hash?: string;
}

async function callOne(entry: SmokeEntry): Promise<RunResult> {
  if (entry.skip) {
    return {
      function_name: entry.name,
      category: entry.category,
      status: "skip",
      duration_ms: 0,
      error: entry.skip,
    };
  }

  const url = `${SUPABASE_URL}/functions/v1/${entry.name}`;
  const controller = new AbortController();
  const timeoutMs = entry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        "x-qa-mock": "true",
        "x-smoke": "true",
        ...(entry.headers ?? {}),
      },
      body: JSON.stringify(entry.body ?? {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const duration = Date.now() - t0;
    const text = await resp.text();
    const responseHash = await sha1Short(text);

    if (!resp.ok) {
      return {
        function_name: entry.name,
        category: entry.category,
        status: "fail",
        status_code: resp.status,
        duration_ms: duration,
        error: text.slice(0, 500),
        response_hash: responseHash,
      };
    }

    // Optional shape check
    if (entry.expect === "ok-flag") {
      try {
        const json = JSON.parse(text);
        if (json && (json.success === true || json.ok === true || json.status === "succeeded" || json.mock === true)) {
          return {
            function_name: entry.name,
            category: entry.category,
            status: "pass",
            status_code: resp.status,
            duration_ms: duration,
            response_hash: responseHash,
          };
        }
        return {
          function_name: entry.name,
          category: entry.category,
          status: "fail",
          status_code: resp.status,
          duration_ms: duration,
          error: `schema mismatch: missing success/ok/mock flag`,
          response_hash: responseHash,
        };
      } catch {
        return {
          function_name: entry.name,
          category: entry.category,
          status: "fail",
          status_code: resp.status,
          duration_ms: duration,
          error: "non-json response",
          response_hash: responseHash,
        };
      }
    }

    return {
      function_name: entry.name,
      category: entry.category,
      status: "pass",
      status_code: resp.status,
      duration_ms: duration,
      response_hash: responseHash,
    };
  } catch (err) {
    clearTimeout(timer);
    const duration = Date.now() - t0;
    const aborted = (err as Error)?.name === "AbortError";
    return {
      function_name: entry.name,
      category: entry.category,
      status: aborted ? "timeout" : "fail",
      duration_ms: duration,
      error: aborted ? `timeout after ${timeoutMs}ms` : String((err as Error)?.message ?? err).slice(0, 500),
    };
  }
}

async function sha1Short(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function runInBatches(entries: SmokeEntry[], batchSize: number): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    const settled = await Promise.all(slice.map(callOne));
    results.push(...settled);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller is admin
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const categoryFilter: string | undefined = body.category;
    const onlyFunctions: string[] | undefined = body.functions;
    const batchSize: number = Math.min(Math.max(body.batchSize ?? DEFAULT_BATCH_SIZE, 1), 24);

    let entries = SMOKE_REGISTRY;
    if (categoryFilter) entries = entries.filter((e) => e.category === categoryFilter);
    if (Array.isArray(onlyFunctions) && onlyFunctions.length) {
      entries = entries.filter((e) => onlyFunctions.includes(e.name));
    }

    const { data: sweep, error: sweepErr } = await admin
      .from("qa_smoke_sweeps")
      .insert({
        triggered_by: user.id,
        source: body.source ?? "manual",
        category_filter: categoryFilter ?? null,
        total: entries.length,
      })
      .select()
      .single();

    if (sweepErr || !sweep) {
      return new Response(JSON.stringify({ error: sweepErr?.message ?? "sweep insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const sweepStart = Date.now();
    const results = await runInBatches(entries, batchSize);
    const duration = Date.now() - sweepStart;

    const counts = {
      pass: results.filter((r) => r.status === "pass").length,
      fail: results.filter((r) => r.status === "fail").length,
      skip: results.filter((r) => r.status === "skip").length,
      timeout: results.filter((r) => r.status === "timeout").length,
    };

    await admin.from("qa_smoke_runs").insert(
      results.map((r) => ({ sweep_id: sweep.id, ...r })),
    );

    await admin
      .from("qa_smoke_sweeps")
      .update({
        finished_at: new Date().toISOString(),
        pass_count: counts.pass,
        fail_count: counts.fail,
        skip_count: counts.skip,
        timeout_count: counts.timeout,
        duration_ms: duration,
      })
      .eq("id", sweep.id);

    return new Response(
      JSON.stringify({
        ok: true,
        sweep_id: sweep.id,
        total: entries.length,
        ...counts,
        duration_ms: duration,
      }),
      { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
