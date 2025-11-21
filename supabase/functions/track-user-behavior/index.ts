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

    const { event_type, event_data, template_id, content_type, session_id } = await req.json();

    // Insert event (non-blocking for user)
    const { error } = await supabase
      .from('user_behavior_events')
      .insert({
        user_id: user.id,
        event_type,
        event_data: event_data || {},
        template_id: template_id || null,
        content_type: content_type || null,
        session_id: session_id || null,
      });

    if (error) {
      console.error('Failed to track event:', error);
      // Don't throw - tracking should be silent
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in track-user-behavior:', error);
    // Return success even on error - tracking shouldn't block user
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
