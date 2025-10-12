import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Input validation
    const requestSchema = z.object({
      idea: z.string().min(1).max(1500),
      platform: z.string().regex(/^[a-zA-Z]+$/).max(50),
      tone: z.string().max(50),
      language: z.string().regex(/^[a-z]{2}$/).optional().default('en'),
      duration: z.string().max(20).optional().default('medium'),
      brand_kit_id: z.string().uuid().optional(),
    });

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: validation.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      idea, 
      platform, 
      tone, 
      language,
      duration,
      brand_kit_id 
    } = validation.data;

    console.log('Generating reel script:', { platform, tone, duration, language });

    // Check user plan and daily limit
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const isPro = profile?.plan === 'pro';

    // Check daily usage for free users
    if (!isPro) {
      const today = new Date().toISOString().split('T')[0];
      const { count } = await supabase
        .from('reel_scripts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today);

      if (count && count >= 2) {
        return new Response(JSON.stringify({ 
          error: 'Daily limit reached',
          message: 'Free plan allows 2 scripts per day. Upgrade to Pro for unlimited access.'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch brand kit if provided
    let brandContext = '';
    if (brand_kit_id) {
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', brand_kit_id)
        .single();

      if (brandKit) {
        brandContext = `\n\nBrand Kit Context:
- Mood: ${brandKit.mood || 'N/A'}
- Primary Color: ${brandKit.primary_color}
- Keywords: ${(brandKit.keywords as string[])?.join(', ') || 'N/A'}`;
      }
    }

    const durationMap = {
      short: '15 seconds',
      medium: '30 seconds',
      long: '60 seconds'
    };

    const systemPrompt = `You are an expert short-form video strategist for social media creators.
Given a topic or caption, generate a detailed video script optimized for ${platform}.

Return JSON ONLY with this exact structure:
{
  "title": "Short descriptive title",
  "hook": "Strong first line (<= 10 words)",
  "scenes": [
    {
      "scene_number": 1,
      "description": "Brief description of what's happening in the scene",
      "text_overlay": "On-screen text suggestion (<= 10 words)",
      "emotion": "Emotion or vibe (e.g. energetic, calm, funny)",
      "camera_tip": "Simple shooting tip (angle, movement, lighting)"
    }
  ],
  "cta": "Call-to-action to end the video",
  "music_tone": "Recommended music mood (e.g., upbeat, ambient, dramatic)",
  "caption": "Optional post caption (<250 chars, include 3 hashtags)"
}

Rules:
- Generate 3-5 scenes maximum based on duration
- Make it actionable and visually realistic
- Adapt tone to ${tone} and ${platform} norms
- Keep descriptions short, clear, and creative
- Use ${language} language for all text
- Duration target: ${durationMap[duration as keyof typeof durationMap] || '30 seconds'}`;

    const userPrompt = `Idea: ${idea}
Platform: ${platform}
Tone: ${tone}
Duration: ${duration}${brandContext}

Generate a complete video script with scenes, overlays, and camera tips.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const scriptData = JSON.parse(aiData.choices[0].message.content);

    console.log('Script generated:', scriptData.title);

    // Save to database
    const { data: savedScript, error: saveError } = await supabase
      .from('reel_scripts')
      .insert({
        user_id: user.id,
        language,
        platform,
        tone,
        duration,
        idea,
        title: scriptData.title,
        brand_kit_id,
        ai_json: scriptData,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving script:', saveError);
      throw saveError;
    }

    return new Response(JSON.stringify({ 
      script: scriptData,
      id: savedScript.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-reel-script:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate reel script' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
