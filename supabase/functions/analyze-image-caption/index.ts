import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
      imageUrl: z.string().url().max(2000),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
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

    const { imageUrl, platform, language } = validation.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing image:', imageUrl);

    // Step 1: Analyze image with vision model
    const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: [
              {
                type: 'text',
                text: `Analyze this image and provide a detailed description. Identify:
- Main objects and subjects
- Scene type (indoor/outdoor, food, travel, fashion, etc.)
- Mood or emotion conveyed
- Notable colors and composition
- Overall theme

Return ONLY a JSON object with this structure:
{
  "description": "detailed description",
  "objects": ["object1", "object2"],
  "emotion": "emotion word",
  "theme": "theme description",
  "scene_type": "scene type"
}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ]
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', visionResponse.status, errorText);
      
      if (visionResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (visionResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your account.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Vision API failed: ${errorText}`);
    }

    const visionData = await visionResponse.json();
    console.log('Vision analysis response:', JSON.stringify(visionData));

    const visionText = visionData.choices?.[0]?.message?.content || '';
    
    // Extract JSON from the response
    const jsonMatch = visionText.match(/\{[\s\S]*\}/);
    const imageAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      description: visionText,
      objects: [],
      emotion: 'neutral',
      theme: 'general',
      scene_type: 'unknown'
    };

    console.log('Image analysis:', imageAnalysis);

    // Step 2: Generate captions based on image analysis
    const captionPrompt = `You are a social-media copywriting assistant specialized in visual storytelling.

Image Analysis:
- Description: ${imageAnalysis.description}
- Objects: ${imageAnalysis.objects?.join(', ') || 'N/A'}
- Emotion: ${imageAnalysis.emotion || 'neutral'}
- Theme: ${imageAnalysis.theme || 'general'}
- Scene: ${imageAnalysis.scene_type || 'unknown'}

Platform: ${platform}
Language: ${language}

Create 5 captions that fit the scene and platform style. Each caption should:
- Reflect the image's emotion and theme
- Include subtle storytelling or lifestyle flair
- Add 3-5 relevant hashtags at the end
- Be under 250 characters for Instagram/TikTok, or under 300 for LinkedIn

Return ONLY a JSON object:
{
  "captions": [
    {"style":"Emotional","text":"caption with hashtags"},
    {"style":"Funny","text":"caption with hashtags"},
    {"style":"Minimal","text":"caption with hashtags"},
    {"style":"Storytelling","text":"caption with hashtags"},
    {"style":"Engagement","text":"caption with hashtags"}
  ]
}`;

    const captionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: captionPrompt }
        ]
      }),
    });

    if (!captionResponse.ok) {
      const errorText = await captionResponse.text();
      console.error('Caption API error:', captionResponse.status, errorText);
      throw new Error(`Caption API failed: ${errorText}`);
    }

    const captionData = await captionResponse.json();
    const captionText = captionData.choices?.[0]?.message?.content || '';
    
    // Extract JSON from the response
    const captionJsonMatch = captionText.match(/\{[\s\S]*\}/);
    const captionsResult = captionJsonMatch ? JSON.parse(captionJsonMatch[0]) : { captions: [] };

    console.log('Generated captions:', captionsResult);

    // Extract hashtags from all captions
    const allHashtags = new Set<string>();
    captionsResult.captions?.forEach((caption: any) => {
      const hashtags = caption.text.match(/#\w+/g) || [];
      hashtags.forEach((tag: string) => allHashtags.add(tag));
    });

    return new Response(
      JSON.stringify({
        description: imageAnalysis.description,
        analysis: imageAnalysis,
        captions: captionsResult.captions || [],
        hashtags: Array.from(allHashtags)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-image-caption:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to analyze image captions' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});