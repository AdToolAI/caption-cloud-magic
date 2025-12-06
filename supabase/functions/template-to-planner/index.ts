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

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { templateId, startDate, workspaceId } = await req.json();

    if (!templateId || !startDate || !workspaceId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: templateId, startDate, workspaceId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[template-to-planner] Processing template:", templateId, "start:", startDate);

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from("calendar_campaign_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: "Template not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = template.events_json || [];
    if (!Array.isArray(events) || events.length === 0) {
      return new Response(
        JSON.stringify({ error: "Template has no events" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create weekplan
    const startDateObj = new Date(startDate);
    const weekStart = new Date(startDateObj);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    
    let weekplanId: string;
    
    const { data: existingWeekplan } = await supabase
      .from("weekplans")
      .select("id")
      .eq("workspace_id", workspaceId)
      .gte("start_date", weekStart.toISOString().split("T")[0])
      .lte("start_date", new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .single();

    if (existingWeekplan) {
      weekplanId = existingWeekplan.id;
    } else {
      const { data: newWeekplan, error: createError } = await supabase
        .from("weekplans")
        .insert({
          workspace_id: workspaceId,
          name: `Woche ${weekStart.toLocaleDateString('de-DE')}`,
          start_date: weekStart.toISOString().split("T")[0],
          weeks: 1,
          status: "draft",
          created_by: user.id
        })
        .select()
        .single();

      if (createError || !newWeekplan) throw createError || new Error("Failed to create weekplan");
      weekplanId = newWeekplan.id;
    }

    // Map post type to optimal time
    const getOptimalTime = (postType: string): string => {
      const times: Record<string, string> = {
        "video": "19:00",
        "reel": "20:00",
        "story": "12:00",
        "carousel": "18:00",
        "image": "14:00",
        "post": "17:00",
      };
      return times[postType?.toLowerCase()] || "18:00";
    };

    let blocksCreated = 0;
    const errors: string[] = [];

    for (const event of events) {
      try {
        // Calculate date based on day offset
        const dayOffset = event.day || event.day_offset || 0;
        const postDate = new Date(startDateObj);
        postDate.setDate(postDate.getDate() + dayOffset);
        
        // Set optimal time
        const time = event.time || getOptimalTime(event.postType || event.post_type);
        const [hours, minutes] = time.split(":").map(Number);
        postDate.setHours(hours, minutes, 0, 0);
        
        const endDate = new Date(postDate.getTime() + 30 * 60 * 1000); // +30 min

        // Create content_item first
        const { data: contentItem, error: contentError } = await supabase
          .from("content_items")
          .insert({
          workspace_id: workspaceId,
          type: event.postType || event.post_type || "post",
          title: event.title || `Post Tag ${dayOffset + 1}`,
          caption: event.caption || "",
          thumb_url: event.mediaUrl || null,
          source: "campaign",
          source_id: templateId,
          })
          .select()
          .single();

        if (contentError) {
          console.error("[template-to-planner] Content item error:", contentError);
          errors.push(`Content for day ${dayOffset}: ${contentError.message}`);
          continue;
        }

        // Create schedule_block
        const { error: blockError } = await supabase
          .from("schedule_blocks")
          .insert({
            workspace_id: workspaceId,
            weekplan_id: weekplanId,
            content_id: contentItem?.id,
            platform: event.platform || "instagram",
            start_at: postDate.toISOString(),
            end_at: endDate.toISOString(),
            status: "draft",
            title_override: event.title,
            caption_override: event.caption,
            meta: {
              template_id: templateId,
              media_urls: event.mediaUrl ? [event.mediaUrl] : [],
              media_types: event.mediaType ? [event.mediaType] : [],
            }
          });

        if (blockError) {
          console.error("[template-to-planner] Block error:", blockError);
          errors.push(`Block for day ${dayOffset}: ${blockError.message}`);
          continue;
        }

        blocksCreated++;

      } catch (eventError: any) {
        console.error("[template-to-planner] Event processing error:", eventError);
        errors.push(`Event processing: ${eventError.message}`);
      }
    }

    console.log("[template-to-planner] Created", blocksCreated, "blocks");

    return new Response(
      JSON.stringify({
        success: true,
        blocksCreated,
        weekplanId,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[template-to-planner] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
