import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getRedisCache } from "../_shared/redis-cache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    console.log("[calendar-quick-add] Request received. Auth header:", authHeader ? "Present" : "Missing");
    
    const { caption, platform, hashtags, suggestedTime, language } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError) {
      console.error("[calendar-quick-add] Auth error:", authError);
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    
    if (!user) {
      console.error("[calendar-quick-add] No user found. Authorization header:", authHeader ? "Present" : "Missing");
      throw new Error("Not authenticated - please log in");
    }

    console.log("[calendar-quick-add] User:", user.id, "Caption length:", caption?.length);

    // Get user's default workspace
    const { data: workspaces } = await supabaseClient
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1);

    if (!workspaces || workspaces.length === 0) {
      throw new Error("No workspace found. Please create a workspace first.");
    }

    const workspaceId = workspaces[0].id;

    // Map platform to channel
    const channelMap: Record<string, string> = {
      instagram: "Instagram",
      tiktok: "TikTok",
      linkedin: "LinkedIn",
      facebook: "Facebook",
      twitter: "Twitter",
    };

    const channel = channelMap[platform?.toLowerCase()] || "Instagram";

    // Parse suggested time
    let startDate: Date | null = null;
    if (suggestedTime) {
      try {
        startDate = new Date(suggestedTime);
        if (isNaN(startDate.getTime())) {
          startDate = null;
        }
      } catch (e) {
        console.error("Error parsing suggestedTime:", e);
      }
    }

    // Create minimal event
    const eventData = {
      workspace_id: workspaceId,
      title: `${channel} Post`,
      caption: caption || null,
      hashtags: hashtags && Array.isArray(hashtags) ? hashtags : null,
      channels: [channel],
      status: "briefing",
      start_at: startDate?.toISOString() || null,
      created_by: user.id,
      owner_id: user.id,
    };

    const { data: event, error } = await supabaseClient
      .from("calendar_events")
      .insert(eventData)
      .select()
      .single();

    if (error) {
      console.error("[calendar-quick-add] Insert error:", error);
      throw error;
    }

    console.log("[calendar-quick-add] Event created:", event.id);

    // Invalidate dashboard calendar cache
    const cache = getRedisCache();
    await cache.invalidate(`dashboard-calendar:${user.id}:*`);
    console.log(`[calendar-quick-add] Invalidated cache for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        event,
        message: "Event created successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[calendar-quick-add] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
