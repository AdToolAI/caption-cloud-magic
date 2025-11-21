import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple cron parser for common patterns
function getNextExecutionTime(pattern: string, lastExecution?: string): Date {
  const now = new Date();
  const parts = pattern.split(' ');
  
  // Support simple patterns: "daily", "weekly", "monthly", or cron syntax
  if (pattern === 'daily') {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  } else if (pattern === 'weekly') {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    next.setHours(9, 0, 0, 0);
    return next;
  } else if (pattern === 'monthly') {
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  
  // Default: next day at 9am
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
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

    console.log('[calendar-process-recurring-events] Processing recurring events');

    // Get all active recurring rules that are due
    const { data: rules, error: rulesError } = await supabaseClient
      .from('recurring_event_rules')
      .select('*')
      .eq('is_active', true)
      .lte('next_execution', new Date().toISOString());

    if (rulesError) {
      throw new Error('Failed to fetch recurring rules');
    }

    console.log('[calendar-process-recurring-events] Found rules:', rules?.length || 0);

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No rules to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let eventsCreated = 0;

    for (const rule of rules) {
      try {
        // Create event from template
        const templateEvent = rule.template_event as any;
        const newEvent = {
          ...templateEvent,
          workspace_id: rule.workspace_id,
          status: 'draft',
          created_at: new Date().toISOString(),
          start_at: new Date().toISOString(), // Current time
          title: `${templateEvent.title} (Recurring)`,
        };

        const { data: createdEvent, error: eventError } = await supabaseClient
          .from('calendar_events')
          .insert(newEvent)
          .select()
          .single();

        if (eventError) {
          console.error('[calendar-process-recurring-events] Failed to create event:', eventError);
          continue;
        }

        eventsCreated++;

        // Create notification
        const { data: members } = await supabaseClient
          .from('workspace_members')
          .select('user_id')
          .eq('workspace_id', rule.workspace_id);

        if (members) {
          const notifications = members.map(m => ({
            user_id: m.user_id,
            type: 'recurring_event_created',
            event_id: createdEvent.id,
            title: 'Recurring Event erstellt',
            message: `Automatisches Event "${createdEvent.title}" wurde erstellt`,
            metadata: { rule_id: rule.id, rule_name: rule.name }
          }));

          await supabaseClient
            .from('notification_queue')
            .insert(notifications);
        }

        // Update rule with next execution time
        const nextExecution = getNextExecutionTime(rule.recurrence_pattern, rule.last_execution);
        
        await supabaseClient
          .from('recurring_event_rules')
          .update({
            last_execution: new Date().toISOString(),
            next_execution: nextExecution.toISOString()
          })
          .eq('id', rule.id);

        console.log('[calendar-process-recurring-events] Created event for rule:', rule.name);

      } catch (error) {
        console.error('[calendar-process-recurring-events] Error processing rule:', rule.id, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rules_processed: rules.length,
        events_created: eventsCreated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-process-recurring-events] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
