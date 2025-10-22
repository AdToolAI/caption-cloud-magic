import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== GENERATE-BRAND-KIT START ===');
  console.log('Request method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const authHeader = req.headers.get('authorization');

    console.log('Auth header present:', !!authHeader);

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error', details: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authHeader) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract and validate user ID from JWT token
    let userId: string;
    try {
      const token = authHeader.replace('Bearer ', '');
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub;
      
      console.log('Extracted user ID from token:', userId);
      
      if (!userId) {
        throw new Error('No user ID in token');
      }
    } catch (error) {
      console.error('Token parsing error:', error);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log('Request body received:', JSON.stringify(requestBody).substring(0, 300));
    console.log('Processing for user:', userId, '| Brand:', brandName, '| Color:', primaryColor);

    // Build comprehensive AI prompt
    console.log('Building AI prompt...');
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

    // Call Lovable AI
    console.log('Sending request to Lovable AI...');
    console.log('Messages structure:', JSON.stringify(messages).substring(0, 300));
    
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
          error: 'AI-Fehler', 
          details: `Status ${aiResponse.status}`,
          context: { error: errorText, status: aiResponse.status }
        }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI response received, parsing...');
    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('Empty AI response:', aiData);
      return new Response(
        JSON.stringify({ 
          error: 'AI lieferte keine Antwort',
          details: 'Leere Antwort von AI',
          context: { aiData: JSON.stringify(aiData).substring(0, 200) }
        }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI content length:', content?.length || 0);

    // Parse AI response with improved error handling
    let brandKit;
    try {
      console.log('Attempting direct JSON parse...');
      brandKit = JSON.parse(content);
      console.log('Direct JSON parse successful');
    } catch (e: any) {
      console.log('Direct JSON parse failed, trying to extract from markdown...');
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        console.log('Found JSON in markdown, parsing...');
        brandKit = JSON.parse(jsonMatch[1]);
        console.log('Markdown JSON parse successful');
      } else {
        console.error('Failed to parse AI response. Content preview:', content.substring(0, 500));
        return new Response(
          JSON.stringify({ 
            error: 'AI-Antwort konnte nicht verarbeitet werden',
            details: 'Ungültiges JSON-Format',
            context: { preview: content.substring(0, 200), parseError: e?.message || String(e) }
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Brand kit parsed successfully:', Object.keys(brandKit));

    // Validate and prepare data with fallbacks
    console.log('Validating brand kit data...');
    const insertData = {
      user_id: userId,
      brand_name: brandName || 'Meine Marke',
      target_audience: targetAudience || null,
      logo_url: logoUrl || null,
      primary_color: primaryColor || '#6366F1',
      secondary_color: secondaryColor || null,
      color_palette: brandKit.color_palette || { 
        primary: primaryColor, 
        secondary: secondaryColor || '#000000', 
        accent: '#6366F1', 
        neutrals: ['#F3F4F6', '#1F2937'] 
      },
      font_pairing: brandKit.font_pairing || { 
        headline: 'Montserrat', 
        body: 'Open Sans' 
      },
      mood: brandKit.mood || 'professionell',
      style_direction: brandKit.style_direction || stylePreference || 'modern',
      brand_tone: brandKit.brand_tone || tonePreference || 'professionell',
      brand_values: Array.isArray(brandKit.brand_emotions) ? brandKit.brand_emotions : [],
      brand_emotions: Array.isArray(brandKit.brand_emotions) ? brandKit.brand_emotions : [],
      keywords: Array.isArray(brandKit.keywords) ? brandKit.keywords : [],
      recommended_hashtags: Array.isArray(brandKit.recommended_hashtags) ? brandKit.recommended_hashtags : [],
      emoji_suggestions: Array.isArray(brandKit.emoji_suggestions) ? brandKit.emoji_suggestions : [],
      example_caption: brandKit.example_caption || '',
      usage_examples: Array.isArray(brandKit.usage_examples) ? brandKit.usage_examples : [],
      ai_comment: brandKit.ai_comment || '',
      consistency_score: 100,
      is_active: true
    };

    console.log('Inserting brand kit into database...');
    console.log('Insert data keys:', Object.keys(insertData));

    const { data: savedKit, error: saveError } = await supabase
      .from('brand_kits')
      .insert(insertData)
      .select()
      .single();

    if (saveError) {
      console.error('Database insertion error:', saveError);
      console.error('Error details:', JSON.stringify(saveError, null, 2));
      return new Response(
        JSON.stringify({ 
          error: 'Fehler beim Speichern',
          details: saveError.message,
          context: { dbError: saveError.details, hint: saveError.hint, code: saveError.code }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Brand kit created successfully:', savedKit.id);
    console.log('=== GENERATE-BRAND-KIT END (SUCCESS) ===');

    return new Response(JSON.stringify(savedKit), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('=== GENERATE-BRAND-KIT ERROR ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unbekannter Fehler',
        details: error.toString(),
        context: { 
          name: error.name,
          stack: error.stack?.split('\n')[0]
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
