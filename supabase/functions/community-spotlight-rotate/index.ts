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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const headers = {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // Get all channels with rotation entries
    const rotResp = await fetch(`${SUPABASE_URL}/rest/v1/spotlight_rotation?select=*`, { headers });
    const rotations = await rotResp.json();

    const results: any[] = [];

    for (const rotation of rotations) {
      const rotatedAt = new Date(rotation.rotated_at);
      const intervalMs = rotation.rotation_interval_days * 24 * 60 * 60 * 1000;
      const now = Date.now();

      // Check if rotation is due
      if (now - rotatedAt.getTime() < intervalMs) continue;

      // Find best non-spotlight message in this channel (most tags, most recent)
      const msgResp = await fetch(
        `${SUPABASE_URL}/rest/v1/community_messages?channel_id=eq.${rotation.channel_id}&moderation_status=eq.approved&is_spotlight=eq.false&order=created_at.desc&limit=1`,
        { headers }
      );
      const msgs = await msgResp.json();
      const newSpotlight = msgs?.[0];

      if (!newSpotlight) continue;

      // Remove old spotlight flag
      if (rotation.current_post_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/community_messages?id=eq.${rotation.current_post_id}`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ is_spotlight: false }),
        });
      }

      // Set new spotlight
      await fetch(`${SUPABASE_URL}/rest/v1/community_messages?id=eq.${newSpotlight.id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ is_spotlight: true }),
      });

      // Update rotation
      await fetch(`${SUPABASE_URL}/rest/v1/spotlight_rotation?id=eq.${rotation.id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          current_post_id: newSpotlight.id,
          rotated_at: new Date().toISOString(),
        }),
      });

      // Notify author
      const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/community-notify`;
      await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "spotlight_selected",
          spotlight_post_id: newSpotlight.id,
        }),
      });

      results.push({ channel_id: rotation.channel_id, new_spotlight: newSpotlight.id });
    }

    return new Response(JSON.stringify({ rotated: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Spotlight rotation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
