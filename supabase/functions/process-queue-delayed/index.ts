import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[process-queue-delayed] Starting queue processor...');

    // Fetch pending/processing jobs with channel_offsets
    const { data: jobs, error: jobsError } = await supabase
      .from('publish_jobs')
      .select('*')
      .not('channel_offsets', 'is', null)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (jobsError) {
      console.error('[process-queue-delayed] Error fetching jobs:', jobsError);
      return new Response(
        JSON.stringify({ error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!jobs || jobs.length === 0) {
      console.log('[process-queue-delayed] No jobs to process');
      return new Response(
        JSON.stringify({ processed: 0, message: 'No jobs to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;
    const now = Date.now();

    for (const job of jobs) {
      const channel_offsets = job.channel_offsets || {};
      const scheduledAt = new Date(job.scheduled_at || job.created_at).getTime();
      
      console.log(`[process-queue-delayed] Processing job ${job.id}`);

      // Get already published providers
      const { data: existingResults } = await supabase
        .from('publish_results')
        .select('provider')
        .eq('job_id', job.id);

      const publishedProviders = existingResults?.map(r => r.provider) || [];

      // Determine which providers are ready to publish
      const readyProviders: string[] = [];
      
      for (const provider of job.channels) {
        if (publishedProviders.includes(provider)) {
          continue; // Already published
        }

        const offset = (channel_offsets[provider] || 0) * 1000; // seconds to ms
        const effectiveTime = scheduledAt + offset;
        
        if (now >= effectiveTime) {
          readyProviders.push(provider);
        }
      }

      if (readyProviders.length === 0) {
        console.log(`[process-queue-delayed] No providers ready for job ${job.id}`);
        continue;
      }

      // Publish to ready providers
      console.log(`[process-queue-delayed] Publishing to ${readyProviders.length} providers for job ${job.id}`);
      
      // NOTE: In production, this would call actual provider-specific publish functions
      // For now, we create placeholder results
      for (const provider of readyProviders) {
        try {
          console.log(`[process-queue-delayed] Publishing to ${provider}`);
          
          // Simulate publish result
          await supabase.from('publish_results').insert({
            job_id: job.id,
            provider,
            ok: true,
            external_id: `delayed_${provider}_${Date.now()}`,
            permalink: `https://${provider}.com/post/${Date.now()}`,
          });

          console.log(`[process-queue-delayed] Successfully published to ${provider}`);
        } catch (error: any) {
          console.error(`[process-queue-delayed] Error publishing to ${provider}:`, error);
          
          await supabase.from('publish_results').insert({
            job_id: job.id,
            provider,
            ok: false,
            error_code: 'PUBLISH_ERROR',
            error_message: error.message,
          });
        }
      }

      // Check if all providers are now done
      const { data: allResults } = await supabase
        .from('publish_results')
        .select('provider')
        .eq('job_id', job.id);

      const doneProviders = allResults?.map(r => r.provider) || [];
      const allDone = job.channels.every((p: string) => doneProviders.includes(p));

      if (allDone) {
        console.log(`[process-queue-delayed] All providers done for job ${job.id}, marking as published`);
        await supabase
          .from('publish_jobs')
          .update({ status: 'published' })
          .eq('id', job.id);
      } else {
        console.log(`[process-queue-delayed] Some providers still pending for job ${job.id}, marking as processing`);
        await supabase
          .from('publish_jobs')
          .update({ status: 'processing' })
          .eq('id', job.id);
      }

      processedCount++;
    }

    console.log(`[process-queue-delayed] Processed ${processedCount} jobs`);

    return new Response(
      JSON.stringify({ 
        processed: processedCount,
        message: `Successfully processed ${processedCount} job(s)`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[process-queue-delayed] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
