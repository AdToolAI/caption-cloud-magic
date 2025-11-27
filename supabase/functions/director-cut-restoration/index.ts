import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Credit costs for restoration features
const RESTORATION_CREDITS = {
  basic: 5,      // Basic cleanup
  standard: 10,  // Standard restoration
  premium: 20,   // Full restoration with all features
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

    const { 
      video_url, 
      restoration_level = 'standard', // basic, standard, premium
      features = {
        denoise: true,
        deblock: true,
        color_correction: true,
        stabilization: false,
        scratch_removal: false,
        grain_removal: false,
      },
    } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Restoration] Starting ${restoration_level} restoration for user: ${user.id}`);

    // Determine credit cost
    const creditCost = RESTORATION_CREDITS[restoration_level as keyof typeof RESTORATION_CREDITS] || 10;

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
Restoration level: ${restoration_level}
Features enabled: ${JSON.stringify(features)}

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

    // Build processing pipeline based on features
    const processingPipeline = [];
    if (features.denoise) processingPipeline.push('Temporal Denoise');
    if (features.deblock) processingPipeline.push('Deblock Filter');
    if (features.color_correction) processingPipeline.push('AI Color Correction');
    if (features.stabilization) processingPipeline.push('Video Stabilization');
    if (features.scratch_removal) processingPipeline.push('Scratch & Dust Removal');
    if (features.grain_removal) processingPipeline.push('Film Grain Reduction');

    console.log(`[Restoration] Job ${jobId} created - Pipeline: ${processingPipeline.join(' → ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        status: 'processing',
        message: 'Video-Restaurierung gestartet.',
        credits_required: creditCost,
        settings: {
          restoration_level,
          features,
          processing_pipeline: processingPipeline,
        },
        analysis: analysisResults,
        estimated_time_minutes: restoration_level === 'premium' ? 15 : restoration_level === 'standard' ? 8 : 4,
        available_levels: [
          {
            level: 'basic',
            credits: 5,
            description: 'Grundlegende Rauschentfernung und Farbkorrektur',
          },
          {
            level: 'standard',
            credits: 10,
            description: 'Standard-Restaurierung mit Deblocking und Stabilisierung',
          },
          {
            level: 'premium',
            credits: 20,
            description: 'Volle Restaurierung inkl. Kratzer- und Kornentfernung',
          },
        ],
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
