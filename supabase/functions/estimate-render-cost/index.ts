import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { 
      durationSec, 
      resolution = '1080p', 
      complexity = 'medium',
      templateId 
    } = await req.json();

    // Get cost factors
    const { data: factors, error: factorsError } = await supabase
      .from('render_cost_factors')
      .select('*')
      .eq('is_active', true);

    if (factorsError) {
      throw new Error(`Failed to fetch cost factors: ${factorsError.message}`);
    }

    const remotionFactor = factors?.find(f => f.engine === 'remotion');
    const shotstackFactor = factors?.find(f => f.engine === 'shotstack');

    if (!remotionFactor || !shotstackFactor) {
      throw new Error('Cost factors not configured');
    }

    // Calculate costs
    const resolutionMult = remotionFactor.resolution_multiplier?.[resolution] || 1.0;
    const complexityMult = remotionFactor.complexity_multiplier?.[complexity] || 1.0;

    const remotionCost = Math.ceil(
      (remotionFactor.base_cost + (durationSec * remotionFactor.cost_per_second)) * 
      resolutionMult * 
      complexityMult
    );

    const shotstackCost = Math.ceil(
      (shotstackFactor.base_cost + (durationSec * shotstackFactor.cost_per_second)) * 
      resolutionMult * 
      complexityMult
    );

    // Get historical data if template provided
    let historicalAvg = null;
    if (templateId) {
      const { data: history } = await supabase
        .from('render_cost_history')
        .select('actual_cost')
        .eq('template_id', templateId)
        .not('actual_cost', 'is', null)
        .limit(10);

      if (history && history.length > 0) {
        const sum = history.reduce((acc, h) => acc + (h.actual_cost || 0), 0);
        historicalAvg = Math.ceil(sum / history.length);
      }
    }

    const recommended = remotionCost < shotstackCost ? 'remotion' : 'shotstack';

    console.log(`💰 Cost estimated for user ${user.id}: Remotion=${remotionCost}, Shotstack=${shotstackCost}`);

    return new Response(
      JSON.stringify({
        remotion: remotionCost,
        shotstack: shotstackCost,
        recommended,
        savings: Math.abs(remotionCost - shotstackCost),
        historicalAverage: historicalAvg,
        breakdown: {
          baseCost: remotionFactor.base_cost,
          durationCost: Math.ceil(durationSec * remotionFactor.cost_per_second),
          resolutionMultiplier: resolutionMult,
          complexityMultiplier: complexityMult,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error estimating cost:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
