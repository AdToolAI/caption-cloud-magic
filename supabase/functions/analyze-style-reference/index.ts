import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeStyleRequest {
  imageUrl?: string;
  imageBase64?: string;
  referenceUrls?: string[];
  brandDescription?: string;
}

interface StyleGuide {
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  visualStyle: 'geometric' | 'organic' | 'mixed' | 'minimalist' | 'detailed';
  characterStyle: 'realistic' | 'cartoon' | 'abstract' | 'stylized' | 'flat';
  animationStyle: 'smooth' | 'dynamic' | 'minimal' | 'playful' | 'professional';
  moodDescriptors: string[];
  customStylePrompt: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, imageBase64, referenceUrls, brandDescription } = await req.json() as AnalyzeStyleRequest;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log('Analyzing style reference...');

    // Build content array with images
    const content: any[] = [];
    
    // Add main image if provided
    if (imageUrl) {
      content.push({
        type: 'image_url',
        image_url: { url: imageUrl }
      });
    } else if (imageBase64) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${imageBase64}` }
      });
    }
    
    // Add reference URLs
    if (referenceUrls?.length) {
      for (const url of referenceUrls.slice(0, 3)) {
        content.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    }

    // Add analysis prompt
    const analysisPrompt = `Analyze these reference images for an explainer video style guide. Extract:

1. COLOR PALETTE - Identify the exact hex colors used:
   - Primary color (main brand color)
   - Secondary color (supporting color)
   - Accent color (highlights, CTAs)
   - Background color (dominant background)
   - Text color (main text color)

2. VISUAL STYLE - Classify as one of:
   - geometric (clean lines, shapes, grids)
   - organic (flowing, natural, curved)
   - mixed (combination of geometric and organic)
   - minimalist (simple, lots of whitespace)
   - detailed (complex, textured, rich)

3. CHARACTER STYLE - If characters are present:
   - realistic (photorealistic)
   - cartoon (exaggerated, animated style)
   - abstract (non-representational)
   - stylized (artistic interpretation)
   - flat (2D, flat design)

4. ANIMATION STYLE - Based on the energy and feel:
   - smooth (slow, elegant transitions)
   - dynamic (energetic, fast movements)
   - minimal (subtle, restrained)
   - playful (bouncy, fun)
   - professional (corporate, serious)

5. MOOD DESCRIPTORS - List 5 adjectives describing the mood

6. CUSTOM STYLE PROMPT - Write a detailed prompt (2-3 sentences) for AI image generation that captures this exact style. Include specific details about:
   - Color usage
   - Shape language
   - Lighting style
   - Overall aesthetic

${brandDescription ? `Additional brand context: ${brandDescription}` : ''}

Respond in JSON format:
{
  "colorPalette": {
    "primary": "#...",
    "secondary": "#...",
    "accent": "#...",
    "background": "#...",
    "text": "#..."
  },
  "visualStyle": "...",
  "characterStyle": "...",
  "animationStyle": "...",
  "moodDescriptors": ["...", "...", "...", "...", "..."],
  "customStylePrompt": "..."
}`;

    content.push({ type: 'text', text: analysisPrompt });

    // Call Gemini Vision API
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert visual designer and brand analyst. Analyze images precisely and extract style guides. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    
    // Extract JSON from response
    let styleGuide: StyleGuide;
    try {
      // Try to find JSON in the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        styleGuide = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse style guide, using defaults:', parseError);
      // Return a default style guide
      styleGuide = {
        colorPalette: {
          primary: '#4F46E5',
          secondary: '#7C3AED',
          accent: '#F59E0B',
          background: '#1F2937',
          text: '#FFFFFF'
        },
        visualStyle: 'geometric',
        characterStyle: 'stylized',
        animationStyle: 'smooth',
        moodDescriptors: ['modern', 'professional', 'clean', 'tech-forward', 'trustworthy'],
        customStylePrompt: 'Modern flat design with clean geometric shapes, subtle gradients, and a professional color palette. Minimalist aesthetic with strong visual hierarchy.'
      };
    }

    // Enhance the custom style prompt with extracted colors
    const enhancedPrompt = `${styleGuide.customStylePrompt} Use primary color ${styleGuide.colorPalette.primary}, secondary color ${styleGuide.colorPalette.secondary}, and accent color ${styleGuide.colorPalette.accent}. Style: ${styleGuide.visualStyle} with ${styleGuide.animationStyle} feel.`;

    console.log('Style analysis complete:', styleGuide.visualStyle);

    return new Response(JSON.stringify({
      success: true,
      styleGuide: {
        ...styleGuide,
        customStylePrompt: enhancedPrompt
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Analyze style reference error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
