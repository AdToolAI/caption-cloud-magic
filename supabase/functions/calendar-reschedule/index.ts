import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { eventId, scheduledAt } = await req.json();

    if (!eventId || !scheduledAt) {
      return new Response(JSON.stringify({ error: 'MISSING_REQUIRED_FIELDS', code: 'MISSING_REQUIRED_FIELDS' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the post
    const { data: post, error: fetchError } = await supabaseClient
      .from('posts')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !post) {
      return new Response(JSON.stringify({ error: 'POST_NOT_FOUND', code: 'POST_NOT_FOUND' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for conflicts (same platform within ±15 min)
    const newTime = new Date(scheduledAt);
    const minTime = new Date(newTime.getTime() - 15 * 60 * 1000);
    const maxTime = new Date(newTime.getTime() + 15 * 60 * 1000);

    const { data: conflicts } = await supabaseClient
      .from('posts')
      .select('id, scheduled_at')
      .eq('user_id', user.id)
      .eq('platform', post.platform)
      .neq('id', eventId)
      .gte('scheduled_at', minTime.toISOString())
      .lte('scheduled_at', maxTime.toISOString());

    if (conflicts && conflicts.length > 0) {
      // Find alternative slots
      const alternatives = await findAlternatives(supabaseClient, user.id, post.platform, newTime);
      
      return new Response(
        JSON.stringify({
          error: 'SCHEDULE_CONFLICT',
          code: 'SCHEDULE_CONFLICT',
          conflict: true,
          conflictTime: newTime.toISOString(),
          alternatives,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update the post
    const { data: updated, error: updateError } = await supabaseClient
      .from('posts')
      .update({ scheduled_at: scheduledAt })
      .eq('id', eventId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ code: 'EVENT_RESCHEDULED', success: true, post: updated }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in calendar-reschedule:', error);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        code: 'INTERNAL_ERROR',
        requestId: crypto.randomUUID(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function findAlternatives(supabase: any, userId: string, platform: string, baseTime: Date): Promise<any[]> {
  const alternatives = [];
  
  // Check next 3 hours in 30-min increments
  for (let i = 1; i <= 6; i++) {
    const testTime = new Date(baseTime.getTime() + i * 30 * 60 * 1000);
    const minTime = new Date(testTime.getTime() - 15 * 60 * 1000);
    const maxTime = new Date(testTime.getTime() + 15 * 60 * 1000);

    const { data: conflicts } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', platform)
      .gte('scheduled_at', minTime.toISOString())
      .lte('scheduled_at', maxTime.toISOString());

    if (!conflicts || conflicts.length === 0) {
      const hour = testTime.getHours();
      const score = hour >= 10 && hour <= 20 ? 70 + Math.floor(Math.random() * 30) : 50 + Math.floor(Math.random() * 20);
      
      alternatives.push({
        time: testTime.toISOString(),
        score,
        reason_key: score >= 70 ? 'BEST_TIME' : 'GOOD_TIME',
      });

      if (alternatives.length >= 3) break;
    }
  }

  return alternatives;
}
