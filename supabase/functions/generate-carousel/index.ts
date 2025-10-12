import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
      text: z.string().min(2).max(2500),
      slideCount: z.number().int().min(5).max(10),
      language: z.string().regex(/^[a-z]{2}$/),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      template: z.string().max(50),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: validation.error.issues }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { text, slideCount, language, platform, template } = validation.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const platformNorms: Record<string, string> = {
      instagram: 'Square or portrait format (1080×1350). Visual-first, emoji-friendly, concise messaging.',
      linkedin: 'Landscape format (1350×1080). Professional tone, data-driven, B2B audience.',
      custom: 'Flexible format. Adapt to general best practices for readability and engagement.'
    };

    const systemPrompt = `You are a social-content presentation designer.
Given raw text and a target slide count, create a carousel outline with concise, high-impact messaging.

Return JSON ONLY in this exact structure:
{
  "slides": [
    {"role":"title","title":"...","bullets":[]},
    {"role":"content","title":"...","bullets":["...","..."]},
    {"role":"cta","title":"...","bullets":["Follow for more","Download guide at..."]}
  ],
  "tone":"${template}",
  "notes":"1-2 lines explaining narrative flow"
}

Rules:
- Create exactly ${slideCount} slides total (including title and CTA).
- Keep headlines punchy (≤ 50 chars).
- Bullets: ≤ 18 words each, 1–3 max per slide.
- Language: ${language}.
- Platform norms: ${platformNorms[platform] || platformNorms.custom}
- First slide should be title slide (role: "title").
- Last slide should be CTA slide (role: "cta") if there are more than 5 slides.
- Middle slides are content slides (role: "content").
- Ensure smooth narrative flow from slide to slide.
- Use emojis sparingly and only where they enhance the message.`;

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
          { role: 'user', content: `Create a ${slideCount}-slide carousel from this text:\n\n${text}` }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid AI response format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the structure
    if (!result.slides || !Array.isArray(result.slides) || result.slides.length !== slideCount) {
      console.error('Invalid slides structure:', result);
      return new Response(
        JSON.stringify({ error: 'Invalid carousel structure generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-carousel function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
