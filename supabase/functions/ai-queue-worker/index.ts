/**
 * AI Queue Worker - Continuous Processing
 * Processes AI jobs from the queue with retry logic and exponential backoff
 * Designed for 1000+ concurrent users
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { trackAIJobEvent } from '../_shared/telemetry.ts';

const BATCH_SIZE = 5; // Process 5 jobs in parallel
const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds
const JOB_TIMEOUT_MS = 300000; // 5 minutes max per job
const STALE_JOB_THRESHOLD_MS = 600000; // Reset jobs stuck for >10 minutes

interface AIJob {
  id: string;
  user_id: string;
  workspace_id: string | null;
  job_type: string;
  input_data: any;
  retry_count: number;
  max_retries: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log('[Worker] Starting AI job worker...');

  // Reset stale jobs on startup
  await resetStaleJobs(supabase);

  // Process one batch and return (for cron-like behavior)
  // For true continuous processing, wrap in while(true) loop
  const processedCount = await processJobBatch(supabase);

  return new Response(
    JSON.stringify({
      processed: processedCount,
      timestamp: new Date().toISOString()
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  );
});

async function resetStaleJobs(supabase: any): Promise<void> {
  const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);

  const { data, error } = await supabase
    .from('ai_jobs')
    .update({
      status: 'pending',
      processing_started_at: null,
    })
    .eq('status', 'processing')
    .lt('processing_started_at', staleThreshold.toISOString())
    .select();

  if (data?.length) {
    console.log(`[Worker] Reset ${data.length} stale jobs`);
  }
}

async function processJobBatch(supabase: any): Promise<number> {
  // Pull pending jobs
  const now = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from('ai_jobs')
    .select('*')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error || !jobs || jobs.length === 0) {
    return 0;
  }

  console.log(`[Worker] Processing ${jobs.length} jobs`);

  // Mark as processing
  const jobIds = jobs.map((j: AIJob) => j.id);
  await supabase
    .from('ai_jobs')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString()
    })
    .in('id', jobIds);

  // Process in parallel
  const results = await Promise.allSettled(
    jobs.map((job: AIJob) => processJob(supabase, job))
  );

  return results.length;
}

async function processJob(supabase: any, job: AIJob): Promise<void> {
  const startTime = Date.now();
  console.log(`[Worker] Processing job ${job.id} (type: ${job.job_type})`);

  // Track job started
  await trackAIJobEvent('started', job.id, job.job_type, job.user_id);

  try {
    // Route to appropriate AI function with timeout
    const result = await Promise.race([
      invokeAIFunction(supabase, job),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('JOB_TIMEOUT')), JOB_TIMEOUT_MS)
      )
    ]);

    // Success
    await supabase
      .from('ai_jobs')
      .update({
        status: 'completed',
        result_data: result,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    // Unregister from active jobs
    await supabase
      .from('active_ai_jobs')
      .delete()
      .eq('job_id', job.id);

    const duration = Date.now() - startTime;
    console.log(`[Worker] ✓ Job ${job.id} completed in ${duration}ms`);

    // Track job completed
    await trackAIJobEvent('completed', job.id, job.job_type, job.user_id, {
      duration_ms: duration
    });

  } catch (error: any) {
    console.error(`[Worker] ✗ Job ${job.id} failed:`, error.message);

    const retryCount = job.retry_count + 1;
    const shouldRetry = retryCount < job.max_retries && error.message !== 'JOB_TIMEOUT';

    // Track job failed
    await trackAIJobEvent('failed', job.id, job.job_type, job.user_id, {
      error_message: error.message,
      retry_count: retryCount,
      will_retry: shouldRetry
    });

    if (shouldRetry) {
      // Exponential backoff: 2^retry * 60s
      const backoffSeconds = Math.pow(2, retryCount) * 60;
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

      await supabase
        .from('ai_jobs')
        .update({
          status: 'pending',
          retry_count: retryCount,
          next_retry_at: nextRetryAt.toISOString(),
          error_message: error.message,
          processing_started_at: null
        })
        .eq('id', job.id);

      console.log(`[Worker] Job ${job.id} will retry in ${backoffSeconds}s`);
    } else {
      // Max retries exceeded
      await supabase
        .from('ai_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);

      // Unregister from active jobs
      await supabase
        .from('active_ai_jobs')
        .delete()
        .eq('job_id', job.id);
    }
  }
}

async function invokeAIFunction(supabase: any, job: AIJob): Promise<any> {
  // Map job types to edge functions
  const functionMap: Record<string, string> = {
    'caption': 'generate-caption',
    'campaign': 'generate-campaign',
    'hooks': 'generate-hooks',
    'carousel': 'generate-carousel',
    'reel_script': 'generate-reel-script',
    'reply_suggestions': 'generate-reply-suggestions',
    'bio': 'generate-bio'
  };

  const functionName = functionMap[job.job_type];
  if (!functionName) {
    throw new Error(`Unknown job type: ${job.job_type}`);
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: job.input_data
  });

  if (error) throw error;
  return data;
}
