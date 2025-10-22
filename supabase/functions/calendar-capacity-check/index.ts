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

    const { workspace_id, week_start, assignments } = await req.json();

    if (!workspace_id || !week_start) {
      return new Response(
        JSON.stringify({ error: "MISSING_REQUIRED_FIELDS", code: "MISSING_REQUIRED_FIELDS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate week end
    const weekStartDate = new Date(week_start);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    // Fetch all events for the week
    const { data: events, error: eventsError } = await supabase
      .from("calendar_events")
      .select("assignees, eta_minutes")
      .eq("workspace_id", workspace_id)
      .gte("start_at", weekStartDate.toISOString())
      .lt("start_at", weekEndDate.toISOString());

    if (eventsError) throw eventsError;

    // Calculate current planned minutes per user
    const currentPlanned: Record<string, number> = {};
    events?.forEach((event: any) => {
      const assignees = event.assignees || [];
      const minutes = event.eta_minutes || 0;
      const perUser = assignees.length > 0 ? minutes / assignees.length : 0;

      assignees.forEach((userId: string) => {
        currentPlanned[userId] = (currentPlanned[userId] || 0) + perUser;
      });
    });

    // Add new assignments
    assignments?.forEach((assignment: any) => {
      const { user_id, eta_minutes } = assignment;
      currentPlanned[user_id] = (currentPlanned[user_id] || 0) + (eta_minutes || 0);
    });

    // Fetch workspace members
    const { data: members, error: membersError } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        profiles:user_id (
          email
        )
      `)
      .eq("workspace_id", workspace_id);

    if (membersError) throw membersError;

    // Fetch user capacity settings
    const { data: capacitySettings } = await supabase
      .from("user_capacity")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("week_start", week_start);

    const capacityMap = new Map(
      capacitySettings?.map((c: any) => [c.user_id, c.available_minutes]) || []
    );

    // Build capacity report
    const users = members?.map((member: any) => {
      const userId = member.user_id;
      const email = member.profiles?.email || "Unknown";
      const username = email.split('@')[0];
      const available = capacityMap.get(userId) || 2400; // 40h default
      const planned = currentPlanned[userId] || 0;
      const overbooked = planned > available;

      return {
        user_id: userId,
        username,
        email,
        available_minutes: available,
        planned_minutes: Math.round(planned),
        remaining_minutes: Math.round(available - planned),
        utilization_percent: Math.round((planned / available) * 100),
        overbooked
      };
    }) || [];

    // Summary
    const totalOverbooked = users.filter(u => u.overbooked).length;
    const totalUsers = users.length;

    return new Response(
      JSON.stringify({
        users,
        summary: {
          total_users: totalUsers,
          overbooked_count: totalOverbooked,
          week_start,
          week_end: weekEndDate.toISOString().split('T')[0]
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("Capacity check error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", code: "INTERNAL_ERROR" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
