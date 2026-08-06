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
  expected_redirect: string;
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
    const tiktokRedirect = env("TIKTOK_REDIRECT_URI_PROD") ?? env("TIKTOK_REDIRECT_URI");

    // A redirect target is only usable when it points back at the
    // oauth-callback edge function — app URLs are SPA routes and swallow the code.
    const pointsAtBackend = (uri: string | null) =>
      !!uri && uri.startsWith(backendCallback);

    // TikTok nutzt eine eigene Callback-Function, nicht den generischen oauth-callback.
    // TikTok verlangt eine verifizierte Domain: der Callback laeuft ueber die App-Route
    // /api/oauth/tiktok/callback, die code+state an die Edge Function weiterleitet.
    const tiktokCallback = "https://useadtool.ai/api/oauth/tiktok/callback";
    const pointsAt = (uri: string | null, expected: string) =>
      !!uri && uri.startsWith(expected);

    const checks: ProviderCheck[] = [
      {
        provider: "instagram",
        credentials: missingOf(["META_APP_ID", "META_APP_SECRET"]).length === 0,
        missing: missingOf(["META_APP_ID", "META_APP_SECRET"]),
        redirect_uri: metaRedirect,
        expected_redirect: backendCallback,
        redirect_ok: pointsAtBackend(metaRedirect),
        note: "Posten benoetigt freigegebene Meta-Berechtigungen (App Review).",
      },
      {
        provider: "facebook",
        credentials: missingOf(["META_APP_ID", "META_APP_SECRET"]).length === 0,
        missing: missingOf(["META_APP_ID", "META_APP_SECRET"]),
        redirect_uri: metaRedirect,
        expected_redirect: backendCallback,
        redirect_ok: pointsAtBackend(metaRedirect),
        note: "Posten benoetigt freigegebene Meta-Berechtigungen (App Review).",
      },
      {
        provider: "tiktok",
        credentials: (!!(env("TIKTOK_CLIENT_KEY_PROD") ?? env("TIKTOK_CLIENT_KEY")) && !!(env("TIKTOK_CLIENT_SECRET_PROD") ?? env("TIKTOK_CLIENT_SECRET"))),
        missing: missingOf(["TIKTOK_CLIENT_SECRET"]),
        redirect_uri: tiktokRedirect,
        expected_redirect: tiktokCallback,
        redirect_ok: pointsAt(tiktokRedirect, tiktokCallback),
        note: `Modus: ${(env("TIKTOK_ENV") || "production").toLowerCase()}; Client-Key-Typ: ${
          ((env("TIKTOK_CLIENT_KEY_PROD") ?? env("TIKTOK_CLIENT_KEY")) || "").startsWith("sb") ? "sandbox" : "production"
        }`,
      },
      {
        provider: "youtube",
        credentials: missingOf(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]).length === 0,
        missing: missingOf(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
        redirect_uri: `${backendCallback}?provider=youtube`,
        expected_redirect: `${backendCallback}?provider=youtube`,
        redirect_ok: true,
        note: "Redirect wird serverseitig gebaut; muss in der Google Cloud Console eingetragen sein.",
      },
    ];

    // ---- Meta App-Status (Graph API, App-Token) --------------------------
    // Meta blockt den Login-Dialog mit "wir aktualisieren zusätzliche Details
    // für diese App", wenn Pflicht-Grunddaten fehlen. Das lässt sich nur
    // serverseitig auslesen — hier ohne Nutzer-Token via App-Token.
    type MetaAppStatus = {
      available: boolean;
      app_id?: string | null;
      name?: string | null;
      app_type?: string | null;
      category?: string | null;
      privacy_policy_url?: string | null;
      terms_of_service_url?: string | null;
      link?: string | null;
      missing_fields: string[];
      unreadable_fields: string[];
      permissions: { permission: string; status: string }[];
      permissions_error?: string;
      error?: string;
    };

    let metaAppStatus: MetaAppStatus = {
      available: false,
      missing_fields: [],
      unreadable_fields: [],
      permissions: [],
    };
    const metaAppId = env("META_APP_ID");
    const metaAppSecret = env("META_APP_SECRET");

    if (metaAppId && metaAppSecret) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const fields = [
          "name",
          "link",
          "privacy_policy_url",
          "terms_of_service_url",
          "app_type",
          "category",
        ].join(",");
        const res = await fetch(
          `https://graph.facebook.com/v24.0/${metaAppId}?fields=${fields}` +
            `&access_token=${encodeURIComponent(`${metaAppId}|${metaAppSecret}`)}`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const g = body?.error ?? {};
          const parts = [
            `HTTP ${res.status}`,
            g.code ? `code ${g.code}` : null,
            g.message ?? null,
          ].filter(Boolean);
          metaAppStatus = {
            available: false,
            app_id: metaAppId,
            missing_fields: [],
            unreadable_fields: [],
            permissions: [],
            error: parts.join(" · "),
          };
        } else {

          // Nur echte Blocker als "fehlend" werten. category/app_type sind ueber
          // App-Token oft nicht lesbar und wurden faelschlich als fehlend gemeldet.
          const required: Record<string, unknown> = {
            privacy_policy_url: body.privacy_policy_url,
            terms_of_service_url: body.terms_of_service_url,
          };
          const optional: Record<string, unknown> = {
            category: body.category,
            app_type: body.app_type,
          };

          // Berechtigungs-Level lesen: Facebook Login braucht fuer Live-Apps
          // Advanced Access auf public_profile.
          let permissions: { permission: string; status: string }[] = [];
          let permissionsError: string | undefined;
          try {
            const pc = new AbortController();
            const pt = setTimeout(() => pc.abort(), 8000);
            const pres = await fetch(
              `https://graph.facebook.com/v24.0/${metaAppId}/permissions` +
                `?access_token=${encodeURIComponent(`${metaAppId}|${metaAppSecret}`)}`,
              { signal: pc.signal },
            );
            clearTimeout(pt);
            const pbody = await pres.json().catch(() => ({}));
            if (!pres.ok) {
              const g = pbody?.error ?? {};
              permissionsError = [`HTTP ${pres.status}`, g.code ? `code ${g.code}` : null, g.message ?? null]
                .filter(Boolean).join(" · ");
            } else {
              permissions = (pbody?.data ?? []).map((p: any) => ({
                permission: String(p.permission ?? ""),
                status: String(p.status ?? "unknown"),
              }));
            }
          } catch (e: any) {
            permissionsError = e?.name === "AbortError" ? "timeout" : (e?.message ?? "unknown");
          }

          metaAppStatus = {
            available: true,
            app_id: metaAppId,
            name: body.name ?? null,
            app_type: body.app_type ?? null,
            category: body.category ?? null,
            privacy_policy_url: body.privacy_policy_url ?? null,
            terms_of_service_url: body.terms_of_service_url ?? null,
            link: body.link ?? null,
            missing_fields: Object.entries(required)
              .filter(([, v]) => !v)
              .map(([k]) => k),
            unreadable_fields: Object.entries(optional)
              .filter(([, v]) => !v)
              .map(([k]) => k),
            permissions,
            permissions_error: permissionsError,
          };
        }
      } catch (e: any) {
        metaAppStatus = {
          available: false,
          missing_fields: [],
          unreadable_fields: [],
          permissions: [],
          error: e?.name === "AbortError" ? "timeout" : (e?.message ?? "unknown"),
        };
      }
    } else {
      metaAppStatus = {
        available: false,
        missing_fields: [],
        unreadable_fields: [],
        permissions: [],
        error: "credentials_missing",
      };
    }

    return new Response(
      JSON.stringify({
        backend_callback: backendCallback,
        meta_app_status: metaAppStatus,
        checks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "unknown" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
