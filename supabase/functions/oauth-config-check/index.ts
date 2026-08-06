import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProviderCheck = {
  provider: string;
  credentials: boolean;
  missing: string[];
  redirect_uri: string | null;
  redirect_ok: boolean;
  note?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) throw new Error("Unauthorized");

    const backendCallback = `${supabaseUrl}/functions/v1/oauth-callback`;

    const env = (name: string) => Deno.env.get(name) ?? null;
    const missingOf = (names: string[]) => names.filter((n) => !Deno.env.get(n));

    const metaRedirect = env("META_REDIRECT_URI");
    const tiktokRedirect = env("TIKTOK_REDIRECT_URI");

    // A redirect target is only usable when it points back at the
    // oauth-callback edge function — app URLs are SPA routes and swallow the code.
    const pointsAtBackend = (uri: string | null) =>
      !!uri && uri.startsWith(backendCallback);

    const checks: ProviderCheck[] = [
      {
        provider: "instagram",
        credentials: missingOf(["META_APP_ID", "META_APP_SECRET"]).length === 0,
        missing: missingOf(["META_APP_ID", "META_APP_SECRET"]),
        redirect_uri: metaRedirect,
        redirect_ok: pointsAtBackend(metaRedirect),
        note: "Posten benoetigt freigegebene Meta-Berechtigungen (App Review).",
      },
      {
        provider: "facebook",
        credentials: missingOf(["META_APP_ID", "META_APP_SECRET"]).length === 0,
        missing: missingOf(["META_APP_ID", "META_APP_SECRET"]),
        redirect_uri: metaRedirect,
        redirect_ok: pointsAtBackend(metaRedirect),
        note: "Posten benoetigt freigegebene Meta-Berechtigungen (App Review).",
      },
      {
        provider: "tiktok",
        credentials: missingOf(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]).length === 0,
        missing: missingOf(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]),
        redirect_uri: tiktokRedirect,
        redirect_ok: pointsAtBackend(tiktokRedirect),
        note: `Modus: ${(env("TIKTOK_ENV") || "production").toLowerCase()}; Client-Key-Typ: ${
          (env("TIKTOK_CLIENT_KEY") || "").startsWith("sb") ? "sandbox" : "production"
        }`,
      },
      {
        provider: "youtube",
        credentials: missingOf(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]).length === 0,
        missing: missingOf(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
        redirect_uri: `${backendCallback}?provider=youtube`,
        redirect_ok: true,
        note: "Redirect wird serverseitig gebaut; muss in der Google Cloud Console eingetragen sein.",
      },
    ];

    return new Response(
      JSON.stringify({ backend_callback: backendCallback, checks }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "unknown" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
