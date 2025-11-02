import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { weekplan_id, workspace_id, brand_kit_id, mode = "new" } = await req.json();

    if (!weekplan_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get weekplan details
    const { data: plan, error: planError } = await supabase
      .from("weekplans")
      .select("*")
      .eq("id", weekplan_id)
      .single();

    if (planError) throw planError;

    // Get existing blocks
    const { data: existingBlocks } = await supabase
      .from("schedule_blocks")
      .select("*")
      .eq("weekplan_id", weekplan_id);

    // Get content items based on mode
    let contentItems;
    if (mode === "redistribute") {
      // Get ALL content items for redistribution
      const { data } = await supabase
        .from("content_items")
        .select("*")
        .eq("workspace_id", workspace_id);
      contentItems = data;
    } else {
      // Get only unscheduled items (original behavior)
      const usedContentIds = existingBlocks?.map(b => b.content_id).filter(Boolean) || [];
      
      let unscheduledQuery = supabase
        .from("content_items")
        .select("*")
        .eq("workspace_id", workspace_id);

      if (usedContentIds.length > 0) {
        unscheduledQuery = unscheduledQuery.not("id", "in", `(${usedContentIds.join(",")})`);
      }

      const { data } = await unscheduledQuery;
      contentItems = data;
    }

    // Get AI recommendations from calendar-timeline-slots
    const platforms = plan.default_platforms || ["Instagram"];
    const recommendations = [];

    console.log("[Apply Recommendations] Fetching slots for platforms:", platforms);
    console.log("[Apply Recommendations] Weekplan:", { start_date: plan.start_date, weeks: plan.weeks });

    for (const platform of platforms) {
      console.log(`[Apply Recommendations] Invoking calendar-timeline-slots for ${platform}`);
      const { data: slots, error: slotsError } = await supabase.functions.invoke(
        "calendar-timeline-slots",
        {
          body: {
            workspace_id,
            brand_kit_id,
            platform,
            start_date: plan.start_date,
            weeks: plan.weeks,
          },
        }
      );

      console.log(`[Apply Recommendations] Response for ${platform}:`, { 
        hasError: !!slotsError, 
        hasTimeline: !!slots?.timeline,
        timelineLength: slots?.timeline?.length 
      });

      if (slotsError) {
        console.error(`[Apply Recommendations] Error fetching slots for ${platform}:`, slotsError);
      }

      if (!slotsError && slots?.timeline) {
        recommendations.push({
          platform,
          slots: slots.timeline,
        });
      }
    }

    console.log("[Apply Recommendations] Total recommendations:", recommendations.length);

    // Map content items to top AI slots with smart distribution
    const suggestedBlocks = [];
    const usedSlots = new Set();

    console.log("[Apply Recommendations] Processing content items:", contentItems?.length || 0);

    for (const item of contentItems || []) {
      const targetPlatforms = (item.targets && item.targets.length > 0) ? item.targets : platforms;
      console.log(`[Apply Recommendations] Item ${item.id}: targets=${JSON.stringify(item.targets)}, using platforms=${JSON.stringify(targetPlatforms)}`);

      for (const platform of targetPlatforms) {
        const platformSlots = recommendations.find(r => r.platform === platform)?.slots || [];
        
        // Get all available slots with score >= 70, sorted by score
        const availableSlots = platformSlots
          .flatMap((day: any) => day.slots || [])
          .filter((slot: any) => !slot.blocked && slot.score >= 70)
          .sort((a: any, b: any) => b.score - a.score);

        // Find best slot that hasn't been used yet
        const topSlot = availableSlots.find(slot => !usedSlots.has(slot.start));

        if (topSlot) {
          const duration = item.duration_sec || (item.type === "video" ? 60 : 300);

          suggestedBlocks.push({
            weekplan_id,
            content_id: item.id,
            platform,
            start_at: topSlot.start,
            end_at: new Date(new Date(topSlot.start).getTime() + duration * 1000).toISOString(),
            status: "draft",
            meta: { ai_suggested: true, score: topSlot.score },
          });

          // Mark this slot as used
          usedSlots.add(topSlot.start);
          break; // One platform per item
        }
      }
    }

    // If redistribute mode and we have suggestions, delete old blocks first
    if (mode === "redistribute" && suggestedBlocks.length > 0) {
      await supabase
        .from("schedule_blocks")
        .delete()
        .eq("weekplan_id", weekplan_id);
    }

    return new Response(
      JSON.stringify({ suggestions: suggestedBlocks, recommendations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in planner-apply-recommendations:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
