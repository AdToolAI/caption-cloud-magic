import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

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

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const authHeader = req.headers.get('authorization')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { authorization: authHeader }
      }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { logoUrl, primaryColor, secondaryColor, brandDescription, tonePreference, language } = await req.json();

    console.log('Generating brand kit for user:', user.id);

    // Build the AI prompt
    let prompt = `You are a brand designer AI assistant.
Given the following brand information, create a consistent visual identity for social media.

Primary Color: ${primaryColor}
${secondaryColor ? `Secondary Color: ${secondaryColor}` : ''}
Brand Description: ${brandDescription}
${tonePreference ? `Tone Preference: ${tonePreference}` : ''}

${logoUrl ? 'A logo image is provided. Analyze its colors, shapes, and overall style.' : ''}

Output JSON with:
{
  "color_palette": {
    "primary": "#HEX",
    "secondary": "#HEX",
    "accent": "#HEX",
    "neutrals": ["#HEX","#HEX"]
  },
  "font_pairing": {
    "headline": "Font Name (Google Fonts)",
    "body": "Font Name (Google Fonts)"
  },
  "mood": "vibrant | elegant | playful | minimalist | corporate",
  "keywords": ["friendly","professional","trustworthy"],
  "usage_examples": [
    "Use bold headlines with soft background tones",
    "Pair gradients with minimal icons for posts"
  ],
  "ai_comment": "Short explanation why this palette and style fit the brand."
}

Ensure harmony between the logo (if provided) and generated palette.
Language: ${language || 'en'}`;

    // Prepare messages for AI
    const messages: any[] = [
      { role: 'user', content: [] }
    ];

    // Add logo image if provided
    if (logoUrl) {
      messages[0].content.push({
        type: 'image_url',
        image_url: { url: logoUrl }
      });
    }

    // Add text prompt
    messages[0].content.push({
      type: 'text',
      text: prompt
    });

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: messages,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices[0].message.content;

    console.log('AI response:', content);

    // Extract JSON from response
    let brandKit;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        brandKit = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to parse brand kit data');
    }

    // Store in database
    const { data: savedKit, error: saveError } = await supabase
      .from('brand_kits')
      .insert({
        user_id: user.id,
        logo_url: logoUrl,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        color_palette: brandKit.color_palette,
        font_pairing: brandKit.font_pairing,
        mood: brandKit.mood,
        keywords: brandKit.keywords,
        usage_examples: brandKit.usage_examples,
        ai_comment: brandKit.ai_comment
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving brand kit:', saveError);
      throw saveError;
    }

    return new Response(JSON.stringify(savedKit), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in generate-brand-kit:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
