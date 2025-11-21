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

    const { days = 30 } = await req.json();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    console.log(`💰 Calculating cost savings for user ${user.id} over ${days} days`);

    // Fetch usage events
    const { data: events, error: eventsError } = await supabase
      .from('credit_usage_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('timestamp', startDate.toISOString());

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({
          totalSpent: 0,
          potentialSavings: 0,
          recommendations: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate actual spend
    const totalSpent = events.reduce((sum, e) => sum + e.credits_used, 0);
    
    // Count by engine
    const remotionCount = events.filter(e => e.engine === 'remotion').length;
    const shotstackCount = events.filter(e => e.engine === 'shotstack').length;
    const totalRenders = remotionCount + shotstackCount;

    // Calculate potential savings if all used Remotion
    const shotstackCredits = events
      .filter(e => e.engine === 'shotstack')
      .reduce((sum, e) => sum + e.credits_used, 0);

    const potentialSavings = shotstackCredits > 0 ? Math.floor(shotstackCredits * 0.5) : 0;

    // Generate recommendations
    const recommendations = [];

    if (shotstackCount > remotionCount) {
      recommendations.push({
        type: 'engine',
        priority: 'high',
        message: `${Math.round((shotstackCount / totalRenders) * 100)}% deiner Renders nutzen Shotstack. Wechsel zu Remotion könnte ${potentialSavings} Credits sparen.`,
        savingsPotential: potentialSavings
      });
    }

    // Check for cache opportunities
    const templateUsage: any = {};
    events.forEach(e => {
      if (e.template_id) {
        templateUsage[e.template_id] = (templateUsage[e.template_id] || 0) + 1;
      }
    });

    const repeatedTemplates = Object.entries(templateUsage)
      .filter(([, count]) => (count as number) > 2)
      .length;

    if (repeatedTemplates > 0) {
      const cacheableSavings = Math.floor(totalSpent * 0.3);
      recommendations.push({
        type: 'caching',
        priority: 'medium',
        message: `${repeatedTemplates} Templates werden wiederholt gerendert. Caching könnte ~${cacheableSavings} Credits sparen.`,
        savingsPotential: cacheableSavings
      });
    }

    // Check for quality preset optimization
    recommendations.push({
      type: 'quality',
      priority: 'low',
      message: 'Nutze platform-spezifische Quality Presets für optimale Dateigröße.',
      savingsPotential: Math.floor(totalSpent * 0.1)
    });

    const totalPotentialSavings = recommendations.reduce((sum, r) => sum + (r.savingsPotential || 0), 0);

    console.log(`✅ Calculated savings: ${totalPotentialSavings} credits potential`);

    return new Response(
      JSON.stringify({
        totalSpent,
        potentialSavings: totalPotentialSavings,
        recommendations,
        stats: {
          totalRenders,
          remotionCount,
          shotstackCount,
          remotionPercentage: Math.round((remotionCount / totalRenders) * 100),
          repeatedTemplates
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error calculating savings:', error);
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
