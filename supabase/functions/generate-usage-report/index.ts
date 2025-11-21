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

    const { periodStart, periodEnd, reportPeriod = 'daily' } = await req.json();

    if (!periodStart || !periodEnd) {
      throw new Error('Period start and end dates are required');
    }

    console.log(`📊 Generating ${reportPeriod} report for user ${user.id}: ${periodStart} to ${periodEnd}`);

    // Fetch usage events for period
    const { data: events, error: eventsError } = await supabase
      .from('credit_usage_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('timestamp', periodStart)
      .lte('timestamp', periodEnd);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          totalCreditsUsed: 0,
          message: 'No usage in this period'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate breakdowns
    const totalCredits = events.reduce((sum, e) => sum + e.credits_used, 0);
    
    const byFeature: any = {};
    const byTemplate: any = {};
    const byEngine: any = {};

    events.forEach(e => {
      byFeature[e.feature_code] = (byFeature[e.feature_code] || 0) + e.credits_used;
      if (e.template_id) {
        byTemplate[e.template_id] = (byTemplate[e.template_id] || 0) + e.credits_used;
      }
      if (e.engine) {
        byEngine[e.engine] = (byEngine[e.engine] || 0) + e.credits_used;
      }
    });

    // Top cost drivers
    const topDrivers = Object.entries(byFeature)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([feature, credits]) => ({ feature, credits }));

    // Cost savings potential
    const remotionCredits = byEngine['remotion'] || 0;
    const shotstackCredits = byEngine['shotstack'] || 0;
    const potentialSavings = shotstackCredits > 0 ? Math.floor(shotstackCredits * 0.5) : 0;

    // Insert or update report
    const { error: upsertError } = await supabase
      .from('credit_usage_reports')
      .upsert({
        user_id: user.id,
        report_period: reportPeriod,
        period_start: periodStart,
        period_end: periodEnd,
        total_credits_used: totalCredits,
        breakdown_by_feature: byFeature,
        breakdown_by_template: byTemplate,
        breakdown_by_engine: byEngine,
        top_cost_drivers: topDrivers,
        cost_savings_potential: {
          potentialSavings,
          recommendation: potentialSavings > 0 ? 'Consider using Remotion more often' : 'Great cost optimization!'
        }
      });

    if (upsertError) {
      throw new Error(`Failed to save report: ${upsertError.message}`);
    }

    console.log(`✅ Report generated: ${totalCredits} credits used`);

    return new Response(
      JSON.stringify({
        success: true,
        totalCreditsUsed: totalCredits,
        breakdownByFeature: byFeature,
        breakdownByTemplate: byTemplate,
        breakdownByEngine: byEngine,
        topCostDrivers: topDrivers,
        savingsPotential: potentialSavings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error generating report:', error);
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
