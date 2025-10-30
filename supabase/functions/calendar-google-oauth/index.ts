import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
      authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.readonly");
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

      console.log("OAuth Callback received:", { code: !!code, state: !!state });

      if (!code || !state) {
        throw new Error("Missing code or state");
      }

      const { workspace_id } = JSON.parse(atob(state));
      console.log("Decoded workspace_id:", workspace_id);

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
      console.log("Tokens received:", { 
        has_access_token: !!tokens.access_token, 
        has_refresh_token: !!tokens.refresh_token 
      });

      // Get calendar ID with multi-stage fallback strategy
      let calendarId: string | null = null;

      // Step 1: Try primary calendar API
      console.log("Attempting to fetch primary calendar...");
      const calendarResponse = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      console.log("Primary calendar response status:", calendarResponse.status);

      if (calendarResponse.ok) {
        const calendar = await calendarResponse.json();
        console.log("Primary calendar response:", JSON.stringify(calendar, null, 2));
        calendarId = calendar.id;
        console.log("Primary calendar ID:", calendarId);
      } else {
        const errorText = await calendarResponse.text();
        console.error("Failed to fetch primary calendar:", {
          status: calendarResponse.status,
          error: errorText
        });
      }

      // Step 2: Fallback to CalendarList API
      if (!calendarId) {
        console.log("Primary calendar ID not found, trying CalendarList API...");
        
        const listResponse = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          }
        );
        
        console.log("CalendarList response status:", listResponse.status);
        
        if (listResponse.ok) {
          const calendarListItem = await listResponse.json();
          console.log("CalendarList response:", JSON.stringify(calendarListItem, null, 2));
          calendarId = calendarListItem.id;
          console.log("CalendarList ID:", calendarId);
        }
      }

      // Step 3: Fallback to user email
      if (!calendarId) {
        console.log("CalendarList ID not found, using fallback identifier...");
        
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          }
        );
        
        console.log("UserInfo response status:", userInfoResponse.status);
        
        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json();
          console.log("User info obtained successfully");
          calendarId = userInfo.email;
          console.log("Using fallback calendar identifier");
        }
      }

      // Final validation
      if (!calendarId) {
        console.error("Failed to obtain calendar ID through all methods");
        throw new Error("Could not determine Google Calendar ID. Please try reconnecting.");
      }

      console.log("Final calendar ID to save:", calendarId);

      // Store refresh token and calendar ID
      console.log("Attempting to upsert calendar_integrations for workspace:", workspace_id);
      const { data: upsertData, error: upsertError } = await supabase
        .from("calendar_integrations")
        .upsert({
          workspace_id,
          google_calendar_connected: true,
          google_refresh_token: tokens.refresh_token,
          google_calendar_id: calendarId,
          google_sync_direction: "push",
        }, { onConflict: "workspace_id" });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        throw new Error(`Failed to save integration: ${upsertError.message}`);
      }
      
      console.log("Upsert successful:", upsertData);

      // Redirect back to app
      const appUrl = Deno.env.get("APP_URL") || "https://useadtool.ai";
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