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
    // Input validation
    const requestSchema = z.object({
      captions: z.array(z.string().min(1).max(10000)).min(1).max(50),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50).optional(),
      language: z.string().regex(/^[a-z]{2}$/).optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { captions, platform, language } = validation.data;

    // Get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const isPro = profile?.plan === 'pro';

    // Check daily limit for free users
    if (!isPro) {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('content_audits')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', `${today}T00:00:00`);

      if (count && count >= 3) {
        return new Response(
          JSON.stringify({ 
            error: 'Daily limit reached',
            message: 'Free users can analyze up to 3 captions per day. Upgrade to Pro for unlimited audits.'
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Prepare AI prompt
    const systemPrompt = `You are an expert social-media strategist and content analyst.
Analyze the given captions based on:
1. Length and readability
2. Emotional tone (e.g., inspiring, funny, educational, neutral)
3. Presence and strength of CTA (call-to-action)
4. Estimated engagement potential (score 0–100 based on language style)
5. Improvement suggestions (specific & actionable)

Return structured JSON ONLY:
{
  "captions": [
    {
      "original_text": "...",
      "word_count": 123,
      "reading_level": "Easy | Medium | Complex",
      "emotion": "Inspiring | Funny | Emotional | Neutral | Informative",
      "cta_strength": "Strong | Weak | Missing",
      "engagement_score": 78,
      "summary": "Short evaluation summary",
      "suggestions": [
        "Add a clear CTA to drive engagement",
        "Shorten sentences for better readability"
      ]
    }
  ],
  "overall_feedback": "3-4 lines summarizing overall strengths & weaknesses",
  "language": "${language || 'en'}"
}

Scoring model:
- base_score = 60
- tone_bonus = +10 if emotional/inspiring
- cta_bonus = +15 if CTA present
- length_penalty = -10 if > 200 words or reading_level = Complex

Language: ${language || 'en'}`;

    const userPrompt = `Platform: ${platform || 'Instagram'}

Captions to analyze:
${captions.map((c: string, i: number) => `\n${i + 1}. ${c}`).join('\n')}`;

    console.log('Calling Lovable AI for audit analysis...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI service requires payment. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI service error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received:', aiContent.substring(0, 200));

    // Parse JSON from AI response
    let auditResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        auditResult = JSON.parse(jsonMatch[0]);
      } else {
        auditResult = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Invalid AI response format');
    }

    // Calculate average score
    const scores = auditResult.captions.map((c: any) => c.engagement_score);
    const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

    // Save to database
    const { data: audit, error: auditError } = await supabase
      .from('content_audits')
      .insert({
        user_id: user.id,
        platform: platform || 'Instagram',
        language: language || 'en',
        source_type: 'manual',
        ai_json: auditResult,
        avg_score: avgScore,
        total_captions: captions.length
      })
      .select()
      .single();

    if (auditError) {
      console.error('Error saving audit:', auditError);
      throw auditError;
    }

    // Save audit items
    const items = auditResult.captions.map((caption: any) => ({
      audit_id: audit.id,
      caption: caption.original_text,
      word_count: caption.word_count,
      reading_level: caption.reading_level,
      emotion: caption.emotion,
      cta_strength: caption.cta_strength,
      engagement_score: caption.engagement_score,
      suggestions: caption.suggestions
    }));

    const { error: itemsError } = await supabase
      .from('content_audit_items')
      .insert(items);

    if (itemsError) {
      console.error('Error saving audit items:', itemsError);
      throw itemsError;
    }

    return new Response(
      JSON.stringify({
        audit_id: audit.id,
        result: auditResult,
        avg_score: avgScore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-audit function:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to analyze content audit' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
