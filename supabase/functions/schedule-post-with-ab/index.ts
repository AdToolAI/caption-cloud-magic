import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { draftId, platforms, useAB = false } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Nicht authentifiziert");

    console.log("[schedule-post-with-ab] Scheduling draft:", draftId, { useAB, platforms });

    // Fetch draft
    const { data: draft, error: draftError } = await supabaseClient
      .from("post_drafts")
      .select("*")
      .eq("id", draftId)
      .eq("user_id", user.id)
      .single();

    if (draftError || !draft) {
      throw new Error("Draft nicht gefunden");
    }

    const scheduledPosts = [];
    const now = new Date();

    // Get best posting times for each platform
    for (const platform of platforms) {
      // Fetch best time from posting_time_suggestions
      const { data: bestTime } = await supabaseClient
        .from("posting_time_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .eq("platform", platform)
        .order("score", { ascending: false })
        .limit(1)
        .maybeSingle();

      let scheduledTime = new Date(now);
      
      if (bestTime) {
        // Use best time (hour from suggestion)
        scheduledTime.setHours(parseInt(bestTime.hour) || 12, 0, 0, 0);
        // Schedule for next occurrence
        if (scheduledTime < now) {
          scheduledTime.setDate(scheduledTime.getDate() + 1);
        }
      } else {
        // Default: Schedule for tomorrow at 12:00
        scheduledTime.setDate(scheduledTime.getDate() + 1);
        scheduledTime.setHours(12, 0, 0, 0);
      }

      // Variant A (Hook A)
      const postA = {
        user_id: user.id,
        draft_id: draft.id,
        platform,
        variant: "A",
        hook: draft.hooks?.A,
        caption: draft.caption,
        hashtags: draft.hashtags,
        image_url: draft.image_url,
        alt_text: draft.alt_text,
        utm_link: draft.utm_link,
        scheduled_at: scheduledTime.toISOString(),
        status: "scheduled",
      };

      const { data: insertedA } = await supabaseClient
        .from("auto_post_queue")
        .insert(postA)
        .select()
        .single();

      if (insertedA) {
        scheduledPosts.push(insertedA);
      }

      // Variant B (Hook B) - only if A/B testing enabled and caption_b exists
      if (useAB && draft.caption_b) {
        const scheduledTimeB = new Date(scheduledTime);
        scheduledTimeB.setDate(scheduledTimeB.getDate() + 1); // 24h later

        const postB = {
          user_id: user.id,
          draft_id: draft.id,
          platform,
          variant: "B",
          hook: draft.hooks?.B,
          caption: draft.caption_b,
          hashtags: draft.hashtags,
          image_url: draft.image_url,
          alt_text: draft.alt_text,
          utm_link: draft.utm_link,
          scheduled_at: scheduledTimeB.toISOString(),
          status: "scheduled",
        };

        const { data: insertedB } = await supabaseClient
          .from("auto_post_queue")
          .insert(postB)
          .select()
          .single();

        if (insertedB) {
          scheduledPosts.push(insertedB);
        }
      }
    }

    console.log("[schedule-post-with-ab] Scheduled", scheduledPosts.length, "posts");

    return new Response(
      JSON.stringify({
        success: true,
        scheduledPosts,
        message: `${scheduledPosts.length} Post(s) erfolgreich geplant`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[schedule-post-with-ab] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
