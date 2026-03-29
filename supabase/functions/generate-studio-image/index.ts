import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      prompt,
      style = 'realistic',
      aspectRatio = '1:1',
      quality = 'fast',
      referenceImageUrl,
      editMode = false,
    } = await req.json();

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Style modifiers for prompt enhancement
    const styleModifiers: Record<string, string> = {
      realistic: 'photorealistic, 8k, ultra-detailed, natural lighting, professional photography',
      cinematic: 'cinematic composition, dramatic lighting, anamorphic lens flare, movie still, color graded',
      watercolor: 'delicate watercolor painting, soft washes, paper texture, artistic brushstrokes',
      'neon-cyberpunk': 'neon-lit cyberpunk, vibrant glowing lights, futuristic cityscape, synthwave colors',
      anime: 'anime art style, cel-shaded, vibrant colors, Studio Ghibli inspired',
      'oil-painting': 'classical oil painting, rich textures, impasto technique, museum quality',
      'pop-art': 'pop art style, bold colors, halftone dots, Andy Warhol inspired',
      minimalist: 'minimalist design, clean lines, negative space, simple elegant composition',
      vintage: 'vintage photograph, film grain, sepia tones, retro 1970s aesthetic',
      fantasy: 'epic fantasy art, magical atmosphere, ethereal lighting, detailed world-building',
      'product-photo': 'professional product photography, studio lighting, clean background, commercial quality',
      abstract: 'abstract art, geometric shapes, bold color palette, contemporary art',
      sketch: 'detailed pencil sketch, cross-hatching, hand-drawn illustration',
      '3d-render': '3D rendered, octane render, volumetric lighting, subsurface scattering',
      noir: 'film noir style, high contrast black and white, dramatic shadows, moody atmosphere',
      pastel: 'soft pastel colors, dreamy atmosphere, gentle lighting, ethereal mood',
      comic: 'comic book art style, bold outlines, vibrant panel art, dynamic composition',
      surreal: 'surrealist art, dreamlike imagery, impossible geometry, Salvador Dalí inspired',
      architectural: 'architectural visualization, clean lines, modern design, dramatic perspective',
      editorial: 'editorial fashion photography, high-end magazine style, bold composition',
    };

    // Special handling for brand-logo
    const isBrandLogo = style === 'brand-logo';
    let enhancedPrompt: string;

    if (isBrandLogo) {
      enhancedPrompt = `Create ONLY a flat, 2D logo design. The logo must fill 70-90% of the image area and be perfectly centered.

SUBJECT: ${prompt}

MANDATORY RULES:
- Output ONLY the logo/logomark/wordmark itself
- The logo must be a clean, flat, vector-style graphic
- Use bold, simple, iconic shapes with clear negative space
- NO background elements, NO gradients behind the logo
- NO mockups, NO products, NO cameras, NO tables, NO scenes
- NO 3D rendering, NO photographic elements, NO realistic textures
- NO business cards, NO letterheads, NO branding collateral
- NO decorative frames or borders around the logo
- Place the logo on a plain solid white background (#FFFFFF)
- The logo should look like it was designed in Adobe Illustrator
- Professional corporate identity quality, scalable design
- Aspect ratio: ${aspectRatio}`;
    } else {
      const stylePrompt = styleModifiers[style] || styleModifiers.realistic;
      enhancedPrompt = `${prompt}. Style: ${stylePrompt}. Aspect ratio: ${aspectRatio}.`;
    }

    // Select model based on quality
    const model = quality === 'pro' 
      ? 'google/gemini-3-pro-image-preview' 
      : 'google/gemini-3.1-flash-image-preview';

    console.log(`[Studio] Generating image: model=${model}, style=${style}, ratio=${aspectRatio}`);

    // Build messages
    const messages: any[] = [];
    
    if (editMode && referenceImageUrl) {
      // Image-to-Image editing
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: enhancedPrompt },
          { type: 'image_url', image_url: { url: referenceImageUrl } }
        ]
      });
    } else {
      // Text-to-Image
      messages.push({
        role: 'user',
        content: enhancedPrompt
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Studio] AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error('No image generated');
    }

    // Detect MIME type and extension from base64 data URL
    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';

    // Robust Base64 decoding: strip header, clean whitespace, decode via Deno standard library
    const commaIdx = imageData.indexOf(',');
    const rawBase64 = commaIdx !== -1 ? imageData.substring(commaIdx + 1) : imageData;
    const cleanBase64 = rawBase64.replace(/\s/g, '');
    
    // Use Deno's built-in base64 decoding for reliable binary conversion
    const { decodeBase64 } = await import("https://deno.land/std@0.224.0/encoding/base64.ts");
    const binaryData = decodeBase64(cleanBase64);
    const fileName = `${user.id}/studio/${Date.now()}_${style}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('background-projects')
      .upload(fileName, binaryData, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('[Studio] Upload error:', uploadError);
      throw new Error('Failed to upload image');
    }

    const { data: publicUrlData } = supabase.storage
      .from('background-projects')
      .getPublicUrl(fileName);

    const imageUrl = publicUrlData.publicUrl;

    // Save to studio_images table
    const { data: savedImage, error: saveError } = await supabase
      .from('studio_images')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        prompt,
        style,
        model_used: model,
        aspect_ratio: aspectRatio,
        source: editMode ? 'upload' : 'generated',
        metadata_json: { quality, editMode, referenceImageUrl: editMode ? referenceImageUrl : null },
      })
      .select()
      .single();

    if (saveError) {
      console.error('[Studio] Save error:', saveError);
    }

    return new Response(JSON.stringify({
      success: true,
      image: {
        id: savedImage?.id,
        url: imageUrl,
        previewUrl: imageData,
        prompt,
        style,
        aspectRatio,
        model,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Studio] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
