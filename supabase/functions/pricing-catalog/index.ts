// Public price catalog endpoint. Frontend fetches this to display the exact
// per-second price that the generate-*-video functions will charge, so the
// pre-generation preview and the post-generation deduction never diverge.
//
// Creator accounts get a platform-wide AI discount (profiles.ai_discount_percent).
// When the caller presents a valid JWT we apply that discount here so the
// displayed price matches what the DB deduction functions actually charge.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { VIDEO_PRICING_CATALOG, CATALOG_VERSION } from "../_shared/videoPricingCatalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveAccount(
  req: Request,
): Promise<{ discountPercent: number; walletCurrency: "EUR" | "USD" }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { discountPercent: 0, walletCurrency: "EUR" };

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return { discountPercent: 0, walletCurrency: "EUR" };

  try {
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error } = await admin.auth.getUser(token);
    if (error || !userData?.user) return { discountPercent: 0, walletCurrency: "EUR" };

    const { data: profile } = await admin
      .from("profiles")
      .select("ai_discount_percent")
      .eq("id", userData.user.id)
      .maybeSingle();

    const { data: wallet } = await admin
      .from("ai_video_wallets")
      .select("currency")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const pct = Number(profile?.ai_discount_percent ?? 0);
    const discountPercent = Number.isFinite(pct)
      ? Math.min(Math.max(Math.round(pct), 0), 100)
      : 0;
    return {
      discountPercent,
      walletCurrency: wallet?.currency === "USD" ? "USD" : "EUR",
    };
  } catch (_e) {
    // Anon / expired token — fall back to list prices.
    return { discountPercent: 0, walletCurrency: "EUR" };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const { discountPercent, walletCurrency } = await resolveAccount(req);
  const factor = (100 - discountPercent) / 100;

  const models = Object.values(VIDEO_PRICING_CATALOG).map((e) => ({
    id: e.id,
    label: e.label,
    unit: e.unit,
    sellEUR: round2(e.sellEUR * factor),
    sellUSD: round2(e.sellUSD * factor),
    listEUR: e.sellEUR,
    listUSD: e.sellUSD,
    minDuration: e.minDuration,
    maxDuration: e.maxDuration,
    fixedClipSeconds: e.fixedClipSeconds,
  }));

  return new Response(
    JSON.stringify({ version: CATALOG_VERSION, discountPercent, walletCurrency, models }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Personalized responses must never be shared by a CDN.
        "Cache-Control": discountPercent > 0
          ? "private, no-store"
          : "public, max-age=300, s-maxage=300",
      },
    },
  );
});
