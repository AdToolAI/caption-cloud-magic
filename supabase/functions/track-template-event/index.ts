import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { template_id, event_type, session_id, metadata } = await req.json();

    if (!template_id || !event_type) {
      throw new Error('Missing required fields: template_id and event_type');
    }

    const validEventTypes = ['viewed', 'selected', 'created', 'published'];
    if (!validEventTypes.includes(event_type)) {
      throw new Error('Invalid event_type. Must be one of: viewed, selected, created, published');
    }

    // Insert conversion event
    const { error: eventError } = await supabase
      .from('template_conversion_events')
      .insert({
        template_id,
        user_id: user.id,
        session_id: session_id || crypto.randomUUID(),
        event_type,
        metadata: metadata || {},
        [`${event_type}_at`]: new Date().toISOString(),
      });

    if (eventError) {
      console.error('Error inserting conversion event:', eventError);
      throw eventError;
    }

    // Update daily performance metrics
    const today = new Date().toISOString().split('T')[0];
    
    const metricField = event_type === 'viewed' ? 'total_views' :
                       event_type === 'selected' ? 'total_selections' :
                       event_type === 'created' ? 'projects_created' :
                       'projects_published';

    // Upsert daily metrics
    const { error: metricsError } = await supabase
      .from('template_performance_metrics')
      .upsert({
        template_id,
        date: today,
        [metricField]: 1,
      }, {
        onConflict: 'template_id,date',
        ignoreDuplicates: false,
      });

    if (metricsError) {
      console.error('Error updating performance metrics:', metricsError);
    }

    // Emit app event for further processing
    await supabase
      .from('app_events')
      .insert({
        user_id: user.id,
        event_type: `template.${event_type}`,
        source: 'track_template_event',
        payload_json: {
          template_id,
          session_id,
          metadata,
        },
      });

    return new Response(
      JSON.stringify({ success: true, message: 'Event tracked successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in track-template-event:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
