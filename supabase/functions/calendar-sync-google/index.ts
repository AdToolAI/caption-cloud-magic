import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { workspace_id, sync_direction } = await req.json();

    console.log("Syncing Google Calendar for workspace:", workspace_id);

    // Fetch integration settings
    const { data: integration, error: integrationError } = await supabase
      .from("calendar_integrations")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (integrationError || !integration || !integration.google_calendar_connected) {
      throw new Error("Google Calendar not connected for this workspace");
    }

    // Get fresh access token
    const accessToken = await refreshAccessToken(integration.google_refresh_token);

    const direction = sync_direction || integration.google_sync_direction || "push";

    if (direction === "push" || direction === "two_way") {
      await pushEventsToGoogle(supabase, workspace_id, integration.google_calendar_id, accessToken);
    }

    if (direction === "pull" || direction === "two_way") {
      await pullEventsFromGoogle(supabase, workspace_id, integration.google_calendar_id, accessToken);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Sync completed" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google access token");
  }

  const data = await response.json();
  return data.access_token;
}

async function pushEventsToGoogle(
  supabase: any,
  workspaceId: string,
  calendarId: string,
  accessToken: string
) {
  console.log("Pushing events to Google Calendar...");

  // Fetch events that need syncing (scheduled & approved)
  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", ["scheduled", "approved"])
    .not("start_at", "is", null);

  if (error) throw error;

  for (const event of events || []) {
    const googleEvent = {
      summary: event.title,
      description: event.caption || event.brief || "",
      start: {
        dateTime: event.start_at,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.end_at || event.start_at,
        timeZone: event.timezone,
      },
      extendedProperties: {
        private: {
          calendarEventId: event.id,
          channels: JSON.stringify(event.channels),
        },
      },
    };

    // Check if event already exists in Google Calendar
    const existingEventId = await findGoogleEventByCalendarId(
      calendarId,
      accessToken,
      event.id
    );

    if (existingEventId) {
      // Update existing event
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${existingEventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }
      );
    } else {
      // Create new event
      const createResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(googleEvent),
        }
      );
      
      console.log(`Create event response for "${event.title}":`, {
        status: createResponse.status,
        ok: createResponse.ok
      });
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Failed to create event "${event.title}":`, errorText);
      } else {
        const createdEvent = await createResponse.json();
        console.log(`Successfully created event "${event.title}" with ID:`, createdEvent.id);
      }
    }
  }

  console.log(`Pushed ${events?.length || 0} events to Google Calendar`);
}

async function pullEventsFromGoogle(
  supabase: any,
  workspaceId: string,
  calendarId: string,
  accessToken: string
) {
  console.log("Pulling events from Google Calendar...");

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `timeMin=${oneWeekAgo.toISOString()}&singleEvents=true&orderBy=startTime`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch events from Google Calendar");
  }

  const data = await response.json();
  const googleEvents = data.items || [];

  for (const googleEvent of googleEvents) {
    // Skip events that originated from our calendar
    if (googleEvent.extendedProperties?.private?.calendarEventId) {
      continue;
    }

    // Check if event already exists in our DB
    const { data: existingEvent } = await supabase
      .from("calendar_events")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("title", googleEvent.summary)
      .single();

    if (existingEvent) continue;

    // Create new event
    await supabase.from("calendar_events").insert({
      workspace_id: workspaceId,
      title: googleEvent.summary || "Untitled Event",
      brief: googleEvent.description || null,
      channels: ["google_calendar"],
      status: "scheduled",
      start_at: googleEvent.start.dateTime || googleEvent.start.date,
      end_at: googleEvent.end.dateTime || googleEvent.end.date,
      timezone: googleEvent.start.timeZone || "UTC",
    });
  }

  console.log(`Pulled ${googleEvents.length} events from Google Calendar`);
}

async function findGoogleEventByCalendarId(
  calendarId: string,
  accessToken: string,
  calendarEventId: string
): Promise<string | null> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `privateExtendedProperty=calendarEventId=${calendarEventId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  return data.items?.[0]?.id || null;
}