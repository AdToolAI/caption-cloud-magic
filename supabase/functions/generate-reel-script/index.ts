import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { ErrorResponses } from "../_shared/errorHandler.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    console.log('[generate-reel-script] CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      console.error('[generate-reel-script] LOVABLE_API_KEY not configured', { requestId });
      return ErrorResponses.serviceUnavailable({ requestId, reason: 'AI service not configured' });
    }

    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[generate-reel-script] Auth error', { requestId, error: authError });
      return ErrorResponses.authentication({ requestId, error: authError });
    }

    // Input validation
    const requestSchema = z.object({
      idea: z.string().min(10, 'Idea must be at least 10 characters').max(1500, 'Idea must be max 1500 characters'),
      platform: z.enum(['instagram', 'tiktok', 'youtube'], { errorMap: () => ({ message: 'Invalid platform' }) }),
      tone: z.enum(['friendly', 'funny', 'informative', 'edgy'], { errorMap: () => ({ message: 'Invalid tone' }) }),
      language: z.enum(['de', 'en', 'es']).optional().default('en'),
      duration: z.enum(['15', '30', '45', '60']).optional().default('30'),
      brand_kit_id: z.string().uuid().optional(),
    });

    const body = await req.json();
    
    console.log('[generate-reel-script] Raw request body:', {
      requestId,
      bodyKeys: Object.keys(body),
      idea: body.idea?.substring(0, 50) + '...',
      platform: body.platform,
      tone: body.tone,
      duration: body.duration,
      language: body.language
    });
    
    const validation = requestSchema.safeParse(body);
    
    if (!validation.success) {
      console.error('[generate-reel-script] Validation failed', { 
        requestId, 
        errors: validation.error.issues 
      });
      return ErrorResponses.validation(
        { requestId, errors: validation.error.issues },
        'generate-reel-script'
      );
    }

    const { 
      idea, 
      platform, 
      tone, 
      language,
      duration,
      brand_kit_id 
    } = validation.data;

    console.log('[generate-reel-script] Request received', { 
      requestId, 
      platform, 
      tone, 
      duration, 
      language,
      ideaLength: idea.length 
    });

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
        console.log('[generate-reel-script] Daily limit reached', { requestId, userId: user.id });
        return ErrorResponses.limitReached(
          { requestId, userId: user.id, limit: 2 },
          'generate-reel-script'
        );
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

    const durationSeconds = parseInt(duration);
    const durationMap: Record<string, string> = {
      '15': 'de', '30': 'en', '45': 'es', '60': 'en'
    };

    const languageInstructions: Record<string, string> = {
      de: 'Antworte in deutscher Sprache.',
      en: 'Respond in English.',
      es: 'Responde en español.'
    };

    const systemPrompt = `You are an expert short-form video creative director specializing in high-performing Reels/TikTok/Shorts.

Create a professional video script optimized for ${platform} with EXACT timing.

Required structure:
- Strong hook (0-3s) that stops scrolling
- Problem/tension building
- Mini-solution or proof point
- Clear, actionable CTA

Return JSON ONLY with this EXACT structure:
{
  "meta": {
    "platform": "${platform}",
    "durationSec": ${durationSeconds},
    "tone": "${tone}",
    "language": "${language}"
  },
  "hook": "Powerful opening line (max 10 words)",
  "beats": [
    {
      "tStart": 0,
      "tEnd": 3,
      "vo": "Voice-over text for this beat",
      "onScreen": "On-screen text (max 8 words)",
      "shot": "Camera/visual instruction"
    }
  ],
  "cta": "Clear, measurable call-to-action",
  "brollSuggestions": ["B-roll idea 1", "B-roll idea 2"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "captions": "SRT-style subtitles (optional)"
}

CRITICAL RULES:
1. Total duration MUST equal ${durationSeconds} seconds (±1s tolerance)
2. Each beat must have exact tStart and tEnd (no gaps, no overlaps)
3. On-screen text: MAX 8 words per beat
4. Minimum 4 beats required
5. Hook must be compelling and under 10 words
6. CTA must be specific and actionable
7. Hashtags: 8-12 mixed (niche + mid-volume), platform-specific
8. Tone: ${tone}
9. ${languageInstructions[language] || languageInstructions.en}

Target audience: Social media managers in SMBs
Goal: Maximize view-through rate and saves`;

    const userPrompt = `Topic/Idea: "${idea}"
Platform: ${platform}
Duration: ${durationSeconds} seconds (STRICT)
Tone: ${tone}
Language: ${language}${brandContext}

Generate a complete, production-ready script with exact timing and beat-by-beat breakdown.`;

    let scriptData: any;
    let isFallback = false;

    try {
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
        console.error('[generate-reel-script] AI API error', { 
          requestId, 
          status: aiResponse.status, 
          error: errorText 
        });

        if (aiResponse.status === 429) {
          return ErrorResponses.rateLimit(
            { requestId, status: aiResponse.status },
            'generate-reel-script AI gateway'
          );
        }

        if (aiResponse.status === 402) {
          return ErrorResponses.paymentRequired(
            { requestId, status: aiResponse.status },
            'generate-reel-script AI gateway'
          );
        }

        throw new Error(`AI API error: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('Empty AI response');
      }

      scriptData = JSON.parse(content);

      // Validate structure
      if (!scriptData.beats || scriptData.beats.length < 4) {
        throw new Error('Invalid script structure: missing or insufficient beats');
      }

      // Validate duration
      const totalDuration = scriptData.beats[scriptData.beats.length - 1]?.tEnd || 0;
      if (Math.abs(totalDuration - durationSeconds) > 2) {
        console.warn('[generate-reel-script] Duration mismatch', {
          requestId,
          expected: durationSeconds,
          actual: totalDuration
        });
      }

      console.log('[generate-reel-script] Script generated successfully', {
        requestId,
        beats: scriptData.beats?.length,
        duration: totalDuration
      });

    } catch (aiError: any) {
      console.error('[generate-reel-script] AI generation failed, using fallback', {
        requestId,
        error: aiError.message
      });

      // Fallback template-based script
      isFallback = true;
      const beatsCount = Math.ceil(durationSeconds / 8);
      const beatDuration = durationSeconds / beatsCount;

      scriptData = {
        meta: {
          platform,
          durationSec: durationSeconds,
          tone,
          language,
          fallback: true
        },
        hook: language === 'de' ? 'Warte - das musst du sehen!' : 
              language === 'es' ? '¡Espera - tienes que ver esto!' : 
              'Wait - you need to see this!',
        beats: Array.from({ length: beatsCount }, (_, i) => ({
          tStart: Math.round(i * beatDuration),
          tEnd: Math.round((i + 1) * beatDuration),
          vo: `${idea.substring(0, 100)}... Beat ${i + 1}`,
          onScreen: language === 'de' ? `Schritt ${i + 1}` :
                    language === 'es' ? `Paso ${i + 1}` :
                    `Step ${i + 1}`,
          shot: `Scene ${i + 1} setup`
        })),
        cta: language === 'de' ? 'Folge für mehr!' :
             language === 'es' ? '¡Sígueme para más!' :
             'Follow for more!',
        brollSuggestions: [
          language === 'de' ? 'Nahaufnahme' : language === 'es' ? 'Primer plano' : 'Close-up shot',
          language === 'de' ? 'Überblick' : language === 'es' ? 'Toma amplia' : 'Wide shot'
        ],
        hashtags: [`#${platform}`, '#viral', '#content', '#creator'],
        captions: ''
      };
    }

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
        title: scriptData.hook || 'Reel Script',
        brand_kit_id,
        ai_json: scriptData,
      })
      .select()
      .single();

    if (saveError) {
      console.error('[generate-reel-script] Error saving script', { 
        requestId, 
        error: saveError 
      });
      // Don't fail the request if save fails, still return the script
    }

    const elapsed = Date.now() - startTime;
    console.log('[generate-reel-script] Request completed', {
      requestId,
      scriptId: savedScript?.id,
      elapsed,
      isFallback,
      beatsCount: scriptData.beats?.length
    });

    return new Response(JSON.stringify({ 
      requestId,
      script: scriptData,
      id: savedScript?.id,
      isFallback
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error('[generate-reel-script] Unexpected error', {
      requestId,
      elapsed,
      error: error.message,
      stack: error.stack
    });

    return ErrorResponses.internal(
      { requestId, error: error.message },
      'generate-reel-script'
    );
  }
});
