// update-email-preferences
// Public endpoint (no JWT) — used by:
//   1) /email-preferences page (token-based unsubscribe via URL)
//   2) ProfileTab toggle (authenticated user updates own setting)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, enabled, action } = body as {
      token?: string;
      enabled?: boolean;
      action?: "lookup" | "update";
    };

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // -------- Token-based flow (public, used by /email-preferences) --------
    if (token) {
      const { data: profile, error } = await admin
        .from("profiles")
        .select("id, email, drip_emails_enabled, language")
        .eq("unsubscribe_token", token)
        .maybeSingle();

      if (error || !profile) {
        return new Response(JSON.stringify({ error: "invalid_token" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "lookup" || enabled === undefined) {
        return new Response(
          JSON.stringify({
            email: profile.email,
            drip_emails_enabled: profile.drip_emails_enabled,
            language: profile.language ?? "en",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateErr } = await admin
        .from("profiles")
        .update({ drip_emails_enabled: enabled })
        .eq("id", profile.id);

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, email: profile.email, drip_emails_enabled: enabled }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------- Authenticated user flow (used by ProfileTab) --------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof enabled !== "boolean") {
      return new Response(JSON.stringify({ error: "enabled must be boolean" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { error: updateErr } = await admin
      .from("profiles")
      .update({ drip_emails_enabled: enabled })
      .eq("id", userData.user.id);
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, drip_emails_enabled: enabled }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
