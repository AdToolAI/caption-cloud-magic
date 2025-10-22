import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const metricSchema = z.object({
  postId: z.string().optional(),
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'x', 'youtube']),
  caption: z.string().optional(),
  postedAt: z.string(),
  views: z.number().min(0).optional(),
  likes: z.number().min(0).optional(),
  comments: z.number().min(0).optional(),
  shares: z.number().min(0).optional(),
  saves: z.number().min(0).optional(),
});

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const validated = metricSchema.parse(body);

    // Check if metric already exists (by post_id if provided)
    let existingMetric = null;
    if (validated.postId) {
      const { data } = await supabaseClient
        .from('post_metrics')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', validated.postId)
        .single();
      
      existingMetric = data;
    }

    const metricData = {
      user_id: user.id,
      provider: validated.platform,
      account_id: 'manual',
      post_id: validated.postId || `manual_${Date.now()}`,
      caption_text: validated.caption,
      posted_at: validated.postedAt,
      impressions: validated.views,
      likes: validated.likes,
      comments: validated.comments,
      shares: validated.shares,
      saves: validated.saves,
    };

    let result;
    if (existingMetric) {
      // Update existing
      const { data, error } = await supabaseClient
        .from('post_metrics')
        .update(metricData)
        .eq('id', existingMetric.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabaseClient
        .from('post_metrics')
        .insert(metricData)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Emit event for tracking
    await supabaseClient.from('app_events').insert({
      user_id: user.id,
      event_type: 'post.metrics.saved',
      source: 'goals_dashboard',
      payload_json: { metric_id: result.id, platform: validated.platform },
    });

    return new Response(
      JSON.stringify({
        requestId: crypto.randomUUID(),
        success: true,
        metric: result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in save-post-metrics:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation failed',
          details: error.errors,
          requestId: crypto.randomUUID(),
        }),
        {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        requestId: crypto.randomUUID(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
