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

    const { featureCode, creditsUsed, templateId, engine, metadata } = await req.json();

    if (!featureCode || creditsUsed === undefined) {
      throw new Error('Feature code and credits used are required');
    }

    // Insert usage event
    const { error: insertError } = await supabase
      .from('credit_usage_events')
      .insert({
        user_id: user.id,
        feature_code: featureCode,
        template_id: templateId,
        credits_used: creditsUsed,
        engine,
        metadata: metadata || {},
        timestamp: new Date().toISOString()
      });

    if (insertError) {
      throw new Error(`Failed to track usage: ${insertError.message}`);
    }

    console.log(`📊 Usage tracked for user ${user.id}: ${featureCode} = ${creditsUsed} credits`);

    return new Response(
      JSON.stringify({ success: true, message: 'Usage tracked successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error tracking usage:', error);
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
