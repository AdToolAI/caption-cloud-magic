import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Try a single model with retries */
async function tryGenerate(
  model: string,
  messages: any[],
  apiKey: string,
  maxRetries = 3
): Promise<Response | null> {
  let response: Response | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, modalities: ['image', 'text'] }),
    });

    if (response.ok) return response;

    // Non-retryable client errors
    if (response.status === 401 || response.status === 402 || response.status === 400) {
      return response;
    }

    // Retry on 429 / 5xx
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Studio] Retry ${attempt}/${maxRetries} for ${model} after ${delay}ms (status ${response.status})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    break;
  }
  return response;
}

/** Get fallback chain based on quality */
function getFallbackChain(quality: string): string[] {
  if (quality === 'pro') {
    return [
      'google/gemini-3-pro-image-preview',
      'google/gemini-2.5-flash-image',
      'google/gemini-3.1-flash-image-preview',
    ];
  }
  return [
    'google/gemini-2.5-flash-image',
    'google/gemini-3.1-flash-image-preview',
    'google/gemini-3-pro-image-preview',
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, code: 401, step: 'auth', error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ ok: false, code: 401, step: 'auth', error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      return new Response(JSON.stringify({ ok: false, code: 400, step: 'validation', error: 'Prompt is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, code: 500, step: 'config', error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Style modifiers
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

    // Build messages
    const messages: any[] = [];
    if (editMode && referenceImageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: enhancedPrompt },
          { type: 'image_url', image_url: { url: referenceImageUrl } }
        ]
      });
    } else {
      messages.push({ role: 'user', content: enhancedPrompt });
    }

    // Model fallback chain
    const fallbackChain = getFallbackChain(quality);
    let response: Response | null = null;
    let usedModel = '';
    const attemptedModels: string[] = [];

    for (const candidateModel of fallbackChain) {
      attemptedModels.push(candidateModel);
      console.log(`[Studio] Trying model: ${candidateModel}`);
      
      response = await tryGenerate(candidateModel, messages, LOVABLE_API_KEY);
      usedModel = candidateModel;

      if (response?.ok) {
        console.log(`[Studio] Success with model: ${candidateModel}`);
        break;
      }

      // Non-retryable errors: stop immediately
      if (response?.status === 401 || response?.status === 402 || response?.status === 400) {
        break;
      }

      console.log(`[Studio] Model ${candidateModel} failed (${response?.status}), trying next...`);
    }

    if (!response || !response.ok) {
      const status = response?.status || 500;
      let errorText = '';
      try { errorText = await response!.text(); } catch {}
      console.error('[Studio] All models failed:', status, errorText);

      if (status === 429) {
        return new Response(JSON.stringify({ 
          ok: false, code: 429, step: 'ai_generate', 
          error: 'Alle Modelle sind gerade überlastet. Bitte versuche es in 1-2 Minuten erneut.',
          attemptedModels 
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ 
          ok: false, code: 402, step: 'ai_generate', 
          error: 'Credits erschöpft. Bitte lade dein Guthaben auf.',
          attemptedModels 
        }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ 
        ok: false, code: status, step: 'ai_generate', 
        error: `KI-Generierung fehlgeschlagen (${status})`,
        attemptedModels 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiData = await response.json();
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      return new Response(JSON.stringify({ 
        ok: false, code: 500, step: 'parse_result', 
        error: 'Kein Bild generiert. Bitte versuche einen anderen Prompt.',
        attemptedModels 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Detect MIME type
    const mimeMatch = imageData.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';

    const blobResponse = await fetch(imageData);
    const blob = await blobResponse.blob();
    const fileName = `${user.id}/studio/${Date.now()}_${style}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('background-projects')
      .upload(fileName, blob, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error('[Studio] Upload error:', uploadError);
      return new Response(JSON.stringify({ 
        ok: false, code: 500, step: 'storage_upload', 
        error: 'Bild konnte nicht gespeichert werden.' 
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from('background-projects')
      .getPublicUrl(fileName);
    const imageUrl = publicUrlData.publicUrl;

    const { data: savedImage, error: saveError } = await supabase
      .from('studio_images')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        prompt,
        style,
        model_used: usedModel,
        aspect_ratio: aspectRatio,
        source: editMode ? 'upload' : 'generated',
        metadata_json: { quality, editMode, referenceImageUrl: editMode ? referenceImageUrl : null, attemptedModels },
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
        model: usedModel,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Studio] Error:', error);
    return new Response(JSON.stringify({ 
      ok: false, code: 500, step: 'unknown', 
      error: error.message || 'Interner Serverfehler' 
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
