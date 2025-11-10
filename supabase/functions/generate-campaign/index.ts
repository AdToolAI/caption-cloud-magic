// Telemetry enabled - Middleware-based tracking - v3.0
// Force deployment trigger
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { withRateLimit } from '../_shared/rate-limiter.ts';
import { aiCircuitBreaker } from '../_shared/circuit-breaker.ts';
import { withTimeoutOrQueue } from '../_shared/timeout.ts';
import { withTelemetry } from '../_shared/telemetry.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';
import { getRedisCache } from '../_shared/redis-cache.ts';

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
      userId = user?.id;
      
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

      // Redis Cache Integration (10 minute TTL for campaign generation)
      const cache = getRedisCache();
      const cacheKey = cache.generateKeyHash('generate-campaign', {
        goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language
      });

      // Check Redis cache first
      const cached = await cache.get(cacheKey, { logHits: true });
      if (cached) {
        console.log(`[generate-campaign] Cache hit for params hash`);
        return new Response(
          JSON.stringify(cached),
          {
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'X-Cache': 'REDIS-HIT'
            },
          }
        );
      }

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

      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        console.error('LOVABLE_API_KEY not configured');
        return new Response(
          JSON.stringify({ error: 'AI service not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const platformNames = platforms.join(', ');
      const totalPosts = durationWeeks * postFrequency;

      const postTypesInfo = validation.data.postTypes 
        ? validation.data.postTypes.map(pt => `- ${pt.count}x ${pt.type} per week`).join('\n')
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

      // Register active AI job
      const jobId = crypto.randomUUID();
      await rateLimiter.registerActiveJob(user.id, null, jobId, 'campaign-generation');

      try {
        // AI call with Circuit Breaker (outer) + Timeout + Queue-Fallback (inner)
        const result = await aiCircuitBreaker.execute(async () => {
          return await withTimeoutOrQueue(
            (async () => {
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
                  response_format: { type: "json_object" }
                }),
              });

              if (!response.ok) {
                if (response.status === 429) {
                  throw new Error('AI_RATE_LIMIT');
                }
                if (response.status === 402) {
                  throw new Error('AI_CREDITS_EXHAUSTED');
                }
                throw new Error(`AI API error: ${response.status}`);
              }

              return await response.json();
            })(),
            30000, // 30s Timeout
            async () => {
              // Queue-Fallback: Save job to database for later processing  
              const { error: queueError } = await supabaseClient.from('ai_jobs').insert({
                id: jobId,
                user_id: userId,
                job_type: 'campaign-generation',
                status: 'queued',
                input_data: { goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language },
              });

              if (queueError) {
                console.error('[Queue] Failed to insert job:', queueError);
                throw new Error(`Failed to queue job: ${queueError.message}`);
              }

              // Track queued event for PostHog
              if (userId) {
                trackAIJobEvent('queued', jobId, 'campaign-generation', userId, {
                  goal,
                  topic,
                  duration_weeks: durationWeeks,
                  platforms,
                  post_frequency: postFrequency
                }).catch(err => console.error('[Telemetry] Failed to track queued event:', err));
              }

              return { queued: true, job_id: jobId };
            }
          );
        });

        // Type guard: Check if job was queued
        if (typeof result === 'object' && result && 'queued' in result && result.queued) {
          await rateLimiter.unregisterActiveJob(jobId);
          return new Response(
            JSON.stringify({ 
              queued: true, 
              job_id: result.job_id,
              message: 'Campaign generation queued due to high load. Check back in a few minutes.' 
            }),
            { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = result;
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
          console.error('No content in AI response');
          await rateLimiter.unregisterActiveJob(jobId);
          return new Response(
            JSON.stringify({ error: 'AI generation failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let campaignPlan;
        try {
          campaignPlan = JSON.parse(content);
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          await rateLimiter.unregisterActiveJob(jobId);
          return new Response(
            JSON.stringify({ error: 'Invalid AI response format' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate structure
        if (!campaignPlan.weeks || !Array.isArray(campaignPlan.weeks)) {
          console.error('Invalid campaign structure:', campaignPlan);
          await rateLimiter.unregisterActiveJob(jobId);
          return new Response(
            JSON.stringify({ error: 'Invalid campaign structure generated' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create campaign in database
        const { data: campaign, error: campaignError } = await supabaseClient
          .from('campaigns')
          .insert({
            user_id: user.id,
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
          console.error('Error creating campaign:', campaignError);
          await rateLimiter.unregisterActiveJob(jobId);
          return new Response(
            JSON.stringify({ error: 'Failed to save campaign' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
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

        const { error: postsError } = await supabaseClient
          .from('campaign_posts')
          .insert(postsToInsert);

        if (postsError) {
          console.error('Error creating posts:', postsError);
          // Continue anyway, campaign was created
        }

        // Save uploaded media if any
        if (validation.data.media && validation.data.media.length > 0) {
          const mediaToInsert = validation.data.media.map(m => ({
            campaign_id: campaign.id,
            storage_path: m.storage_path,
            public_url: m.public_url,
            media_type: m.media_type,
            file_size_bytes: m.file_size,
            mime_type: m.mime_type,
          }));

          const { error: mediaError } = await supabaseClient
            .from('campaign_media')
            .insert(mediaToInsert);

          if (mediaError) {
            console.error('Error saving campaign media:', mediaError);
            // Continue anyway
          }
        }

        // Unregister job on success
        await rateLimiter.unregisterActiveJob(jobId);

        // Compress large responses
        const responseBody = JSON.stringify({
          campaign,
          plan: campaignPlan,
        });
        
        const shouldCompress = responseBody.length > 1024; // Compress if >1KB
        
        return new Response(
          responseBody,
          { 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              ...(shouldCompress && { 'Content-Encoding': 'gzip' })
            } 
          }
        );

      } catch (aiError: any) {
        await rateLimiter.unregisterActiveJob(jobId);
        
        if (aiError.message === 'AI_RATE_LIMIT') {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (aiError.message === 'AI_CREDITS_EXHAUSTED') {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw aiError;
      }

    } catch (error: any) {
      console.error('Error in generate-campaign function:', error);
      
      return new Response(
        JSON.stringify({ error: 'Failed to generate campaign' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  });
}));
