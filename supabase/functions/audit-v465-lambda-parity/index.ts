/**
 * audit-v465-lambda-parity — TEMPORARY, READ-ONLY V465-B2a audit endpoint.
 *
 * Runs a frozen (in, out) pair through the EXACT production measurement path
 * (`measureProviderMotionSync` → Remotion Lambda stills → jpeg-js decode) and
 * returns the v404 verdict numbers together with the V465 paired
 * mouth-over-frame telemetry.
 *
 * It measures only. No DB writes, no ledger, no retries, no mux.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { measureProviderMotionSync } from "../_shared/measure-provider-motion-sync.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "unknown";
    const preclipUrl = typeof body.preclip_url === "string" ? body.preclip_url : "";
    const providerOutputUrl = typeof body.provider_url === "string" ? body.provider_url : "";
    const durationSeconds = Number(body.duration_seconds);
    if (!preclipUrl || !providerOutputUrl || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return json({ error: "preclip_url, provider_url and duration_seconds are required" }, 400);
    }

    const t0 = Date.now();
    const res = await measureProviderMotionSync({
      preclipUrl,
      providerOutputUrl,
      durationSeconds,
      deadlineMs: 120_000,
    });

    return json({
      id,
      elapsed_ms: Date.now() - t0,
      measurement_status: res.measurement_status,
      reason: res.reason,
      preclip_mean: res.preclip_metric?.mean ?? null,
      provider_mean: res.provider_metric?.mean ?? null,
      still_dims: res.provider_metric
        ? { w: res.provider_metric.stillWidth, h: res.provider_metric.stillHeight }
        : null,
      roi: res.provider_metric?.roi ?? null,
      old_delta: res.deltaMean,
      v434_mad_ratio: res.v434?.mad_ratio ?? null,
      v465: res.v465 ?? null,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
