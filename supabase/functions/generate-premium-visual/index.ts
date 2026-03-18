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
  aspectRatio?: string;
  // ✅ PHASE 2: Brand Colors from 15-Phase Interview
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

// Style-specific prompt templates for Flux 1.1 Pro - Loft-Film Quality
const STYLE_PROMPTS: Record<string, string> = {
  'flat-design': 'professional flat 2D vector illustration for business explainer video, corporate blue and gold color palette (#0066CC #F5C76A #1a365d), simple geometric shapes and icons, abstract human figures as simple silhouettes without faces, clean minimal infographic style exactly like Loft-Film or Kurzgesagt, ONLY solid colors NO gradients NO shadows, business context, NO text NO letters NO numbers NO words in image, ',
  'isometric': 'isometric 2D vector business illustration, simple geometric shapes, bright flat colors (#4A90D9 #F5C76A #22d3ee), technical diagram style, clean lines, professional infographic aesthetic, abstract figures without faces, NO text NO letters NO numbers, ',
  'whiteboard': 'clean whiteboard business illustration, black line art on pure white background, simple stick figures and professional icons, minimal educational diagram style, clean marker drawing, NO text NO letters NO numbers NO words, ',
  'comic': 'clean business cartoon illustration, simplified character design as geometric shapes, bold outlines, flat colors, friendly professional style, NO realistic proportions, abstract circle faces, vector art, NO text NO letters NO numbers, ',
  'corporate': 'professional corporate 2D vector illustration, muted business colors (navy #1a365d, teal #0891b2, gold #F5C76A), simple geometric people as abstract silhouettes, tech infographic style, minimal elegant design, NO photography NO realistic humans NO text NO letters NO numbers, ',
  'modern-3d': 'soft 3D render business illustration, pastel gradient backgrounds, simple geometric abstract characters, glass morphism elements, modern tech aesthetic, abstract shapes, NO realistic faces NO text NO letters NO numbers, ',
  'custom': '', // Will be filled with custom description
};

// Enhanced negative prompt to strictly avoid text generation
// ✅ Updated: Allow contextual text (product names, CTAs), forbid only gibberish/nonsense
const NEGATIVE_PROMPT = 'photorealistic, photography, real human face, portrait, detailed face, hyperrealistic, 3D render, realistic skin, realistic eyes, nsfw, nude, violence, blurry, low quality, watermark, lorem ipsum, gibberish text, random letters, unreadable text, nonsense words, fantasy language, made up pricing, wrong numbers, nature scene, forest, trees, sunset, landscape, QR code, barcode, logo, brand mark, icon overlay, UI element, button, screenshot, phone mockup, laptop screen, website screenshot, app interface, stock photo watermark, shutterstock, getty, istock';

// Function to sanitize prompts and remove forbidden elements
function sanitizePrompt(prompt: string): string {
  // Remove all references to text, prices, numbers
  const forbidden = [
    /preis(?:e|tabelle|vergleich|schild)?/gi,
    /\$?\d+[.,]?\d*\s*(?:€|EUR|USD|\$|euro|dollar)?/gi,
    /text\s*(?:zeigt|sagt|liest|mit|showing|says)/gi,
    /schrift|buchstaben|wörter|letters|words/gi,
    /tabelle|liste|aufzählung|table|list/gi,
    /basic|pro|enterprise|premium|starter/gi,
    /\b(?:zeigt|shows?)\s+["']?[^"',]+["']?/gi,
    /qr[\s-]?code|barcode|scan\s*code/gi,
    /logo|brand\s*mark|trademark/gi,
    /screenshot|mockup|wireframe|ui\s*element/gi,
    /app\s*interface|website\s*design|browser\s*window/gi,
  ];
  
  let cleanPrompt = prompt;
  forbidden.forEach(regex => {
    cleanPrompt = cleanPrompt.replace(regex, '');
  });
  
  // Remove multiple spaces and clean up
  cleanPrompt = cleanPrompt.replace(/\s+/g, ' ').trim();
  
  // Append strict no-text instruction
  return cleanPrompt + ', absolutely NO text NO letters NO numbers NO words in the image, clean visual only';
}

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
    
    // ✅ PHASE 2: Add brand colors from 15-Phase Interview (PRIORITY)
    if (request.brandColors) {
      const { primary, secondary, accent } = request.brandColors;
      prompt += `BRAND COLOR PALETTE: primary accent color ${primary}, secondary background ${secondary}, highlight accent ${accent}, use these exact brand colors throughout, `;
      console.log('✅ Using brand colors:', request.brandColors);
    }
    
    // Add style guide colors if available (fallback)
    if (request.styleGuide && !request.brandColors) {
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
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2,
            prompt_upsampling: true,
          }
        }
      );

      imageUrl = Array.isArray(output) ? output[0] : output as string;
      
    } else {
      // Generate scene visual - sanitize to remove any text/price references
      const cleanDescription = sanitizePrompt(request.sceneDescription || 'professional business scene');
      prompt += cleanDescription;
      prompt += ', high quality, professional business illustration, 16:9 aspect ratio, clean visual without any text';
      
      console.log('Generated scene prompt (sanitized):', prompt);

      // Check if we have a character sheet for consistency via IP-Adapter
      if (request.character?.hasCharacter && request.characterSheetUrl) {
        console.log('🎭 Using Enhanced IP-Adapter with character reference:', request.characterSheetUrl);
        
        // ✅ PHASE 1: Enhanced IP-Adapter Character Consistency
        // Use PhotoMaker with optimized settings for consistent character across scenes
        try {
          // Determine style strength based on scene type
          const sceneType = request.sceneId?.includes('hook') ? 'hook' :
                           request.sceneId?.includes('cta') ? 'cta' : 'default';
          
          // Higher strength = more character fidelity, lower = more style freedom
          const styleStrength = sceneType === 'cta' ? 45 : sceneType === 'hook' ? 40 : 35;
          
          // Enhanced prompt with explicit character instruction
          const characterPrompt = [
            prompt,
            'img',
            'consistent character appearance matching the reference sheet exactly',
            'same face shape, same clothing, same hair style',
            'professional business illustration style',
            'no text, no letters, no numbers',
          ].join(', ');
          
          console.log('🎭 PhotoMaker prompt:', characterPrompt.substring(0, 200));
          console.log('🎭 Style strength:', styleStrength);
          
          const output = await replicate.run(
            "tencentarc/photomaker-style:467d062309da518648ba89d226490e02b8ed09b5abc15026e54e31c5a8cd0769",
            {
              input: {
                prompt: characterPrompt,
                input_image: request.characterSheetUrl,
                style_strength_ratio: styleStrength,
                num_outputs: 1,
                style_name: "Cinematic", // Better for explainer videos
                negative_prompt: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, cropped, low quality, blurry, different face, changed appearance, inconsistent character, deformed",
                guidance_scale: 5, // Higher guidance for more prompt adherence
                num_inference_steps: 50, // More steps for higher quality
              }
            }
          );

          imageUrl = Array.isArray(output) ? output[0] : output as string;
          console.log('✅ PhotoMaker IP-Adapter success:', imageUrl?.substring(0, 100));
        } catch (ipAdapterError) {
          console.error('⚠️ IP-Adapter failed, falling back to Flux with character prompt:', ipAdapterError);
          
          // Enhanced fallback with character-descriptive prompt
          const fallbackPrompt = prompt + 
            `, include character matching this description: ${request.character?.appearance || 'professional business person'}` +
            `, wearing ${request.character?.clothing || 'business attire'}` +
            ', consistent character design, same person throughout';
          
          const output = await replicate.run(
            "black-forest-labs/flux-1.1-pro",
            {
              input: {
                prompt: fallbackPrompt,
                aspect_ratio: request.aspectRatio || '16:9',
                output_format: 'jpg',
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
        // Add strict negative prompt for no text/numbers
        const fullPrompt = prompt + `. CRITICAL: Generate ONLY visual elements, absolutely NO text, NO letters, NO numbers, NO words anywhere in the image. Avoid: ${NEGATIVE_PROMPT}`;
        
        console.log('Final prompt with negative guidance:', fullPrompt.substring(0, 300));
        
        const output = await replicate.run(
          "black-forest-labs/flux-1.1-pro",
          {
            input: {
              prompt: fullPrompt,
              aspect_ratio: request.aspectRatio || '16:9',
              output_format: 'jpg',
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