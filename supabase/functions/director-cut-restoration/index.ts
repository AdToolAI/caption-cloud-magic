import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base credit costs for individual features - SYNCED with frontend AIVideoRestoration.tsx
const FEATURE_CREDITS = {
  denoise: 3,        // Frontend: removeGrain +3
  deblock: 3,        // Frontend: removeScratches +3
  color_correction: 3,
  stabilize: 5,      // Frontend: stabilizeFootage +5
  face_enhance: 5,   // Frontend: enhanceFaces +5
  deinterlace: 2,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Accept both naming conventions from frontend
    const body = await req.json();
    const { 
      video_url, 
      restoration_options,    // Frontend sends this object
      restorationOptions,     // Alternative camelCase name
    } = body;

    // Merge restoration options from either parameter name
    const options = restoration_options || restorationOptions || {};

    // Extract features with defaults - map frontend names to backend
    const features = {
      denoise: options.denoise ?? true,
      denoise_strength: options.denoise_strength ?? options.denoiseStrength ?? 50,
      deblock: options.deblock ?? true,
      color_correction: options.color_correction ?? options.colorCorrection ?? true,
      stabilize: options.stabilize ?? false,
      scratch_removal: options.scratch_removal ?? options.scratchRemoval ?? false,
      grain_removal: options.grain_removal ?? options.grainRemoval ?? false,
      face_enhance: options.face_enhance ?? options.faceEnhance ?? false,
      deinterlace: options.deinterlace ?? false,
    };

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Restoration] Starting restoration for user: ${user.id}`);
    console.log(`[Restoration] Features:`, features);

    // Calculate credit cost dynamically based on enabled features - synced with frontend
    let creditCost = 5; // Base cost (same as frontend)
    const enabledFeatures: string[] = [];

    if (features.denoise) {
      creditCost += FEATURE_CREDITS.denoise;
      enabledFeatures.push('Filmkorn entfernen');
    }
    if (features.deblock) {
      creditCost += FEATURE_CREDITS.deblock;
      enabledFeatures.push('Kratzer & Staub entfernen');
    }
    if (features.color_correction) {
      creditCost += FEATURE_CREDITS.color_correction;
      enabledFeatures.push('Farbrestaurierung');
    }
    if (features.stabilize) {
      creditCost += FEATURE_CREDITS.stabilize;
      enabledFeatures.push('Bildstabilisierung');
    }
    if (features.face_enhance) {
      creditCost += FEATURE_CREDITS.face_enhance;
      enabledFeatures.push('KI Gesichtsverbesserung');
    }
    if (features.deinterlace) {
      creditCost += FEATURE_CREDITS.deinterlace;
      enabledFeatures.push('Deinterlacing');
    }

    // creditCost already includes base of 5
    creditCost = Math.max(creditCost, 5);

    // Check user credits
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Could not retrieve wallet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (wallet.balance < creditCost) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${creditCost} Credits für Video-Restaurierung. Aktuell: ${wallet.balance} Credits.`,
          required: creditCost,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI for restoration analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let analysisResults = null;

    if (LOVABLE_API_KEY) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
                content: 'You are a video restoration expert. Analyze restoration settings and provide recommendations. Return JSON only.',
              },
              {
                role: 'user',
                content: `Video restoration analysis request:
Features enabled: ${JSON.stringify(features)}
Enabled features: ${enabledFeatures.join(', ')}
Total credits: ${creditCost}

Provide restoration recommendations as JSON with:
- quality_score_estimate: 0-100 (estimated output quality)
- processing_steps: array of steps that will be applied
- warnings: array of potential issues
- recommendations: array of suggestions for better results`,
              },
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'restoration_analysis',
                  description: 'Return video restoration analysis',
                  parameters: {
                    type: 'object',
                    properties: {
                      quality_score_estimate: { type: 'number' },
                      processing_steps: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      warnings: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      recommendations: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                    required: ['quality_score_estimate', 'processing_steps', 'warnings', 'recommendations'],
                  },
                },
              },
            ],
            tool_choice: { type: 'function', function: { name: 'restoration_analysis' } },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            analysisResults = JSON.parse(toolCall.function.arguments);
          }
        }
      } catch (aiError) {
        console.error('[Restoration] AI analysis error:', aiError);
      }
    }

    // Create restoration job
    const jobId = crypto.randomUUID();

    console.log(`[Restoration] Job ${jobId} created - Pipeline: ${enabledFeatures.join(' → ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: 'processing',
        message: 'Video-Restaurierung gestartet.',
        credits_required: creditCost,
        active_features: enabledFeatures.length, // For frontend toast display
        settings: {
          features,
          enabled_features: enabledFeatures,
          processing_pipeline: enabledFeatures,
        },
        analysis: analysisResults,
        estimated_time_minutes: Math.ceil(enabledFeatures.length * 2),
        feature_credits: FEATURE_CREDITS,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Restoration] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
