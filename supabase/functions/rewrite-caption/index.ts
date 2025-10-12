import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
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
    // Input validation
    const requestSchema = z.object({
      text: z.string().min(1).max(10000),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      language: z.string().regex(/^[a-z]{2}$/),
      rewriteGoal: z.enum(['viral', 'emotional', 'professional', 'simplify']),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { text, platform, language, rewriteGoal } = validation.data;
    console.log('Rewrite request:', { platform, language, rewriteGoal, textLength: text?.length });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError);
      throw new Error('Unauthorized');
    }

    // Check user plan and usage
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const today = new Date().toISOString().split('T')[0];
    
    if (profile?.plan === 'free') {
      // Check rewrites count for today
      const { data: rewrites } = await supabase
        .from('rewrites_history')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lte('created_at', `${today}T23:59:59.999Z`);

      if (rewrites && rewrites.length >= 3) {
        return new Response(
          JSON.stringify({ 
            error: 'Daily limit reached. Upgrade to Pro for unlimited rewrites.',
            limit_reached: true 
          }),
          { 
            status: 429, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    const goalDescriptions: Record<string, string> = {
      viral: 'Make it more viral and shareable with emotional hooks and curiosity gaps',
      emotional: 'Make it more emotional and relatable, connecting deeply with the audience',
      professional: 'Make it more professional and polished, suitable for business contexts',
      simplify: 'Simplify for clarity, making the message easy to understand at a glance'
    };

    const systemPrompt = `You are a senior social-media copywriter.
Rewrite existing captions to improve structure, tone, clarity, and engagement potential.
Follow the user's goal precisely.
Keep the rewrite concise (no more than 20% longer than the original).
Match the writing style of ${platform} and remove irrelevant hashtags.
Return ONLY valid JSON in this exact format:
{
  "rewritten": "optimized caption text",
  "explanation": "2-3 bullet points explaining improvements (tone, hook, engagement)",
  "suggestions": ["optional extra ideas for improvement"]
}
Language: ${language}
Platform: ${platform}
Goal: ${goalDescriptions[rewriteGoal] || rewriteGoal}`;

    const userPrompt = `Original caption:
${text}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    let aiResponse;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      console.log(`AI request attempt ${attempts}`);

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
            { role: 'user', content: userPrompt }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (attempts === maxAttempts) {
          throw new Error('AI service error');
        }
        continue;
      }

      const data = await response.json();
      const generatedText = data.choices[0].message.content;

      try {
        // Try to extract JSON from the response
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
          break;
        }
        throw new Error('No JSON found in response');
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        if (attempts === maxAttempts) {
          return new Response(
            JSON.stringify({ 
              error: 'The AI couldn\'t rewrite this caption – please shorten or clarify it.' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Save to database
    const { error: insertError } = await supabase
      .from('rewrites_history')
      .insert({
        user_id: user.id,
        platform,
        rewrite_goal: rewriteGoal,
        original_text: text,
        rewritten_text: aiResponse.rewritten,
        language,
        explanation: aiResponse.explanation
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
    }

    return new Response(
      JSON.stringify(aiResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in rewrite-caption function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to rewrite caption' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});