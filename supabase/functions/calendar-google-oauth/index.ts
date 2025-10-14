import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendar-google-oauth/callback`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Generate OAuth URL
    if (path.endsWith("/authorize")) {
      const { workspace_id } = await req.json();

      if (!workspace_id) {
        throw new Error("workspace_id is required");
      }

      const state = btoa(JSON.stringify({ workspace_id, timestamp: Date.now() }));
      
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID!);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);

      return new Response(
        JSON.stringify({ authorization_url: authUrl.toString() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Handle OAuth Callback
    if (path.endsWith("/callback")) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state) {
        throw new Error("Missing code or state");
      }

      const { workspace_id } = JSON.parse(atob(state));

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to exchange code for tokens");
      }

      const tokens = await tokenResponse.json();

      // Get primary calendar ID
      const calendarResponse = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      const calendar = await calendarResponse.json();

      // Store refresh token and calendar ID
      await supabase
        .from("calendar_integrations")
        .upsert({
          workspace_id,
          google_calendar_connected: true,
          google_refresh_token: tokens.refresh_token,
          google_calendar_id: calendar.id,
          google_sync_direction: "push",
        }, { onConflict: "workspace_id" });

      // Redirect back to app
      const appUrl = Deno.env.get("VITE_APP_URL") || "http://localhost:5173";
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          Location: `${appUrl}/calendar?google_connected=true`,
        },
      });
    }

    // Step 3: Disconnect Google Calendar
    if (path.endsWith("/disconnect")) {
      const { workspace_id } = await req.json();

      await supabase
        .from("calendar_integrations")
        .update({
          google_calendar_connected: false,
          google_refresh_token: null,
          google_calendar_id: null,
        })
        .eq("workspace_id", workspace_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid endpoint" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("OAuth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});