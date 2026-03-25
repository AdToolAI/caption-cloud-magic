import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, slot_id, booked_by, channel_id, message_id, spotlight_post_id } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    let notificationPayload: any = null;

    if (type === "mentor_booked" && slot_id) {
      // Get slot details
      const slotResp = await fetch(`${SUPABASE_URL}/rest/v1/mentor_slots?id=eq.${slot_id}&select=*`, {
        headers,
      });
      const slots = await slotResp.json();
      const slot = slots?.[0];

      if (slot) {
        notificationPayload = {
          user_id: slot.mentor_user_id,
          event_type: "goal.progress.updated",
          source: "community",
          payload_json: {
            notification_type: "mentor_slot_booked",
            slot_id,
            booked_by,
            slot_time: slot.slot_time,
          },
        };
      }
    }

    if (type === "spotlight_selected" && spotlight_post_id) {
      // Get message author
      const msgResp = await fetch(`${SUPABASE_URL}/rest/v1/community_messages?id=eq.${spotlight_post_id}&select=user_id`, {
        headers,
      });
      const msgs = await msgResp.json();
      const msg = msgs?.[0];

      if (msg) {
        notificationPayload = {
          user_id: msg.user_id,
          event_type: "goal.progress.updated",
          source: "community",
          payload_json: {
            notification_type: "spotlight_selected",
            message_id: spotlight_post_id,
          },
        };
      }
    }

    if (notificationPayload) {
      await fetch(`${SUPABASE_URL}/rest/v1/app_events`, {
        method: "POST",
        headers,
        body: JSON.stringify(notificationPayload),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Notify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
