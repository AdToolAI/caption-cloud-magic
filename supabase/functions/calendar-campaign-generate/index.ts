import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE, PATCH",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-qa-mock",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "calendar-campaign-generate" });


  try {
    console.log("📥 Request received at calendar-campaign-generate");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve authenticated user from incoming JWT
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      userId = userData?.user?.id ?? null;
    }
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Nicht eingeloggt", code: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


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

    // Compute campaign date range from template
    const startDateObj = new Date(start_date);
    const templateEventsPreview = Array.isArray(template.events_json) ? template.events_json : [];
    const maxDayOffset = templateEventsPreview.reduce(
      (max: number, ev: any) => Math.max(max, Number(ev?.day || 0)),
      0
    );
    const campaignEndDate = new Date(startDateObj);
    campaignEndDate.setDate(campaignEndDate.getDate() + maxDayOffset + 1);

    // Create campaign record (if campaigns table exists, otherwise skip)
    console.log("📝 Creating campaign record...");

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        user_id: userId,
        title: campaign_name,
        goal: template.name,
        topic: template.description || "",
        tone: "professional",
        duration_weeks: Math.ceil(template.duration_days / 7),
        platform: ["instagram", "facebook"],
        post_frequency: template.events_json?.length || 5,
        starts_at: startDateObj.toISOString(),
        ends_at: campaignEndDate.toISOString(),
        pauses_strategy: true,
      })
      .select()
      .single();

    if (campaignError) {
      console.error("❌ Campaign creation failed:", campaignError);
      return new Response(
        JSON.stringify({
          error: "Kampagne konnte nicht erstellt werden",
          code: "CAMPAIGN_INSERT_FAILED",
          details: campaignError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const campaignId = campaign.id;
    console.log("✅ Campaign created:", campaignId);

    // Auto-pause Strategy Mode for the campaign window and dismiss colliding pending strategy posts
    try {
      await supabase.from("strategy_mode_pauses").insert({
        user_id: userId,
        campaign_id: campaignId,
        starts_at: startDateObj.toISOString(),
        ends_at: campaignEndDate.toISOString(),
        reason: "campaign_override",
      });
      await supabase
        .from("strategy_posts")
        .update({ status: "dismissed" })
        .eq("user_id", userId)
        .eq("status", "pending")
        .gte("scheduled_at", startDateObj.toISOString())
        .lte("scheduled_at", campaignEndDate.toISOString());
      console.log("✅ Strategy mode paused for campaign window");
    } catch (e) {
      console.warn("Strategy pause creation failed (non-fatal):", e);
    }



    // Generate events from template
    console.log("📅 Generating events from template...");
    
    // startDateObj already computed above

    const eventsToCreate = [];

    const templateEvents = Array.isArray(template.events_json) ? template.events_json : [];
    console.log(`📊 Processing ${templateEvents.length} template events`);

    for (let i = 0; i < templateEvents.length; i++) {
      const eventTemplate = templateEvents[i];
      const eventDate = new Date(startDateObj);
      eventDate.setDate(eventDate.getDate() + (eventTemplate.day || 0));

      // Append a zero-width unique marker so the per-workspace content_hash
      // unique index never collides across campaign runs of the same template.
      const uniqMarker = `\u200B[cmp:${campaignId}#${i}]`;
      const briefBase = eventTemplate.brief || eventTemplate.caption_outline || "";

      const eventData: any = {
        workspace_id,
        campaign_id: campaignId,
        title: eventTemplate.title || "Untitled Post",
        brief: `${briefBase}${uniqMarker}`,
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
      return new Response(
        JSON.stringify({
          error: "Events konnten nicht erstellt werden",
          code: eventsError.code || "EVENTS_INSERT_FAILED",
          details: eventsError.message,
          hint: eventsError.hint || null,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
