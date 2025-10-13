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

    const requestBody = await req.json();
    const { 
      logoUrl, 
      primaryColor, 
      secondaryColor, 
      brandDescription, 
      tonePreference, 
      targetAudience,
      brandName,
      brandValues,
      language,
      stylePreference
    } = requestBody;

    console.log('Received request:', { brandName, primaryColor, language });

    console.log('Generating brand kit for user:', user.id);

    // Build the AI prompt
    let prompt = `You are a professional brand psychology and design AI assistant.
Given the following brand information, create a comprehensive brand identity for social media that is cohesive, professional, and psychologically effective.

Brand Information:
- Brand Name: ${brandName || 'Unnamed Brand'}
- Target Audience: ${targetAudience || 'General audience'}
- Brand Values: ${brandValues || 'Professional, trustworthy'}
- Primary Color: ${primaryColor}
${secondaryColor ? `- Secondary Color: ${secondaryColor}` : ''}
- Brand Description: ${brandDescription || 'No description provided'}
${tonePreference ? `- Tone Preference: ${tonePreference}` : ''}
${stylePreference ? `- Style Direction: ${stylePreference}` : ''}

${logoUrl ? 'IMPORTANT: A logo image is provided. Carefully analyze its colors, shapes, typography style, and emotional impact. Use these insights to inform your recommendations.' : ''}

Generate a complete brand identity package as JSON with the following structure:
{
  "color_palette": {
    "primary": "${primaryColor}",
    "secondary": "<complementary color in #HEX format>",
    "accent": "<vibrant accent color in #HEX format>",
    "neutrals": ["<light neutral #HEX>", "<dark neutral #HEX>"]
  },
  "font_pairing": {
    "headline": "<Professional Google Font name for headlines>",
    "body": "<Readable Google Font name for body text>"
  },
  "mood": "<choose ONE: vibrant, elegant, playful, minimalist, corporate, luxurious, urban, friendly>",
  "style_direction": "<choose ONE: minimalistic, luxurious, playful, urban, professional, modern, elegant>",
  "brand_tone": "<choose ONE: seriös, frech, inspirierend, professionell, freundlich, mutig, authentisch>",
  "brand_emotions": ["<emotion 1>", "<emotion 2>", "<emotion 3>"],
  "keywords": ["<keyword 1>", "<keyword 2>", "<keyword 3>", "<keyword 4>", "<keyword 5>"],
  "recommended_hashtags": ["#${brandName?.toLowerCase().replace(/\s+/g, '') || 'marke'}", "#<industry>", "#<value1>", "#<value2>", "#<value3>"],
  "emoji_suggestions": ["<emoji 1>", "<emoji 2>", "<emoji 3>", "<emoji 4>"],
  "example_caption": "<Write an authentic 2-3 sentence Instagram caption in German that matches the brand's tone. Include 1-2 emojis naturally.>",
  "usage_examples": [
    "<Specific tip about using colors in posts>",
    "<Specific tip about typography and hierarchy>",
    "<Specific tip about visual style and composition>"
  ],
  "ai_comment": "<2-3 sentences explaining why this brand identity works for the target audience, including color psychology and emotional impact>"
}

CRITICAL RULES:
1. Use ONLY valid #HEX color codes (e.g., #FF5733)
2. Suggest only real Google Fonts that exist
3. Keep all text in ${language === 'de' ? 'German' : 'English'}
4. Make colors harmonious and accessible (good contrast)
5. Ensure the secondary color complements the primary color
6. Return ONLY valid JSON, no markdown or explanations outside JSON
7. Make the example_caption sound natural and authentic, not robotic

${logoUrl ? 'Since a logo is provided, analyze it carefully and let it guide your color and style decisions.' : 'Create a cohesive palette based on the primary color provided.'}

Language: ${language || 'de'}`;

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

    // Call Lovable AI with proper error handling
    console.log('Calling AI with messages:', JSON.stringify(messages).substring(0, 200));
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: messages,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'AI service error', 
          details: errorText,
          status: aiResponse.status 
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI raw response:', JSON.stringify(aiData).substring(0, 500));
    
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in AI response:', aiData);
      return new Response(
        JSON.stringify({ error: 'AI returned empty response' }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('AI content:', content);

    // Extract JSON from response - handle both pure JSON and markdown-wrapped JSON
    let brandKit;
    try {
      // Try to parse directly first
      try {
        brandKit = JSON.parse(content);
      } catch {
        // If that fails, try to extract JSON from markdown
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          brandKit = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in AI response');
        }
      }

      // Validate required fields
      if (!brandKit.color_palette || !brandKit.font_pairing) {
        throw new Error('Missing required fields in brand kit');
      }

      console.log('Parsed brand kit:', JSON.stringify(brandKit));
    } catch (parseError: any) {
      console.error('Failed to parse AI response:', parseError, 'Content:', content);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to parse brand kit data',
          details: parseError.message,
          content: content.substring(0, 500)
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Store in database
    console.log('Saving to database...');
    
    const { data: savedKit, error: saveError } = await supabase
      .from('brand_kits')
      .insert({
        user_id: user.id,
        brand_name: brandName || 'Meine Marke',
        target_audience: targetAudience || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor,
        secondary_color: secondaryColor || null,
        color_palette: brandKit.color_palette,
        font_pairing: brandKit.font_pairing,
        mood: brandKit.mood,
        style_direction: brandKit.style_direction || stylePreference || brandKit.mood,
        brand_tone: brandKit.brand_tone || tonePreference || 'professionell',
        brand_values: brandKit.brand_emotions || (brandValues ? [brandValues] : []),
        brand_emotions: brandKit.brand_emotions || [],
        keywords: brandKit.keywords || [],
        recommended_hashtags: brandKit.recommended_hashtags || [],
        emoji_suggestions: brandKit.emoji_suggestions || [],
        example_caption: brandKit.example_caption || '',
        usage_examples: brandKit.usage_examples || [],
        ai_comment: brandKit.ai_comment || '',
        consistency_score: 100,
        is_active: true
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving brand kit:', saveError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to save brand kit',
          details: saveError.message 
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Successfully saved brand kit:', savedKit.id);

    return new Response(JSON.stringify(savedKit), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in generate-brand-kit:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate brand kit',
        message: error.message,
        stack: error.stack?.substring(0, 500)
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
