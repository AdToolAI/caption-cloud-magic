import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const {
      template_id,
      test_name,
      hypothesis,
      variant_a_config,
      variant_b_config,
      target_metric = 'conversion_rate',
      target_sample_size = 1000,
      confidence_level = 0.95,
    } = await req.json();

    if (!template_id || !test_name || !variant_a_config || !variant_b_config) {
      throw new Error('Missing required fields');
    }

    // Create the A/B test
    const { data: test, error: testError } = await supabase
      .from('template_ab_tests')
      .insert({
        template_id,
        test_name,
        hypothesis,
        variant_a_config,
        variant_b_config,
        target_metric,
        target_sample_size,
        confidence_level,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (testError) {
      console.error('Error creating A/B test:', testError);
      throw testError;
    }

    // Emit app event
    await supabase
      .from('app_events')
      .insert({
        user_id: user.id,
        event_type: 'ab_test.created',
        source: 'create_ab_test',
        payload_json: {
          test_id: test.id,
          template_id,
          test_name,
        },
      });

    return new Response(
      JSON.stringify({
        success: true,
        test,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-ab-test:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
