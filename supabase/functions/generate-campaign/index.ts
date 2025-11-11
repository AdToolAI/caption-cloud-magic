// Telemetry enabled - Async Queue System - v4.0
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withRateLimit } from '../_shared/rate-limiter.ts';
import { withTelemetry, trackAIJobEvent } from '../_shared/telemetry.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(withTelemetry('generate-campaign', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return withRateLimit(req, async (req, rateLimiter) => {
    try {
      const supabaseClient = getSupabaseClient();

      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
      const userId = user?.id;
      
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Input validation
      const requestSchema = z.object({
        goal: z.string().min(1).max(500),
        topic: z.string().min(1).max(500),
        tone: z.string().max(50),
        audience: z.string().max(200).optional(),
        durationWeeks: z.number().int().min(1).max(8),
        platforms: z.array(z.string().max(50)).min(1).max(10),
        postFrequency: z.number().int().min(1).max(21),
        language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
        postTypes: z.array(z.object({
          type: z.enum(['Reel', 'Carousel', 'Story', 'Static Post', 'Link Post']),
          count: z.number().int().min(1).max(10),
        })).optional(),
        media: z.array(z.object({
          storage_path: z.string(),
          public_url: z.string(),
          media_type: z.enum(['image', 'video']),
          file_size: z.number(),
          mime_type: z.string(),
        })).optional(),
      });

      const body = await req.json();
      const validation = requestSchema.safeParse(body);
      
      if (!validation.success) {
        return new Response(
          JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language } = validation.data;

      // Get user plan
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      const userPlan = profile?.plan || 'free';

      // Check campaign limits
      if (userPlan === 'free') {
        const { count } = await supabaseClient
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (count && count >= 1) {
          return new Response(
            JSON.stringify({ error: 'Free plan allows only 1 campaign. Upgrade to Pro for unlimited campaigns.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (durationWeeks > 1) {
          return new Response(
            JSON.stringify({ error: 'Free plan limited to 1 week campaigns. Upgrade to Pro for up to 8 weeks.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Queue job for async processing
      const jobId = crypto.randomUUID();
      
      const { data: job, error: jobError } = await supabaseClient
        .from('ai_jobs')
        .insert({
          id: jobId,
          user_id: userId,
          job_type: 'campaign',
          priority: 5,
          input_data: { 
            goal, 
            topic, 
            tone, 
            audience, 
            durationWeeks, 
            platforms, 
            postFrequency, 
            language,
            postTypes: validation.data.postTypes,
            media: validation.data.media,
            userPlan
          },
          status: 'pending',
          retry_count: 0,
          max_retries: 3
        })
        .select()
        .single();

      if (jobError) {
        console.error('[Queue] Failed to create job:', jobError);
        return new Response(
          JSON.stringify({ error: 'Failed to queue campaign generation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Track queued event
      await trackAIJobEvent('queued', jobId, 'campaign', userId, {
        goal,
        topic,
        duration_weeks: durationWeeks,
        platforms,
        post_frequency: postFrequency
      }).catch(err => console.error('[Telemetry] Failed to track queued event:', err));

      console.log(`[generate-campaign] Job ${jobId} queued for async processing`);

      // Return 202 Accepted with job_id
      return new Response(
        JSON.stringify({ 
          status: 'queued',
          job_id: jobId,
          message: 'Campaign generation queued. Check status at /job-status endpoint.'
        }),
        { 
          status: 202, // Accepted
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (error: any) {
      console.error('Error in generate-campaign:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  });
}));
