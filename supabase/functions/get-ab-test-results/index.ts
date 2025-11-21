import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple z-test for proportions
function calculateZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number
): { z: number; pValue: number; isSignificant: boolean } {
  if (totalA === 0 || totalB === 0) {
    return { z: 0, pValue: 1, isSignificant: false };
  }

  const p1 = successA / totalA;
  const p2 = successB / totalB;
  const pPool = (successA + successB) / (totalA + totalB);
  
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));
  
  if (se === 0) {
    return { z: 0, pValue: 1, isSignificant: false };
  }

  const z = (p1 - p2) / se;
  
  // Two-tailed p-value approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  
  return {
    z,
    pValue,
    isSignificant: pValue < 0.05,
  };
}

// Approximation of standard normal CDF
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const test_id = url.searchParams.get('test_id');

    if (!test_id) {
      throw new Error('Missing required parameter: test_id');
    }

    // Get test details
    const { data: test, error: testError } = await supabase
      .from('template_ab_tests')
      .select('*')
      .eq('id', test_id)
      .single();

    if (testError || !test) {
      throw new Error('A/B test not found');
    }

    // Get metrics for both variants
    const { data: variantAMetrics, error: metricsAError } = await supabase
      .from('template_conversion_events')
      .select('event_type')
      .eq('template_id', test.template_id)
      .eq('metadata->>variant', 'A')
      .gte('created_at', test.started_at || test.created_at);

    const { data: variantBMetrics, error: metricsBError } = await supabase
      .from('template_conversion_events')
      .select('event_type')
      .eq('template_id', test.template_id)
      .eq('metadata->>variant', 'B')
      .gte('created_at', test.started_at || test.created_at);

    if (metricsAError || metricsBError) {
      console.error('Error fetching variant metrics:', metricsAError || metricsBError);
      throw metricsAError || metricsBError;
    }

    // Calculate metrics for variant A
    const viewsA = variantAMetrics?.filter(e => e.event_type === 'viewed').length || 0;
    const selectionsA = variantAMetrics?.filter(e => e.event_type === 'selected').length || 0;
    const createsA = variantAMetrics?.filter(e => e.event_type === 'created').length || 0;
    const publishesA = variantAMetrics?.filter(e => e.event_type === 'published').length || 0;
    const conversionRateA = viewsA > 0 ? (createsA / viewsA) * 100 : 0;

    // Calculate metrics for variant B
    const viewsB = variantBMetrics?.filter(e => e.event_type === 'viewed').length || 0;
    const selectionsB = variantBMetrics?.filter(e => e.event_type === 'selected').length || 0;
    const createsB = variantBMetrics?.filter(e => e.event_type === 'created').length || 0;
    const publishesB = variantBMetrics?.filter(e => e.event_type === 'published').length || 0;
    const conversionRateB = viewsB > 0 ? (createsB / viewsB) * 100 : 0;

    const variantA = {
      views: viewsA,
      selections: selectionsA,
      creates: createsA,
      publishes: publishesA,
      conversionRate: conversionRateA,
    };

    const variantB = {
      views: viewsB,
      selections: selectionsB,
      creates: createsB,
      publishes: publishesB,
      conversionRate: conversionRateB,
    };

    // Perform statistical test
    const statisticalTest = calculateZTest(
      createsA,
      viewsA,
      createsB,
      viewsB
    );

    // Determine winner
    let winner = null;
    let winnerLift = 0;
    if (statisticalTest.isSignificant) {
      if (variantA.conversionRate > variantB.conversionRate) {
        winner = 'A';
        winnerLift = ((variantA.conversionRate - variantB.conversionRate) / variantB.conversionRate) * 100;
      } else {
        winner = 'B';
        winnerLift = ((variantB.conversionRate - variantA.conversionRate) / variantA.conversionRate) * 100;
      }
    }

    // Calculate sample size progress
    const totalSamples = viewsA + viewsB;
    const sampleProgress = (totalSamples / test.target_sample_size) * 100;

    // Update test if completed
    if (statisticalTest.isSignificant && totalSamples >= test.target_sample_size) {
      await supabase
        .from('template_ab_tests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          winner_variant: winner,
          statistical_significance: statisticalTest.pValue,
        })
        .eq('id', test_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        test,
        results: {
          variant_a: variantA,
          variant_b: variantB,
          statistical_test: statisticalTest,
          winner,
          winner_lift: winnerLift,
          sample_progress: sampleProgress,
          is_complete: statisticalTest.isSignificant && totalSamples >= test.target_sample_size,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-ab-test-results:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
