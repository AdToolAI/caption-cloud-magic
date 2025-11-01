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

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.split("Bearer ")[1] || ""
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { workspace_id, weekplan_id, block_ids } = await req.json();

    if (!workspace_id || !block_ids || !Array.isArray(block_ids)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update blocks to approved
    const { data: blocks, error: updateError } = await supabase
      .from("schedule_blocks")
      .update({ status: "approved" })
      .in("id", block_ids)
      .eq("workspace_id", workspace_id)
      .select("*, content_items(*)");

    if (updateError) throw updateError;

    // Create calendar_events and post_jobs
    const calendarEvents = [];

    for (const block of blocks || []) {
      const content = block.content_items;

      const eventData = {
        workspace_id,
        title: block.title_override || content?.title || "Untitled Post",
        caption: block.caption_override || content?.caption || "",
        channels: [block.platform],
        status: "scheduled" as any,
        start_at: block.start_at,
        assets_json: content?.thumb_url ? [{
          type: content.type === "video" ? "video" : "image",
          url: content.thumb_url,
        }] : [],
        created_by: user.id,
      };

      const { data: event, error: eventError } = await supabase
        .from("calendar_events")
        .insert(eventData)
        .select()
        .single();

      if (!eventError && event) {
        calendarEvents.push(event);

        // Create post_job
        await supabase
          .from("post_jobs")
          .insert({
            workspace_id,
            schedule_id: block.id,
            calendar_event_id: event.id,
            platform: block.platform,
            run_at: block.start_at,
            status: "pending",
            content_snapshot: {
              title: eventData.title,
              caption: eventData.caption,
              media: eventData.assets_json,
            },
          });
      }
    }

    return new Response(
      JSON.stringify({
        approved_blocks: blocks.length,
        calendar_events: calendarEvents.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in planner-approve:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
