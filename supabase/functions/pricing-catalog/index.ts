// Public price catalog endpoint — no auth required. Frontend fetches this to
// display the exact per-second price that the generate-*-video functions will
// charge, so the pre-generation preview and the post-generation deduction
// never diverge again.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { VIDEO_PRICING_CATALOG, CATALOG_VERSION } from "../_shared/videoPricingCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const models = Object.values(VIDEO_PRICING_CATALOG).map((e) => ({
    id: e.id,
    label: e.label,
    unit: e.unit,
    sellEUR: e.sellEUR,
    sellUSD: e.sellUSD,
    minDuration: e.minDuration,
    maxDuration: e.maxDuration,
    fixedClipSeconds: e.fixedClipSeconds,
  }));

  return new Response(
    JSON.stringify({ version: CATALOG_VERSION, models }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Cache in browsers/CDN for 5 minutes — catalog is stable.
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
});
