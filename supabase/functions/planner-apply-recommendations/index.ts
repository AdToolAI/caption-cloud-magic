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

    const { weekplan_id, workspace_id, brand_kit_id } = await req.json();

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

    // Get unscheduled content items
    const usedContentIds = existingBlocks?.map(b => b.content_id).filter(Boolean) || [];
    
    let unscheduledQuery = supabase
      .from("content_items")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (usedContentIds.length > 0) {
      unscheduledQuery = unscheduledQuery.not("id", "in", `(${usedContentIds.join(",")})`);
    }

    const { data: unscheduledItems } = await unscheduledQuery;

    // Get AI recommendations from calendar-timeline-slots
    const platforms = plan.default_platforms || ["Instagram"];
    const recommendations = [];

    for (const platform of platforms) {
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

      if (!slotsError && slots?.timeline) {
        recommendations.push({
          platform,
          slots: slots.timeline,
        });
      }
    }

    // Map unscheduled items to top AI slots
    const suggestedBlocks = [];

    for (const item of unscheduledItems || []) {
      const targetPlatforms = item.targets || platforms;

      for (const platform of targetPlatforms) {
        const platformSlots = recommendations.find(r => r.platform === platform)?.slots || [];
        const topSlot = platformSlots
          .flatMap((day: any) => day.slots || [])
          .filter((slot: any) => !slot.blocked && slot.score >= 70)
          .sort((a: any, b: any) => b.score - a.score)[0];

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

          break; // One platform per item
        }
      }
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
