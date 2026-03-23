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
// ✅ Phase 11: Style prompts focus on visual quality — anti-text rules moved to suffix
const STYLE_PROMPTS: Record<string, string> = {
  'flat-design': 'professional flat 2D illustration for business explainer video, clean minimal infographic style like Loft-Film or Kurzgesagt, corporate color palette, simple geometric shapes, empty workspaces and environments without people, warm professional lighting, ',
  'isometric': 'isometric 2D business illustration, bright flat colors, technical diagram style, clean lines, professional infographic aesthetic, empty workplace environments and equipment, ',
  'whiteboard': 'clean whiteboard business illustration, black line art on pure white background, professional icons and objects, minimal educational diagram style, clean marker drawing, no figures, ',
  'comic': 'clean business cartoon illustration, bold outlines, flat colors, friendly professional style, vector art, objects and environments without people, ',
  'corporate': 'professional corporate illustration, muted business colors (navy, teal, gold), empty office settings with furniture and equipment, tech infographic style, minimal elegant design, ',
  'modern-3d': 'soft 3D render business illustration, pastel gradient backgrounds, empty professional environments with modern furniture, glass morphism elements, modern tech aesthetic, warm lighting, ',
  'cinematic': 'cinematic still frame, dramatic volumetric lighting, shallow depth of field, film grain, anamorphic lens flare, moody atmosphere, empty environments and architectural spaces without people, golden hour or blue hour lighting, ',
  'documentary': 'documentary-style illustration, observational naturalistic composition, muted earthy tones, authentic real-world environments, journalistic visual storytelling, empty spaces with objects and architecture, ',
  'minimalist': 'ultra minimalist illustration, vast negative space, single accent color on white or light background, one simple object in focus, zen-like simplicity, clean geometric composition, no clutter, ',
  'bold-colorful': 'bold pop-art illustration, vivid saturated colors, strong graphic shapes, high contrast, energetic visual style, flat bold color blocks, Memphis design influence, abstract shapes and objects, ',
  'vintage-retro': 'retro vintage illustration, warm muted 70s color palette (burnt orange, mustard yellow, avocado green, brown), halftone dot texture, rounded typography aesthetic, nostalgic atmosphere, old-fashioned objects and environments, ',
  'hand-drawn': 'hand-drawn pencil sketch illustration, artistic crosshatching and linework, charcoal and graphite texture, sketchbook aesthetic, visible paper grain, loose artistic drawing style, objects and scenes without people, ',
  'motion-graphics': 'motion graphics key frame, bold geometric shapes, vibrant gradient colors, dynamic composition with implied movement, abstract data visualization shapes, clean vector aesthetic, ',
  'photo-realistic': 'photorealistic scene, natural textures and materials, professional photography lighting, realistic shadows and reflections, high detail environment, architectural photography style, empty spaces without people, ',
  'cartoon': 'bright colorful cartoon illustration, bold black outlines, exaggerated proportions, playful rounded shapes, saturated primary colors, Pixar-inspired environment design, whimsical scene without people, fun and energetic, ',
  'watercolor': 'watercolor painting, soft washes and bleeds, artistic wet-on-wet technique, delicate color transitions, visible brushstrokes, paper texture, ethereal dreamy atmosphere, pastel and muted tones, objects and landscapes, ',
  'neon-cyberpunk': 'cyberpunk neon-lit scene, dark background with glowing neon edges, electric blue and magenta and purple, futuristic technology aesthetic, holographic reflections, rain-slicked surfaces, sci-fi atmosphere, empty futuristic environments, ',
  'paper-cutout': 'paper cut-out craft illustration, layered paper textures with visible shadows between layers, handmade collage aesthetic, torn and cut paper edges, warm craft paper colors, tactile dimensional look, ',
  'clay-3d': 'claymation 3D render, plasticine texture, stop-motion aesthetic, soft rounded shapes, fingerprint impressions on surfaces, warm studio lighting, miniature set design, playful clay characters replaced with clay objects, ',
  'anime': 'anime illustration, cel-shaded flat coloring, vibrant Japanese animation style, detailed background art like Studio Ghibli, dynamic composition, atmospheric lighting, beautiful environment art without characters, ',
  'custom': '', // Will be filled with custom description
};

// Enhanced negative prompt to strictly avoid text generation
// ✅ Updated: Allow contextual text (product names, CTAs), forbid only gibberish/nonsense
const BASE_NEGATIVE_PROMPT = 'photorealistic, photography, real human face, portrait, detailed face, hyperrealistic, 3D render, realistic skin, realistic eyes, human silhouette, person, people, man, woman, figure, human body, nsfw, nude, violence, blurry, low quality, watermark, lorem ipsum, gibberish text, random letters, unreadable text, nonsense words, fantasy language, made up pricing, wrong numbers, numbers, digits, percentages, statistics, data labels, numeric values, dashboard numbers, analytics data, charts with values, nature scene, forest, trees, sunset, landscape, QR code, barcode, logo, brand mark, icon overlay, UI element, button, screenshot, phone mockup, laptop screen, website screenshot, app interface, stock photo watermark, shutterstock, getty, istock';

// Style-specific negative prompts to prevent style contamination
const STYLE_NEGATIVE_ADDITIONS: Record<string, string> = {
  'comic': ', volumetric lighting, film grain, lens flare, shallow depth of field, photorealistic, cinematic, 3D render',
  'cartoon': ', volumetric lighting, film grain, lens flare, shallow depth of field, photorealistic, cinematic, 3D render',
  'anime': ', photorealistic, film grain, western cartoon, 3D render, volumetric lighting',
  'watercolor': ', sharp edges, neon, 3D render, bold outlines, vector art, photorealistic',
  'hand-drawn': ', 3D render, neon, photorealistic, clean vector, smooth gradients',
  'paper-cutout': ', 3D render, photorealistic, smooth gradients, neon',
  'clay-3d': ', flat 2D, pencil sketch, watercolor, vector art',
  'cinematic': ', cartoon, flat colors, bold outlines, vector art, anime, cel-shaded',
  'neon-cyberpunk': ', pastel, watercolor, hand-drawn, vintage, retro, warm tones',
  'vintage-retro': ', neon, cyberpunk, modern 3D, futuristic, holographic',
  'minimalist': ', busy, cluttered, many objects, complex, detailed background',
  'bold-colorful': ', muted, pastel, minimal, monochrome, subdued',
};

function getStyleNegativePrompt(style: string): string {
  return BASE_NEGATIVE_PROMPT + (STYLE_NEGATIVE_ADDITIONS[style] || '');
}

// Style suffix for double-reinforcement at end of prompt
function getStyleSuffix(style: string): string {
  const suffixes: Record<string, string> = {
    'comic': 'MUST be comic book cartoon style with bold outlines and flat cel-shaded colors, NOT photorealistic, NOT cinematic',
    'cartoon': 'MUST be bright colorful cartoon with bold outlines and playful shapes, NOT photorealistic, NOT cinematic',
    'anime': 'MUST be Japanese anime cel-shaded illustration style, NOT photorealistic, NOT western cartoon',
    'watercolor': 'MUST be watercolor painting with soft washes and paper texture, NOT digital, NOT sharp edges',
    'cinematic': 'MUST be cinematic with dramatic lighting and film grain, NOT cartoon, NOT flat design',
    'hand-drawn': 'MUST be hand-drawn pencil sketch with crosshatching, NOT 3D, NOT clean vector',
    'clay-3d': 'MUST be claymation 3D with plasticine texture, NOT flat 2D, NOT sketch',
    'paper-cutout': 'MUST be paper cut-out craft collage with layered paper textures, NOT 3D render',
    'neon-cyberpunk': 'MUST be cyberpunk neon-lit with dark background and electric glow, NOT pastel, NOT vintage',
    'vintage-retro': 'MUST be retro 70s vintage with muted warm tones and halftone dots, NOT modern, NOT neon',
    'documentary': 'MUST be documentary naturalistic style with earthy muted tones',
    'minimalist': 'MUST be ultra minimalist with vast negative space and single focal point',
    'bold-colorful': 'MUST be bold pop-art with vivid saturated colors and high contrast shapes',
    'isometric': 'MUST be isometric 2D business illustration with clean lines and flat colors',
    'whiteboard': 'MUST be whiteboard illustration with black line art on white background',
    'motion-graphics': 'MUST be motion graphics key frame with bold geometric shapes and gradients',
    'photo-realistic': 'MUST be photorealistic with natural textures and professional photography lighting',
    'modern-3d': 'MUST be soft 3D render with pastel gradients and glass morphism elements',
    'flat-design': 'MUST be flat 2D minimal illustration with clean geometric shapes',
    'corporate': 'MUST be professional corporate illustration with muted business colors',
  };
  return suffixes[style] || '';
}

const NEGATIVE_PROMPT = BASE_NEGATIVE_PROMPT;

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
  
  // ✅ Phase 11: Short anti-text suffix instead of dominating the prompt
  return cleanPrompt + ', no text no letters no words in the image, clean visual only';
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
      prompt += ', high quality, professional illustration, clean visual without any text or writing';
      
      // ✅ STYLE DOUBLE-REINFORCEMENT: Repeat style at the end to override scene description dominance
      const styleSuffix = getStyleSuffix(request.style);
      if (styleSuffix) {
        prompt += `, OVERRIDE STYLE: ${styleSuffix}`;
      }
      
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
        // ✅ Phase 15: Anti-gibberish — forbid ALL text AND numbers
        const fullPrompt = `STRICT RULE: This image must contain ZERO text, ZERO letters, ZERO words, ZERO numbers, ZERO digits, ZERO percentages, ZERO labels of any kind. All text, numbers, and data visualizations must be replaced with abstract colored shapes or blank areas. Never generate readable or unreadable content in any language. CRITICAL: Remove ALL human subjects — show ONLY environments, objects, furniture, and equipment. No people, no silhouettes, no hands, no body parts. ` + prompt + `. Avoid: ${NEGATIVE_PROMPT}`;
        
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