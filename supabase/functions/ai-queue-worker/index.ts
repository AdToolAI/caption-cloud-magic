/**
 * AI Queue Worker - Continuous Processing
 * Processes AI jobs from the queue with retry logic and exponential backoff
 * Designed for 1000+ concurrent users
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { trackAIJobEvent } from '../_shared/telemetry.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const BATCH_SIZE = 10; // Process 10 jobs in parallel (Continuous mode optimization)
const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds
const JOB_TIMEOUT_MS = 300000; // 5 minutes max per job
const STALE_JOB_THRESHOLD_MS = 600000; // Reset jobs stuck for >10 minutes
const MAX_RUNTIME_MS = 50000; // 50 seconds max runtime (safety for Supabase timeout)
const SELF_TRIGGER_DELAY_MS = 2000; // 2 seconds delay before self-triggering

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

  const supabase = getSupabaseClient();
  const startTime = Date.now();

  console.log('[Worker] Starting continuous AI job worker at', new Date().toISOString());

  // Reset stale jobs on startup
  await resetStaleJobs(supabase);

  let totalProcessed = 0;
  let iterations = 0;

  // Continuous processing loop with timeout safety
  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    iterations++;
    
    const batchCount = await processJobBatch(supabase);
    totalProcessed += batchCount;
    
    // If no jobs were processed, exit early
    if (batchCount === 0) {
      console.log(`[Worker] No pending jobs found after ${iterations} iterations`);
      break;
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const duration = Date.now() - startTime;
  console.log(`[Worker] Completed ${iterations} iterations in ${duration}ms. Total processed: ${totalProcessed}`);

  // Check for pending jobs and self-trigger if needed
  const { count: pendingCount } = await supabase
    .from('ai_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const shouldSelfTrigger = (pendingCount || 0) > 0;

  if (shouldSelfTrigger) {
    console.log(`[Worker] ${pendingCount} jobs still pending, self-triggering next run...`);
    
    // Asynchronously trigger next run (fire and forget)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    setTimeout(() => {
      fetch(`${supabaseUrl}/functions/v1/ai-queue-worker`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'self' }),
      }).catch(err => console.error('[Worker] Self-trigger failed:', err));
    }, SELF_TRIGGER_DELAY_MS);
  }

  return new Response(
    JSON.stringify({
      processed: totalProcessed,
      iterations,
      duration_ms: duration,
      pending_jobs: pendingCount || 0,
      self_triggered: shouldSelfTrigger,
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

  // Get current concurrent jobs count
  const { count: currentJobs } = await supabase
    .from('ai_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing');

  // Track job started with concurrent jobs count
  await trackAIJobEvent('started', job.id, job.job_type, job.user_id, undefined, currentJobs || 0);

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

    // Get current concurrent jobs count before tracking completion
    const { count: currentJobsEnd } = await supabase
      .from('ai_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing');

    // Track job completed with concurrent jobs count
    await trackAIJobEvent('completed', job.id, job.job_type, job.user_id, {
      duration_ms: duration
    }, currentJobsEnd || 0);

  } catch (error: any) {
    console.error(`[Worker] ✗ Job ${job.id} failed:`, error.message);

    const retryCount = job.retry_count + 1;
    const shouldRetry = retryCount < job.max_retries && error.message !== 'JOB_TIMEOUT';

    // Get current concurrent jobs count for failed tracking
    const { count: currentJobsFailed } = await supabase
      .from('ai_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing');

    // Track job failed with concurrent jobs count
    await trackAIJobEvent('failed', job.id, job.job_type, job.user_id, {
      error_message: error.message,
      retry_count: retryCount,
      will_retry: shouldRetry
    }, currentJobsFailed || 0);

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
  // Special handling for campaign generation (direct processing, no function invoke)
  if (job.job_type === 'campaign') {
    return await processCampaignGeneration(supabase, job);
  }

  // Map other job types to edge functions
  const functionMap: Record<string, string> = {
    'caption': 'generate-caption',
    'hooks': 'generate-hooks',
    'carousel': 'generate-carousel',
    
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

async function processCampaignGeneration(supabase: any, job: AIJob): Promise<any> {
  const { goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language, postTypes, media, userPlan } = job.input_data;

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const platformNames = platforms.join(', ');
  const totalPosts = durationWeeks * postFrequency;
  const postTypesInfo = postTypes 
    ? postTypes.map((pt: any) => `- ${pt.count}x ${pt.type} per week`).join('\n')
    : 'Use a variety of post types';

  const systemPrompt = `You are an experienced social-media strategist creating detailed content campaigns.

Given a campaign goal, topic, duration, target audience, tone, and platform(s), generate a structured content campaign plan.

**CRITICAL: The user has specified exact post types and counts:**
${postTypesInfo}

Return JSON ONLY in this exact structure:
{
  "summary": "Short overview (2-3 sentences) of campaign goal & positioning",
  "weeks": [
    {
      "week_number": 1,
      "theme": "Weekly sub-theme describing focus for this week",
      "posts": [
        {
          "day": "Monday",
          "post_type": "Reel | Carousel | Story | Static Post",
          "title": "Catchy post title or hook idea",
          "caption_outline": "Brief caption concept (2-3 sentences)",
          "hashtags": ["#hashtag1","#hashtag2","#hashtag3"],
          "cta": "Clear call-to-action text",
          "best_time": "Recommended time (e.g., 19:00)"
        }
      ]
    }
  ],
  "hashtag_strategy": "Brief explanation (2-3 sentences) of hashtag approach",
  "posting_tips": ["Actionable tip 1","Actionable tip 2","Actionable tip 3"]
}

Campaign Parameters:
- Goal: ${goal}
- Topic: ${topic}
- Duration: ${durationWeeks} week(s)
- Target Audience: ${audience || 'General audience'}
- Tone: ${tone}
- Platform(s): ${platformNames}
- Post Frequency: ${postFrequency} posts/week (Total: ${totalPosts} posts)

Rules:
1. Create exactly ${durationWeeks} week(s) with ${postFrequency} posts each
2. Distribute posts evenly across the week
3. **IMPORTANT**: Use ONLY the post types specified by the user in the exact counts provided
4. Adapt tone and CTA style to the selected platform(s)
5. Use platform-specific best practices (e.g., Instagram Reels, LinkedIn articles)
6. Keep hashtags relevant and specific (3-5 per post)
7. Each week should have a cohesive theme that builds toward the campaign goal
8. Days should be: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
9. Best times should be realistic (e.g., 09:00, 12:00, 19:00, 21:00)

Language: ${language}`;

  console.log('[Worker] Calling AI for campaign generation...');

  // AI call
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Create a ${durationWeeks}-week campaign for: ${goal}` }
      ],
      tools: [{
        type: "function",
        function: {
          name: "create_campaign",
          description: "Generate a structured social media campaign plan",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string" },
              weeks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    week_number: { type: "integer" },
                    theme: { type: "string" },
                    posts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          day: { type: "string", enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
                          post_type: { type: "string", enum: ["Reel", "Carousel", "Story", "Static Post", "Link Post"] },
                          title: { type: "string" },
                          caption_outline: { type: "string" },
                          hashtags: { type: "array", items: { type: "string" } },
                          cta: { type: "string" },
                          best_time: { type: "string" }
                        },
                        required: ["day", "post_type", "title", "caption_outline", "hashtags", "cta", "best_time"]
                      }
                    }
                  },
                  required: ["week_number", "theme", "posts"]
                }
              },
              hashtag_strategy: { type: "string" },
              posting_tips: { type: "array", items: { type: "string" } }
            },
            required: ["summary", "weeks", "hashtag_strategy", "posting_tips"],
            additionalProperties: false
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "create_campaign" } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Worker] AI API error:', response.status, errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function?.name !== 'create_campaign') {
    throw new Error('No valid tool call in AI response');
  }

  const campaignPlan = JSON.parse(toolCall.function.arguments);

  // Save to database
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      user_id: job.user_id,
      title: `${topic} Campaign`,
      goal,
      topic,
      tone,
      audience,
      duration_weeks: durationWeeks,
      platform: platforms,
      post_frequency: postFrequency,
      summary: campaignPlan.summary,
      ai_json: campaignPlan,
    })
    .select()
    .single();

  if (campaignError) {
    throw new Error(`Failed to save campaign: ${campaignError.message}`);
  }

  // Create campaign posts
  const postsToInsert = [];
  for (const week of campaignPlan.weeks) {
    for (const post of week.posts) {
      postsToInsert.push({
        campaign_id: campaign.id,
        week_number: week.week_number,
        day: post.day,
        post_type: post.post_type,
        title: post.title,
        caption_outline: post.caption_outline,
        hashtags: post.hashtags,
        cta: post.cta,
        best_time: post.best_time,
      });
    }
  }

  await supabase.from('campaign_posts').insert(postsToInsert);

  // Save uploaded media if any
  if (media && media.length > 0) {
    const mediaToInsert = media.map((m: any) => ({
      campaign_id: campaign.id,
      storage_path: m.storage_path,
      public_url: m.public_url,
      media_type: m.media_type,
      file_size_bytes: m.file_size,
      mime_type: m.mime_type,
    }));

    await supabase.from('campaign_media').insert(mediaToInsert);
  }

  console.log('[Worker] Campaign created successfully:', campaign.id);

  return {
    campaign_id: campaign.id,
    title: campaign.title,
    summary: campaignPlan.summary,
    total_posts: postsToInsert.length,
    weeks: campaignPlan.weeks.length
  };
}
