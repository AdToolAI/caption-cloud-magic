/**
 * Job Status Endpoint
 * Returns the current status of an AI job
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get job_id from URL or body
    const url = new URL(req.url);
    const jobId = url.searchParams.get('job_id') || (await req.json().catch(() => ({})))?.job_id;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: 'Missing job_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch job from database
    const { data: job, error: jobError } = await supabase
      .from('ai_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id) // Ensure user owns this job
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate progress percentage
    let progress = 0;
    if (job.status === 'pending') progress = 10;
    if (job.status === 'processing') progress = 50;
    if (job.status === 'completed') progress = 100;
    if (job.status === 'failed') progress = 0;

    // Build response
    const response: any = {
      job_id: job.id,
      status: job.status,
      job_type: job.job_type,
      progress,
      created_at: job.created_at,
      processing_started_at: job.processing_started_at,
      completed_at: job.completed_at,
      retry_count: job.retry_count,
      next_retry_at: job.next_retry_at
    };

    // Add result if completed
    if (job.status === 'completed' && job.result_data) {
      response.result = job.result_data;
    }

    // Add error if failed
    if (job.status === 'failed' && job.error_message) {
      response.error = job.error_message;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[job-status] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
