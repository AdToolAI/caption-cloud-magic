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
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      goal: z.string().max(200),
      tone: z.string().max(50),
      businessType: z.string().max(200),
      keywords: z.string().max(500).optional(),
      language: z.string().regex(/^[a-z]{2}$/),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { platform, goal, tone, businessType, keywords, language } = validation.data;
    
    console.log('Generating optimized prompt for:', { platform, goal, tone, businessType, language });

    // Authenticate user
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Build the AI prompt
    const keywordsText = keywords ? ` Include these keywords: ${keywords}.` : '';
    const aiPrompt = `Create an optimized AI prompt for generating social media content that maximizes reach and engagement.
The prompt should be designed for ${platform}, targeting a ${businessType}, with a ${tone} tone of voice, and focused on ${goal}.${keywordsText}
Include platform-specific suggestions (hashtags, hooks, post format, emoji use, and CTA).

Output in JSON format with these exact fields:
{
  "optimizedPrompt": "The full optimized prompt that can be used in a caption generator",
  "explanation": "Why this prompt works for maximum engagement",
  "sampleCaption": "An example caption that would be generated from this prompt"
}

Important: Generate the output in ${language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English'} language.`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Calling Lovable AI...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: aiPrompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Lovable AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    console.log('AI response received');

    // Parse the JSON response
    let parsedResult;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : aiContent;
      parsedResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Failed to parse AI response');
    }

    // Save to database
    const { error: insertError } = await supabaseClient
      .from('prompts')
      .insert({
        user_id: user.id,
        platform,
        goal,
        tone,
        business_type: businessType,
        keywords: keywords || null,
        optimized_prompt: parsedResult.optimizedPrompt,
        explanation: parsedResult.explanation,
        sample_caption: parsedResult.sampleCaption,
      });

    if (insertError) {
      console.error('Error saving prompt:', insertError);
      throw insertError;
    }

    console.log('Prompt saved successfully');

    return new Response(
      JSON.stringify({
        optimizedPrompt: parsedResult.optimizedPrompt,
        explanation: parsedResult.explanation,
        sampleCaption: parsedResult.sampleCaption,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in generate-optimized-prompt:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});