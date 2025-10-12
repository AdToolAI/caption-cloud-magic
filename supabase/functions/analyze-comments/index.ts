import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Input validation
    const requestSchema = z.object({
      comments: z.array(z.object({
        comment_text: z.string().min(1).max(5000),
        username: z.string().min(1).max(100),
        platform: z.string().max(50).optional(),
        post_id: z.string().max(255).optional(),
        timestamp: z.string().optional(),
      })).min(1).max(100),
      brand_tone: z.string().max(50).optional().default('friendly'),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: validation.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { comments, brand_tone, platform, language } = validation.data;

    console.log('Analyzing comments:', { count: comments.length, platform, brand_tone });

    // Check user plan and daily limit
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const isPro = profile?.plan === 'pro';

    // Check daily usage for free users
    if (!isPro) {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today);

      if (count && count >= 20) {
        return new Response(JSON.stringify({ 
          error: 'Daily limit reached',
          message: 'Free plan allows 20 comments per day. Upgrade to Pro for unlimited access.'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch brand voice if exists
    let brandContext = '';
    const { data: brandVoice } = await supabase
      .from('brand_voice')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (brandVoice) {
      brandContext = `\nBrand Voice Context:
- Tone: ${brandVoice.tone}
- Keywords: ${brandVoice.keywords || 'N/A'}
- Tagline: ${brandVoice.tagline || 'N/A'}`;
    }

    const analyzedComments = [];

    for (const comment of comments) {
      const systemPrompt = `You are a brand-aware social-media assistant.
Given a user comment, analyze its tone and generate three concise, on-brand reply options.

Return JSON ONLY with this exact structure:
{
  "comment_text": "...",
  "tone": "positive|negative|neutral|question",
  "sentiment_score": 0.5,
  "intent": "feedback|inquiry|support|appreciation|criticism|spam",
  "replies": {
     "friendly": "...",
     "professional": "...",
     "playful": "..."
  },
  "ai_summary": "1-sentence rationale why these replies fit the comment."
}

Rules:
- Replies must sound natural for ${platform}
- Max length: 200 characters per reply
- Respect emotional context (avoid sarcasm for negative feedback)
- Encourage authentic engagement
- Use ${language} language
- Sentiment score: -1.0 (very negative) to +1.0 (very positive)${brandContext}`;

      const userPrompt = `Comment: "${comment.comment_text}"
Platform: ${platform}
Brand Tone: ${brand_tone}

Analyze this comment and generate three reply options.`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResponse.ok) {
        console.error('AI API error for comment:', comment.comment_text.slice(0, 50));
        continue;
      }

      const aiData = await aiResponse.json();
      const analysis = JSON.parse(aiData.choices[0].message.content);

      // Save to database
      const { data: savedComment, error: saveError } = await supabase
        .from('comments')
        .insert({
          user_id: user.id,
          platform: comment.platform || platform,
          post_id: comment.post_id,
          username: comment.username,
          comment_text: comment.comment_text,
          sentiment: analysis.tone,
          sentiment_score: analysis.sentiment_score,
          intent: analysis.intent,
          ai_replies: analysis.replies,
          timestamp: comment.timestamp,
        })
        .select()
        .single();

      if (saveError) {
        console.error('Error saving comment:', saveError);
        continue;
      }

      analyzedComments.push({
        ...savedComment,
        ai_summary: analysis.ai_summary,
      });
    }

    console.log('Analysis complete:', analyzedComments.length);

    return new Response(JSON.stringify({ 
      analyzed: analyzedComments,
      count: analyzedComments.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-comments:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
