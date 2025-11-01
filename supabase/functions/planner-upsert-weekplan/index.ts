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

    const { id, workspace_id, name, start_date, weeks, timezone, default_platforms } = await req.json();

    if (!workspace_id || !name || !start_date || !weeks) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planData = {
      workspace_id,
      name,
      start_date,
      weeks,
      timezone: timezone || "Europe/Berlin",
      default_platforms: default_platforms || [],
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      result = await supabase
        .from("weekplans")
        .update(planData)
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("weekplans")
        .insert({ ...planData, created_by: user.id })
        .select()
        .single();
    }

    if (result.error) throw result.error;

    return new Response(
      JSON.stringify(result.data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in planner-upsert-weekplan:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
