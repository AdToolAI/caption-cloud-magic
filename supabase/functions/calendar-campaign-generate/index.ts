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
    console.log("📥 Request received at calendar-campaign-generate");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    console.log("📦 Request body:", body);

    const { template_id, campaign_name, start_date, workspace_id, brand_kit_id } = body;

    // Validation with detailed logging
    if (!template_id || !campaign_name || !start_date || !workspace_id) {
      console.error("❌ Missing required fields:", {
        template_id: !!template_id,
        campaign_name: !!campaign_name,
        start_date: !!start_date,
        workspace_id: !!workspace_id
      });
      
      return new Response(
        JSON.stringify({ 
          error: "Fehlende Pflichtfelder", 
          code: "MISSING_REQUIRED_FIELDS",
          details: {
            template_id: !!template_id,
            campaign_name: !!campaign_name,
            start_date: !!start_date,
            workspace_id: !!workspace_id
          }
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ All required fields present");

    // Fetch template
    console.log("🔍 Fetching template:", template_id);
    
    const { data: template, error: templateError } = await supabase
      .from("calendar_campaign_templates")
      .select("*")
      .eq("id", template_id)
      .single();

    if (templateError) {
      console.error("❌ Template fetch error:", templateError);
      return new Response(
        JSON.stringify({ 
          error: "Template nicht gefunden", 
          code: "TEMPLATE_NOT_FOUND",
          details: templateError.message
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Template found:", template.name);

    // Create campaign record (if campaigns table exists, otherwise skip)
    console.log("📝 Creating campaign record...");
    
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
    
    if (campaignError) {
      console.warn("⚠️ Campaign creation failed (non-critical):", campaignError);
    } else {
      console.log("✅ Campaign created:", campaignId);
    }

    // Generate events from template
    console.log("📅 Generating events from template...");
    
    const startDateObj = new Date(start_date);
    const eventsToCreate = [];

    const templateEvents = Array.isArray(template.events_json) ? template.events_json : [];
    console.log(`📊 Processing ${templateEvents.length} template events`);

    for (const eventTemplate of templateEvents) {
      const eventDate = new Date(startDateObj);
      eventDate.setDate(eventDate.getDate() + (eventTemplate.day || 0));

      const eventData: any = {
        workspace_id,
        campaign_id: campaignId,
        title: eventTemplate.title || "Untitled Post",
        brief: eventTemplate.brief || eventTemplate.caption_outline || "",
        caption: "",
        channels: eventTemplate.channels || ["instagram"],
        hashtags: eventTemplate.hashtags || [],
        status: "briefing",
        start_at: eventDate.toISOString(),
        eta_minutes: eventTemplate.eta_minutes || 60
      };

      // Only add brand_kit_id if it's a valid UUID
      if (brand_kit_id && brand_kit_id.trim() !== "") {
        eventData.brand_kit_id = brand_kit_id;
      }

      eventsToCreate.push(eventData);
    }

    console.log(`📝 Inserting ${eventsToCreate.length} events into database...`);

    // Insert events
    const { data: createdEvents, error: eventsError } = await supabase
      .from("calendar_events")
      .insert(eventsToCreate)
      .select();

    if (eventsError) {
      console.error("❌ Events creation error:", eventsError);
      throw eventsError;
    }

    console.log(`✅ Successfully created ${createdEvents?.length} events from template "${template.name}"`);

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
    console.error("💥 Campaign generation error:", {
      message: error.message,
      stack: error.stack,
      details: error
    });
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Interner Fehler bei der Kampagnenerstellung", 
        code: "INTERNAL_ERROR",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
