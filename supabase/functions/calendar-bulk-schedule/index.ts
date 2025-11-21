import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BulkScheduleConfig {
  workspace_id: string;
  start_date: string;
  end_date: string;
  events: Array<{
    title: string;
    caption?: string;
    channels: string[];
    brand_kit_id?: string;
  }>;
  distribution_strategy: 'even' | 'optimal' | 'manual';
  posting_slots?: string[]; // For manual strategy
  use_posting_times?: boolean; // Use AI posting times
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const config: BulkScheduleConfig = await req.json();

    console.log('[calendar-bulk-schedule] Starting bulk schedule:', {
      user_id: user.id,
      workspace_id: config.workspace_id,
      event_count: config.events.length,
      strategy: config.distribution_strategy
    });

    // Create bulk schedule job
    const { data: job, error: jobError } = await supabaseClient
      .from('bulk_schedule_jobs')
      .insert({
        workspace_id: config.workspace_id,
        user_id: user.id,
        total_events: config.events.length,
        config,
        status: 'processing'
      })
      .select()
      .single();

    if (jobError) {
      throw new Error('Failed to create bulk schedule job');
    }

    // Calculate time slots
    const startDate = new Date(config.start_date);
    const endDate = new Date(config.end_date);
    const timeSlots: Date[] = [];

    if (config.distribution_strategy === 'even') {
      // Distribute evenly across date range
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const eventsPerDay = Math.ceil(config.events.length / totalDays);
      
      for (let i = 0; i < config.events.length; i++) {
        const dayOffset = Math.floor(i / eventsPerDay);
        const slotDate = new Date(startDate);
        slotDate.setDate(slotDate.getDate() + dayOffset);
        slotDate.setHours(9 + (i % eventsPerDay) * 3); // 9am, 12pm, 3pm, etc.
        timeSlots.push(slotDate);
      }
    } else if (config.distribution_strategy === 'manual' && config.posting_slots) {
      // Use provided time slots
      config.posting_slots.forEach(slot => {
        timeSlots.push(new Date(slot));
      });
    } else {
      // Optimal strategy - use posting times if available
      // For now, fallback to even distribution
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const eventsPerDay = Math.ceil(config.events.length / totalDays);
      
      for (let i = 0; i < config.events.length; i++) {
        const dayOffset = Math.floor(i / eventsPerDay);
        const slotDate = new Date(startDate);
        slotDate.setDate(slotDate.getDate() + dayOffset);
        slotDate.setHours(10 + (i % eventsPerDay) * 4); // 10am, 2pm, 6pm
        timeSlots.push(slotDate);
      }
    }

    // Create calendar events
    const eventsToCreate = config.events.map((event, index) => ({
      workspace_id: config.workspace_id,
      title: event.title,
      caption: event.caption,
      channels: event.channels,
      brand_kit_id: event.brand_kit_id,
      start_at: timeSlots[index]?.toISOString() || new Date().toISOString(),
      status: 'draft',
      created_by: user.id,
      timezone: 'Europe/Berlin'
    }));

    const { data: createdEvents, error: eventsError } = await supabaseClient
      .from('calendar_events')
      .insert(eventsToCreate)
      .select();

    if (eventsError) {
      console.error('[calendar-bulk-schedule] Error creating events:', eventsError);
      
      // Update job status to failed
      await supabaseClient
        .from('bulk_schedule_jobs')
        .update({
          status: 'failed',
          error_message: eventsError.message
        })
        .eq('id', job.id);

      throw new Error('Failed to create calendar events');
    }

    // Update job status
    await supabaseClient
      .from('bulk_schedule_jobs')
      .update({
        status: 'completed',
        created_events: createdEvents.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.log('[calendar-bulk-schedule] Bulk schedule completed:', {
      job_id: job.id,
      events_created: createdEvents.length
    });

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        events_created: createdEvents.length,
        events: createdEvents
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-bulk-schedule] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
