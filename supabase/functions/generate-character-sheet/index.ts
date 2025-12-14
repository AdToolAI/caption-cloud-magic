import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { gender, ageRange, appearance, clothing, style } = await req.json();

    // Map style to visual description
    const styleDescriptions: Record<string, string> = {
      'flat-design': 'flat design style, simple geometric shapes, no shadows, vibrant solid colors, vector art',
      'isometric': 'isometric 3D illustration, clean geometric shapes, professional look, subtle shadows',
      'whiteboard': 'hand-drawn whiteboard sketch style, black marker on white, simple line art',
      'comic': 'cartoon comic book style, bold outlines, expressive features, dynamic poses',
      'corporate': 'professional corporate illustration, muted colors, business appropriate, clean lines',
      'modern-3d': 'modern 3D rendered character, soft lighting, glassmorphism elements, gradient colors'
    };

    const styleDesc = styleDescriptions[style] || styleDescriptions['flat-design'];

    // Build character description
    const genderDesc = gender === 'female' ? 'female character' : gender === 'male' ? 'male character' : 'gender-neutral character';
    
    const ageDescriptions: Record<string, string> = {
      'child': 'young child (6-12 years old)',
      'young-adult': 'young adult (18-30 years old)',
      'adult': 'adult (30-50 years old)',
      'senior': 'senior adult (50+ years old)'
    };
    const ageDesc = ageDescriptions[ageRange as string] || 'adult';

    const prompt = `Create a character reference sheet for an explainer video featuring a ${genderDesc}, ${ageDesc}.
${appearance ? `Physical appearance: ${appearance}` : ''}
${clothing ? `Clothing: ${clothing}` : ''}

Style: ${styleDesc}

The character sheet should show:
- Front view (main, larger)
- Side profile view (smaller)
- A few expression variations (happy, neutral, explaining)

The character should look friendly, approachable, and professional. 
Maintain perfect consistency across all views.
White or light gray clean background.
High quality, suitable for animation reference.`;

    console.log('Generating character sheet with prompt:', prompt.slice(0, 200));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          { role: 'user', content: prompt }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract image from response
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageData) {
      throw new Error('No image generated');
    }

    // Generate a consistent style seed for this character
    const styleSeed = crypto.randomUUID();

    console.log('Character sheet generated successfully');

    return new Response(JSON.stringify({ 
      imageUrl: imageData,
      styleSeed: styleSeed,
      prompt: prompt
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in generate-character-sheet:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
