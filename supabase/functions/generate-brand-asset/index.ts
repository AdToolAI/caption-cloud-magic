import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== GENERATE-BRAND-ASSET START ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { assetType, prompt, style, brandName, primaryColor, secondaryColor, backgroundColor } = await req.json();

    console.log('Generating brand asset:', { assetType, prompt, style, brandName, backgroundColor });

    // Build specific prompts for each asset type
    let imagePrompt = '';
    
    switch (assetType) {
      case 'logo':
        imagePrompt = `Create a professional, minimalist logo design. ${prompt ? prompt : `A modern logo for "${brandName}"`}. 
Style: ${style || 'Modern and clean'}. 
Background: Clean solid ${backgroundColor || '#050816'} colored background filling the entire image.
Requirements: Simple, scalable, iconic symbol design, no text unless specifically requested.
CRITICAL: Do NOT add any decorative frame, border, box, or container around the logo. The logo must be placed on a clean solid background with NO surrounding elements, NO frames, NO borders.
Colors: Primary ${primaryColor || '#F5C76A'}, Secondary ${secondaryColor || '#22d3ee'}.
High quality, vector-like appearance, professional brand identity.`;
        break;
        
      case 'favicon':
        imagePrompt = `Create a simple favicon/app icon design. ${prompt ? prompt : `An icon for "${brandName}"`}.
Style: ${style || 'Minimalist'}.
Requirements: Extremely simple, recognizable at 32x32 pixels, single iconic element, no text, bold shapes, high contrast.
Colors: Primary ${primaryColor || '#F5C76A'}, Background ${backgroundColor || '#050816'}.
Square format, clean design that works tiny.`;
        break;
        
      case 'login_background':
        imagePrompt = `Create an abstract, professional background image for a login page. ${prompt ? prompt : `A sophisticated background for "${brandName}"`}.
Style: ${style || 'Dark and elegant with subtle gradients'}.
Requirements: Abstract geometric or organic patterns, subtle light effects, professional atmosphere, no text, suitable as background.
Base background color: ${backgroundColor || '#050816'}.
Accent colors: ${primaryColor || '#F5C76A'} gold highlights, ${secondaryColor || '#22d3ee'} cyan accents.
16:9 aspect ratio, cinematic quality, high resolution appearance.`;
        break;
        
      default:
        imagePrompt = prompt || `A professional design element for ${brandName}`;
    }

    // Add explicit image generation instruction
    const finalPrompt = `IMPORTANT: You MUST generate an actual image file, not just describe it. Create a visual image based on: ${imagePrompt}`;
    
    console.log('Generated prompt:', finalPrompt);

    // Retry logic - up to 3 attempts
    let imageData: string | undefined;
    let lastError: string | undefined;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`Generation attempt ${attempt}/${maxRetries}`);
      
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: [{ role: 'user', content: finalPrompt }],
          modalities: ['image'],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`AI API error (attempt ${attempt}):`, aiResponse.status, errorText);
        
        if (aiResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (aiResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        lastError = `AI API error: ${aiResponse.status}`;
        continue;
      }

      const aiData = await aiResponse.json();
      console.log(`AI response received (attempt ${attempt})`);

      // Extract image from response
      imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      
      if (imageData) {
        console.log(`Image generated successfully on attempt ${attempt}`);
        break;
      } else {
        console.warn(`No image in response (attempt ${attempt}):`, JSON.stringify(aiData).substring(0, 300));
        lastError = 'Model returned text instead of image';
      }
    }
    
    if (!imageData) {
      console.error('Failed to generate image after all retries:', lastError);
      return new Response(
        JSON.stringify({ error: 'Bildgenerierung fehlgeschlagen. Bitte versuche es mit einem anderen Prompt.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload to Supabase Storage
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Convert base64 to blob
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const fileName = `${assetType}_${Date.now()}.png`;
    const storagePath = `brand-assets/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('brand-logos')
      .upload(storagePath, imageBytes, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      // Return base64 as fallback
      return new Response(
        JSON.stringify({ 
          imageUrl: imageData,
          isBase64: true,
          message: 'Image generated (storage upload failed)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('brand-logos')
      .getPublicUrl(storagePath);

    console.log('=== GENERATE-BRAND-ASSET END (SUCCESS) ===');

    return new Response(
      JSON.stringify({ 
        imageUrl: publicUrl,
        storagePath,
        assetType 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('=== GENERATE-BRAND-ASSET ERROR ===');
    console.error('Error:', error.message);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Generation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
