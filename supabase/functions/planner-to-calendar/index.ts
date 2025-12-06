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

    const { blockIds, workspaceId, autoPublish = false } = await req.json();

    if (!blockIds || !Array.isArray(blockIds) || blockIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No block IDs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[planner-to-calendar] Processing", blockIds.length, "blocks, autoPublish:", autoPublish);

    // Fetch schedule_blocks with content_items
    const { data: blocks, error: fetchError } = await supabase
      .from("schedule_blocks")
      .select("*, content_items(*)")
      .in("id", blockIds)
      .eq("workspace_id", workspaceId);

    if (fetchError) throw fetchError;

    if (!blocks || blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No blocks found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let eventsCreated = 0;
    let jobsCreated = 0;
    const errors: string[] = [];

    for (const block of blocks) {
      try {
        // Build assets_json from content_items or block meta
        const assetsJson: any[] = [];
        if (block.meta?.media_urls) {
          block.meta.media_urls.forEach((url: string, idx: number) => {
            assetsJson.push({
              type: block.meta?.media_types?.[idx] || "image",
              url: url,
            });
          });
        } else if (block.content_items?.thumb_url) {
          assetsJson.push({
            type: "image",
            url: block.content_items.thumb_url,
          });
        }

        // Create calendar_event
        const { data: event, error: eventError } = await supabase
          .from("calendar_events")
          .insert({
            workspace_id: workspaceId,
            title: block.title_override || block.content_items?.title || "Post",
            caption: block.caption_override || block.content_items?.caption || "",
            channels: [block.platform.toLowerCase()],
            start_at: block.start_at,
            end_at: block.end_at,
            status: autoPublish ? "scheduled" : "briefing",
            assets_json: assetsJson.length > 0 ? assetsJson : null,
            created_by: user.id,
            timezone: "Europe/Berlin",
          })
          .select()
          .single();

        if (eventError) {
          console.error("[planner-to-calendar] Event creation error:", eventError);
          errors.push(`Event for block ${block.id}: ${eventError.message}`);
          continue;
        }

        eventsCreated++;

        // Update schedule_block status
        await supabase
          .from("schedule_blocks")
          .update({ 
            status: autoPublish ? "queued" : "scheduled",
            updated_at: new Date().toISOString()
          })
          .eq("id", block.id);

        // If auto-publish is enabled, create post_jobs entry
        if (autoPublish && event) {
          const contentSnapshot = {
            caption: block.caption_override || block.content_items?.caption || "",
            media: assetsJson.map(a => a.url),
          };

          const { error: jobError } = await supabase
            .from("post_jobs")
            .insert({
              workspace_id: workspaceId,
              schedule_id: block.id,
              calendar_event_id: event.id,
              platform: block.platform.toLowerCase(),
              run_at: block.start_at,
              status: "pending",
              content_snapshot: contentSnapshot,
            });

          if (jobError) {
            console.error("[planner-to-calendar] Job creation error:", jobError);
            errors.push(`Job for block ${block.id}: ${jobError.message}`);
          } else {
            jobsCreated++;
          }
        }

      } catch (blockError: any) {
        console.error("[planner-to-calendar] Block processing error:", blockError);
        errors.push(`Block ${block.id}: ${blockError.message}`);
      }
    }

    console.log("[planner-to-calendar] Created", eventsCreated, "events and", jobsCreated, "jobs");

    return new Response(
      JSON.stringify({
        success: true,
        eventsCreated,
        jobsCreated,
        autoPublish,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[planner-to-calendar] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
