import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    const { workspace_id, platform, start_at, end_at, exclude_id } = await req.json();

    if (!workspace_id || !platform || !start_at || !end_at) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase
      .from("schedule_blocks")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("platform", platform)
      .or(`start_at.lt.${end_at},end_at.gt.${start_at}`);

    if (exclude_id) {
      query = query.neq("id", exclude_id);
    }

    const { data: conflicts, error } = await query;

    if (error) throw error;

    return new Response(
      JSON.stringify({ conflicts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in planner-conflicts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
