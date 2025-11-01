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

    const { workspace_id, blocks } = await req.json();

    if (!workspace_id || !blocks || !Array.isArray(blocks)) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const block of blocks) {
      const start = new Date(block.start_at);
      const end = new Date(block.end_at);

      if (end <= start) {
        results.push({ error: "end_at must be after start_at", block });
        continue;
      }

      const blockData = {
        workspace_id,
        weekplan_id: block.weekplan_id,
        content_id: block.content_id,
        platform: block.platform,
        start_at: block.start_at,
        end_at: block.end_at,
        title_override: block.title_override,
        caption_override: block.caption_override,
        status: block.status || "draft",
        meta: block.meta || {},
        updated_at: new Date().toISOString(),
      };

      let result;
      if (block.id) {
        result = await supabase
          .from("schedule_blocks")
          .update(blockData)
          .eq("id", block.id)
          .select("*, content_items(*)")
          .single();
      } else {
        result = await supabase
          .from("schedule_blocks")
          .insert(blockData)
          .select("*, content_items(*)")
          .single();
      }

      results.push(result.data || { error: result.error });
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in planner-upsert-blocks:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
