import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[check-calendar-deadlines] Checking for upcoming deadlines');

    // Get all events with upcoming deadlines (next 24 hours)
    const twentyFourHoursFromNow = new Date();
    twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

    const { data: upcomingEvents, error: eventsError } = await supabaseClient
      .from('calendar_events')
      .select('id, title, start_at, workspace_id, created_by, owner_id')
      .gte('start_at', new Date().toISOString())
      .lte('start_at', twentyFourHoursFromNow.toISOString())
      .in('status', ['draft', 'scheduled']);

    if (eventsError) {
      throw new Error('Failed to fetch events');
    }

    console.log('[check-calendar-deadlines] Found events:', upcomingEvents?.length || 0);

    if (!upcomingEvents || upcomingEvents.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No upcoming deadlines', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notifications for each event
    const notifications = [];

    for (const event of upcomingEvents) {
      // Check if notification already exists
      const { data: existing } = await supabaseClient
        .from('notification_queue')
        .select('id')
        .eq('event_id', event.id)
        .eq('type', 'deadline')
        .single();

      if (!existing) {
        const hoursUntil = Math.round(
          (new Date(event.start_at).getTime() - new Date().getTime()) / (1000 * 60 * 60)
        );

        // Get workspace members
        const { data: members } = await supabaseClient
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', event.workspace_id);

        if (members) {
          for (const member of members) {
            notifications.push({
              user_id: member.user_id,
              type: 'deadline',
              event_id: event.id,
              title: 'Deadline-Erinnerung',
              message: `Event "${event.title}" ist in ${hoursUntil} Stunden fällig`,
              metadata: { hours_until: hoursUntil, start_at: event.start_at }
            });
          }
        }
      }
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('notification_queue')
        .insert(notifications);

      if (insertError) {
        console.error('[check-calendar-deadlines] Failed to create notifications:', insertError);
      } else {
        console.log('[check-calendar-deadlines] Created notifications:', notifications.length);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        events_checked: upcomingEvents.length,
        notifications_created: notifications.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[check-calendar-deadlines] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
