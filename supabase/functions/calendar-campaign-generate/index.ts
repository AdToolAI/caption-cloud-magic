import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    const { template_id, campaign_name, start_date, workspace_id, brand_kit_id } = await req.json();

    if (!template_id || !campaign_name || !start_date || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "MISSING_REQUIRED_FIELDS", code: "MISSING_REQUIRED_FIELDS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from("calendar_campaign_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (templateError) {
      return new Response(
        JSON.stringify({ error: "TEMPLATE_NOT_FOUND", code: "TEMPLATE_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create campaign record (if campaigns table exists, otherwise skip)
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        title: campaign_name,
        goal: template.name,
        topic: template.description || "",
        tone: "professional",
        duration_weeks: Math.ceil(template.duration_days / 7),
        platform: ["instagram", "facebook"],
        post_frequency: template.events_json?.length || 5
      })
      .select()
      .single();

    const campaignId = campaign?.id || null;

    // Generate events from template
    const startDateObj = new Date(start_date);
    const eventsToCreate = [];

    for (const eventTemplate of template.events_json || []) {
      const eventDate = new Date(startDateObj);
      eventDate.setDate(eventDate.getDate() + (eventTemplate.day || 0));

      eventsToCreate.push({
        workspace_id,
        brand_kit_id,
        campaign_id: campaignId,
        title: eventTemplate.title || "Untitled Post",
        brief: eventTemplate.brief || eventTemplate.caption_outline || "",
        caption: "",
        channels: eventTemplate.channels || ["instagram"],
        hashtags: eventTemplate.hashtags || [],
        status: "briefing",
        start_at: eventDate.toISOString(),
        eta_minutes: eventTemplate.eta_minutes || 60
      });
    }

    // Insert events
    const { data: createdEvents, error: eventsError } = await supabase
      .from("calendar_events")
      .insert(eventsToCreate)
      .select();

    if (eventsError) throw eventsError;

    console.log(`Generated ${createdEvents?.length} events from template ${template.name}`);

    return new Response(
      JSON.stringify({
        code: "CAMPAIGN_CREATED",
        count: createdEvents?.length || 0,
        campaign_id: campaignId,
        campaign_name,
        events: createdEvents,
        template_name: template.name
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("Campaign generation error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", code: "INTERNAL_ERROR" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
