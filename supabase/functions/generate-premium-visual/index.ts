import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PremiumVisualRequest {
  type: 'scene' | 'character-sheet';
  sceneId?: string;
  sceneDescription?: string;
  style: string;
  character?: any;
  characterSheetUrl?: string;
  styleGuide?: any;
  customStyleDescription?: string;
}

// Style-specific prompt templates for Flux 1.1 Pro - Loft-Film Quality
const STYLE_PROMPTS: Record<string, string> = {
  'flat-design': 'flat 2D vector illustration, simple geometric shapes, solid colors only, no gradients, no shadows, clean minimal design, infographic style like Kurzgesagt or Loft-Film, professional business illustration, NO realistic faces, NO photography, NO 3D, ',
  'isometric': 'isometric 2D vector illustration, simple geometric shapes, bright flat colors, technical diagram style, clean lines, infographic aesthetic, NO realistic faces, NO photography, ',
  'whiteboard': 'simple hand-drawn whiteboard sketch, black line art on white background, stick figures and simple icons, minimal doodle style, educational diagram, clean marker drawing, ',
  'comic': 'clean cartoon illustration, simplified character design, bold outlines, flat colors, friendly and approachable style, NO realistic proportions, simple geometric faces, vector art, ',
  'corporate': 'clean corporate 2D vector illustration, muted professional colors (blues, grays, teals), simple geometric people figures without detailed faces, tech infographic style, minimal and elegant, NO photography, NO realistic humans, ',
  'modern-3d': 'soft 3D render illustration, pastel gradient backgrounds, simple geometric characters, glass morphism elements, modern tech aesthetic, abstract shapes, NO realistic faces, ',
  'custom': '', // Will be filled with custom description
};

// Negative prompt to avoid photorealistic/inappropriate content
const NEGATIVE_PROMPT = 'photorealistic, photography, real human face, portrait, detailed face, hyperrealistic, 3D render, realistic skin, realistic eyes, nsfw, nude, violence, blurry, low quality, watermark';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json() as PremiumVisualRequest;
    
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not configured');
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });
    
    console.log('Generating premium visual:', request.type, 'style:', request.style);

    // Build the prompt
    let prompt = '';
    
    // Add style prefix
    if (request.style === 'custom' && request.customStyleDescription) {
      prompt = request.customStyleDescription + ', ';
    } else {
      prompt = STYLE_PROMPTS[request.style] || STYLE_PROMPTS['flat-design'];
    }
    
    // Add style guide colors if available
    if (request.styleGuide) {
      const { primaryColor, secondaryColor, accentColor } = request.styleGuide;
      if (primaryColor) prompt += `primary color ${primaryColor}, `;
      if (secondaryColor) prompt += `secondary color ${secondaryColor}, `;
      if (accentColor) prompt += `accent color ${accentColor}, `;
    }

    let imageUrl: string;

    if (request.type === 'character-sheet') {
      // Generate character reference sheet
      const char = request.character || {};
      const gender = char.gender === 'male' ? 'male' : char.gender === 'female' ? 'female' : 'person';
      const age = char.ageRange === 'child' ? 'young child' : 
                  char.ageRange === 'senior' ? 'elderly person' : 
                  char.ageRange === 'young-adult' ? 'young adult' : 'adult';
      
      prompt += `character reference sheet, ${age} ${gender}, `;
      if (char.appearance) prompt += `${char.appearance}, `;
      if (char.clothing) prompt += `wearing ${char.clothing}, `;
      prompt += 'multiple views (front, side, 3/4), consistent character design, white background, character turnaround sheet';
      
      console.log('Generated character sheet prompt:', prompt);

      // Use Flux 1.1 Pro for character sheets
      const output = await replicate.run(
        "black-forest-labs/flux-1.1-pro",
        {
          input: {
            prompt,
            aspect_ratio: '1:1',
            output_format: 'webp',
            output_quality: 90,
            safety_tolerance: 2,
            prompt_upsampling: true,
          }
        }
      );

      imageUrl = Array.isArray(output) ? output[0] : output as string;
      
    } else {
      // Generate scene visual
      prompt += request.sceneDescription || 'professional business scene';
      prompt += ', high quality, professional illustration, 16:9 aspect ratio';
      
      console.log('Generated scene prompt:', prompt);

      // Check if we have a character sheet for consistency via IP-Adapter
      if (request.character?.hasCharacter && request.characterSheetUrl) {
        console.log('Using IP-Adapter with character reference:', request.characterSheetUrl);
        
        // Use PhotoMaker for character consistency with IP-Adapter
        try {
          const output = await replicate.run(
            "tencentarc/photomaker-style:467d062309da518648ba89d226490e02b8ed09b5abc15026e54e31c5a8cd0769",
            {
              input: {
                prompt: prompt + ", img, consistent character from reference sheet",
                input_image: request.characterSheetUrl,
                style_strength_ratio: 35,
                num_outputs: 1,
                style_name: "Photographic",
                negative_prompt: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, cropped, low quality, blurry",
              }
            }
          );

          imageUrl = Array.isArray(output) ? output[0] : output as string;
          console.log('PhotoMaker IP-Adapter output:', imageUrl);
        } catch (ipAdapterError) {
          console.error('IP-Adapter failed, falling back to Flux:', ipAdapterError);
          
          // Fallback to standard Flux with enhanced prompt
          const output = await replicate.run(
            "black-forest-labs/flux-1.1-pro",
            {
              input: {
                prompt: prompt + ", include consistent character matching reference style",
                aspect_ratio: '16:9',
                output_format: 'webp',
                output_quality: 90,
                safety_tolerance: 2,
                prompt_upsampling: true,
              }
            }
          );

          imageUrl = Array.isArray(output) ? output[0] : output as string;
        }
      } else {
      // Standard Flux 1.1 Pro for scenes without character
        // Add negative prompt guidance to main prompt
        const fullPrompt = prompt + ` Avoid: ${NEGATIVE_PROMPT}`;
        
        const output = await replicate.run(
          "black-forest-labs/flux-1.1-pro",
          {
            input: {
              prompt: fullPrompt,
              aspect_ratio: '16:9',
              output_format: 'webp',
              output_quality: 90,
              safety_tolerance: 2,
              prompt_upsampling: true,
            }
          }
        );

        imageUrl = Array.isArray(output) ? output[0] : output as string;
      }
    }

    console.log('Generated image URL:', imageUrl);
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('No image URL returned from Replicate');
    }

    // Upload to Supabase Storage for persistence
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
      // Download the image
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();
      
      // Upload to storage
      const fileName = `explainer/${request.type}-${Date.now()}.webp`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media-assets')
        .upload(fileName, imageBuffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Return original URL if upload fails
        return new Response(JSON.stringify({
          success: true,
          imageUrl,
          prompt,
          isPremium: true,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media-assets')
        .getPublicUrl(fileName);

      return new Response(JSON.stringify({
        success: true,
        imageUrl: publicUrl,
        originalUrl: imageUrl,
        prompt,
        isPremium: true,
        storageKey: fileName,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (uploadErr) {
      console.error('Storage error:', uploadErr);
      // Return original URL
      return new Response(JSON.stringify({
        success: true,
        imageUrl,
        prompt,
        isPremium: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error) {
    console.error('Generate premium visual error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});