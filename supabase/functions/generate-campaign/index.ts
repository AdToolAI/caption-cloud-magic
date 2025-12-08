// Synchronous Campaign Generation - v5.0
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

const LOVABLE_API_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function generateCampaignWithAI(inputData: any): Promise<any> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  
  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const { goal, topic, tone, audience, durationWeeks, platforms, postFrequency, language, postTypes } = inputData;

  const systemPrompt = `You are an expert social media strategist. Generate a comprehensive ${durationWeeks}-week campaign plan.
Return ONLY valid JSON with this exact structure:
{
  "title": "Campaign title",
  "summary": "2-3 sentence campaign overview",
  "weeks": [
    {
      "week_number": 1,
      "theme": "Weekly theme",
      "posts": [
        {
          "day": "Monday",
          "post_type": "Reel|Carousel|Story|Static Post|Link Post",
          "title": "Post title",
          "caption_outline": "Full caption text 2-4 sentences",
          "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
          "cta": "Call to action",
          "best_time": "09:00"
        }
      ]
    }
  ],
  "hashtag_strategy": "Strategy description",
  "posting_tips": ["tip1", "tip2", "tip3"]
}`;

  const userPrompt = `Create a ${durationWeeks}-week social media campaign:
- Goal: ${goal}
- Topic: ${topic}
- Tone: ${tone}
- Target Audience: ${audience || 'general'}
- Platforms: ${platforms.join(', ')}
- Posts per week: ${postFrequency}
- Post types: ${postTypes?.map((pt: any) => `${pt.count}x ${pt.type}`).join(', ') || 'Mixed content'}
- Language: ${language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'}

Generate ${postFrequency} posts per week for ${durationWeeks} weeks. Each post should have unique content.`;

  console.log('[generate-campaign] Calling Lovable AI...');

  const response = await fetch(LOVABLE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[generate-campaign] AI API error:', errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in AI response');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content;
  if (content.includes('```json')) {
    jsonStr = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    jsonStr = content.split('```')[1].split('```')[0].trim();
  }

  const campaignData = JSON.parse(jsonStr);
  console.log('[generate-campaign] AI generated campaign:', campaignData.title);

  return campaignData;
}

serve(withTelemetry('generate-campaign', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return withRateLimit(req, async (req, rateLimiter) => {
    try {
      // Use service role client for all operations (bypasses RLS)
      const supabaseClient = getSupabaseClient(true);

      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
      
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userId = user.id;

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
          type: z.enum(['Reel', 'Video', 'Carousel', 'Story', 'Static Post', 'Link Post']),
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

      console.log(`[generate-campaign] Starting synchronous generation for user ${userId}`);

      // Generate campaign with AI
      const aiResult = await generateCampaignWithAI({
        goal,
        topic,
        tone,
        audience,
        durationWeeks,
        platforms,
        postFrequency,
        language,
        postTypes: validation.data.postTypes,
      });

      // Save campaign to database
      const { data: campaign, error: campaignError } = await supabaseClient
        .from('campaigns')
        .insert({
          user_id: userId,
          title: aiResult.title || `${topic} Campaign`,
          goal,
          topic,
          tone,
          audience: audience || '',
          duration_weeks: durationWeeks,
          platform: platforms,
          post_frequency: postFrequency,
          summary: aiResult.summary,
          ai_json: {
            summary: aiResult.summary,
            weeks: aiResult.weeks,
            hashtag_strategy: aiResult.hashtag_strategy,
            posting_tips: aiResult.posting_tips,
          },
        })
        .select()
        .single();

      if (campaignError) {
        console.error('[generate-campaign] Failed to save campaign:', campaignError);
        throw new Error('Failed to save campaign');
      }

      console.log(`[generate-campaign] Campaign saved: ${campaign.id}`);

      // Save campaign posts
      const postsToInsert: any[] = [];
      for (const week of aiResult.weeks) {
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

      if (postsToInsert.length > 0) {
        const { error: postsError } = await supabaseClient
          .from('campaign_posts')
          .insert(postsToInsert);

        if (postsError) {
          console.error('[generate-campaign] Failed to save posts:', postsError);
        } else {
          console.log(`[generate-campaign] Saved ${postsToInsert.length} posts`);
        }
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
          console.error('[generate-campaign] Failed to save media:', mediaError);
        }
      }

      // Track success
      await trackAIJobEvent('completed', campaign.id, 'campaign', userId, {
        goal,
        topic,
        duration_weeks: durationWeeks,
        platforms,
        post_frequency: postFrequency,
        posts_created: postsToInsert.length,
      }).catch(err => console.error('[Telemetry] Failed to track:', err));

      // Return campaign with proper format
      const responseCampaign = {
        id: campaign.id,
        title: campaign.title,
        goal: campaign.goal,
        topic: campaign.topic,
        tone: campaign.tone,
        audience: campaign.audience,
        duration_weeks: campaign.duration_weeks,
        platform: campaign.platform,
        post_frequency: campaign.post_frequency,
        summary: campaign.summary,
        ai_json: campaign.ai_json,
        created_at: campaign.created_at,
      };

      return new Response(
        JSON.stringify({ 
          success: true,
          campaign: responseCampaign,
          posts_created: postsToInsert.length,
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (error: any) {
      console.error('Error in generate-campaign:', error);
      return new Response(
        JSON.stringify({ error: error.message || 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  });
}));
