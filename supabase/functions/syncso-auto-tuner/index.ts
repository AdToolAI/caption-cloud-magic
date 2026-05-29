/**
 * syncso-auto-tuner (Stage F.7 — Lightweight Heuristic Auto-Tuner)
 *
 * Cron-driven (every 6h). Reads last 1000 syncso_dispatch_log rows and
 * groups by `sync_source_kind`. For each kind it computes a success rate
 * (rows without error_class AND http_status<400). The kind with the
 * highest success rate AND at least 30 samples becomes the new
 * `system_config.syncso.preferred_source_kind`.
 *
 * Defensive guarantees:
 *  - Never lowers a manual override flagged with `system_config.syncso.lock=true`
 *  - Falls back to current value if no kind has ≥30 samples
 *  - Records every run in `system_config.syncso.auto_tuner_last_run`
 */

import { createClient } from "npm:@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_SAMPLES = 30;
const LOOKBACK = 1000;

interface BucketStats {
  kind: string;
  total: number;
  success: number;
  rate: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Read recent dispatch log
    const { data: rows, error } = await supabase
      .from("syncso_dispatch_log")
      .select("sync_source_kind, error_class, http_status, sync_status")
      .order("created_at", { ascending: false })
      .limit(LOOKBACK);

    if (error) throw new Error(`dispatch_log_read: ${error.message}`);

    // 2. Group by source kind
    const buckets = new Map<string, { total: number; success: number }>();
    for (const r of rows ?? []) {
      const kind = (r.sync_source_kind ?? "").trim();
      if (!kind) continue;
      const b = buckets.get(kind) ?? { total: 0, success: 0 };
      b.total += 1;
      const isSuccess =
        !r.error_class &&
        (r.http_status == null || r.http_status < 400) &&
        r.sync_status !== "FAILED" &&
        r.sync_status !== "REJECTED";
      if (isSuccess) b.success += 1;
      buckets.set(kind, b);
    }

    const stats: BucketStats[] = [...buckets.entries()]
      .map(([kind, b]) => ({
        kind,
        total: b.total,
        success: b.success,
        rate: b.total > 0 ? b.success / b.total : 0,
      }))
      .sort((a, b) => b.rate - a.rate);

    // 3. Read current config + lock state
    const { data: currentRow } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "syncso.preferred_source_kind")
      .maybeSingle();
    const { data: lockRow } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "syncso.lock")
      .maybeSingle();

    const locked = lockRow?.value === true || lockRow?.value === "true";
    const currentKind =
      typeof currentRow?.value === "string"
        ? currentRow.value
        : (currentRow?.value as any)?.kind ?? null;

    // 4. Pick winner with min-sample guard
    const eligible = stats.filter((s) => s.total >= MIN_SAMPLES);
    const winner = eligible[0] ?? null;
    const decision = winner?.kind ?? currentKind ?? null;

    let updated = false;
    if (!locked && winner && winner.kind !== currentKind) {
      const { error: upErr } = await supabase
        .from("system_config")
        .upsert(
          {
            key: "syncso.preferred_source_kind",
            value: winner.kind,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      if (upErr) console.warn(`[auto-tuner] write failed: ${upErr.message}`);
      else updated = true;
    }

    // 5. Telemetry stamp
    await supabase.from("system_config").upsert(
      {
        key: "syncso.auto_tuner_last_run",
        value: {
          at: new Date().toISOString(),
          sample_count: rows?.length ?? 0,
          stats,
          decision,
          updated,
          locked,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    return new Response(
      JSON.stringify({ ok: true, decision, updated, locked, stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[syncso-auto-tuner] crash", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
