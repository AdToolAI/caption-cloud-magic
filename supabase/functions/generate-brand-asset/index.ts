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

    const { assetType, prompt, style, brandName, primaryColor, secondaryColor } = await req.json();

    console.log('Generating brand asset:', { assetType, prompt, style, brandName });

    // Build specific prompts for each asset type
    let imagePrompt = '';
    
    switch (assetType) {
      case 'logo':
        imagePrompt = `Create a professional, minimalist logo design. ${prompt ? prompt : `A modern logo for "${brandName}"`}. 
Style: ${style || 'Modern and clean'}. 
Requirements: Simple, scalable, works on white and dark backgrounds, transparent background preferred, no text unless specifically requested, iconic symbol design.
Colors: Primary ${primaryColor || '#F5C76A'}, Secondary ${secondaryColor || '#22d3ee'}.
High quality, vector-like appearance, professional brand identity.`;
        break;
        
      case 'favicon':
        imagePrompt = `Create a simple favicon/app icon design. ${prompt ? prompt : `An icon for "${brandName}"`}.
Style: ${style || 'Minimalist'}.
Requirements: Extremely simple, recognizable at 32x32 pixels, single iconic element, no text, bold shapes, high contrast.
Colors: Primary ${primaryColor || '#F5C76A'}.
Square format, clean design that works tiny.`;
        break;
        
      case 'login_background':
        imagePrompt = `Create an abstract, professional background image for a login page. ${prompt ? prompt : `A sophisticated background for "${brandName}"`}.
Style: ${style || 'Dark and elegant with subtle gradients'}.
Requirements: Dark tones (blacks, deep blues, dark purples), abstract geometric or organic patterns, subtle light effects, professional atmosphere, no text, suitable as background.
Accent colors: ${primaryColor || '#F5C76A'} gold highlights, ${secondaryColor || '#22d3ee'} cyan accents.
16:9 aspect ratio, cinematic quality, high resolution appearance.`;
        break;
        
      default:
        imagePrompt = prompt || `A professional design element for ${brandName}`;
    }

    console.log('Generated prompt:', imagePrompt);

    // Call Lovable AI with image generation model
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [{ role: 'user', content: imagePrompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
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
      
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    // Extract image from response
    const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      console.error('No image in AI response:', JSON.stringify(aiData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Failed to generate image. Please try a different prompt.' }),
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
