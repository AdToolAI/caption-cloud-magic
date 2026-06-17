/**
 * syncso-replay-webhook — v129.5
 *
 * Receives Sync.so webhook callbacks for replay jobs ONLY. Writes
 * exclusively to syncso_replay_log. Never touches composer_scenes,
 * dialog_shots, or any production table.
 *
 * Auth: shared-secret `?token=...` (REPLAY_WEBHOOK_SECRET).
 *
 * Failure mode: always returns 200 so Sync.so does not retry-storm us.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Shared-secret check (?token=...)
  try {
    const url = new URL(req.url);
    const expected = Deno.env.get("REPLAY_WEBHOOK_SECRET") ?? "";
    const got = url.searchParams.get("token") ?? "";
    if (expected && got !== expected) {
      console.warn("[syncso-replay-webhook] token mismatch");
      return ok({ ok: true, ignored: "bad_token" });
    }
  } catch {
    return ok({ ok: true, ignored: "bad_url" });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return ok({ ok: true, ignored: "non_json" });
  }

  const jobId: string | null =
    body?.id ?? body?.job_id ?? body?.generation_id ?? null;
  if (!jobId) return ok({ ok: true, ignored: "no_job_id", body });

  const status: string | null = body?.status ?? null;
  const errorMsg: string | null = body?.error ?? null;
  const errorCode: string | null =
    body?.error_code ?? body?.errorCode ?? null;
  const outputUrl: string | null = body?.outputUrl ?? body?.output_url ?? null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: row } = await admin
    .from("syncso_replay_log")
    .select("id, response_json")
    .eq("replay_provider_job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    console.warn(`[syncso-replay-webhook] no replay_log row for job ${jobId}`);
    return ok({ ok: true, ignored: "no_replay_row", job_id: jobId });
  }

  await admin
    .from("syncso_replay_log")
    .update({
      provider_status: status ?? "webhook_received",
      provider_error: errorMsg,
      provider_error_code: errorCode,
      output_url: outputUrl,
      response_json: { ...(row.response_json ?? {}), webhook: body },
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return ok({ ok: true, replay_log_id: row.id, status });
});
