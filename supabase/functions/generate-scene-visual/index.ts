import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateVisualRequest {
  sceneId: string;
  visualDescription: string;
  style: string;
  emotionalTone: string;
  keyElements?: string[];
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: GenerateVisualRequest = await req.json();
    const { sceneId, visualDescription, style, emotionalTone, keyElements, aspectRatio = '16:9' } = body;

    if (!visualDescription || !style) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: visualDescription, style' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating visual for scene:', sceneId);
    console.log('Style:', style, '| Tone:', emotionalTone);

    // Build style-specific prompt modifiers
    const stylePrompts: Record<string, string> = {
      'flat-design': 'flat design illustration style, clean geometric shapes, no shadows, vibrant solid colors, minimalist, vector art aesthetic',
      'isometric': 'isometric 3D illustration, technical perspective, detailed environment, clean lines, tech-focused, blueprint-like precision',
      'whiteboard': 'whiteboard hand-drawn sketch style, marker illustration, black outlines with accent colors, educational diagram aesthetic',
      'comic': 'colorful comic book style, expressive characters, dynamic poses, bold outlines, cel-shaded, cartoon aesthetic',
      'corporate': 'professional corporate illustration, muted color palette, business environment, clean and sophisticated, enterprise-grade',
      'modern-3d': 'modern 3D render, glassmorphism effects, gradient backgrounds, premium aesthetic, glossy materials, soft shadows'
    };

    const styleModifier = stylePrompts[style] || stylePrompts['flat-design'];
    
    // Build the comprehensive prompt
    const imagePrompt = `Create an explainer video scene illustration:

SCENE DESCRIPTION: ${visualDescription}

STYLE: ${styleModifier}

MOOD: ${emotionalTone}

${keyElements?.length ? `KEY ELEMENTS TO INCLUDE: ${keyElements.join(', ')}` : ''}

REQUIREMENTS:
- ${aspectRatio} aspect ratio, suitable for video
- Clean, professional composition
- No text or UI elements
- High contrast and visibility
- Suitable for animation overlay
- Consistent with explainer video aesthetics`;

    console.log('Generated prompt:', imagePrompt);

    // Generate image using Gemini vision model
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: imagePrompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Image generation error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Image generation failed: ${errorText}`);
    }

    const data = await response.json();
    console.log('Image generation response received');

    // Extract the generated image
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      console.error('No image in response:', JSON.stringify(data));
      throw new Error('No image generated');
    }

    // Upload base64 image to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract base64 data
    const base64Match = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      // If it's already a URL, return it directly
      return new Response(
        JSON.stringify({
          success: true,
          sceneId,
          imageUrl,
          prompt: imagePrompt
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageFormat = base64Match[1];
    const base64Data = base64Match[2];
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const fileName = `explainer/${sceneId}_${Date.now()}.${imageFormat}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('video-assets')
      .upload(fileName, imageBuffer, {
        contentType: `image/${imageFormat}`,
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      // Return base64 URL as fallback
      return new Response(
        JSON.stringify({
          success: true,
          sceneId,
          imageUrl,
          prompt: imagePrompt
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from('video-assets')
      .getPublicUrl(fileName);

    console.log('Image uploaded successfully:', publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        sceneId,
        imageUrl: publicUrl,
        prompt: imagePrompt
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in generate-scene-visual:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate visual';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
