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

    const { durationSec, complexity, templateId, userCredits } = await req.json();

    // Decision factors with weights
    const factors: any = {
      duration: 0,
      complexity: 0,
      credits: 0,
      queueLoad: 0,
      history: 0
    };

    // 1. Duration factor (Remotion better for <60s)
    if (durationSec < 60) {
      factors.duration = 2; // Prefer Remotion
    } else if (durationSec > 120) {
      factors.duration = -1; // Prefer Shotstack for long videos
    }

    // 2. Complexity factor
    if (complexity === 'simple') {
      factors.complexity = 2; // Remotion
    } else if (complexity === 'complex') {
      factors.complexity = -2; // Shotstack
    }

    // 3. User credits factor
    if (userCredits && userCredits < 20) {
      factors.credits = 2; // Prefer cheaper option (Remotion)
    }

    // 4. Queue load factor
    const { data: queueStats } = await supabase
      .from('render_queue_stats')
      .select('*')
      .eq('date', new Date().toISOString().split('T')[0])
      .order('total_jobs', { ascending: false });

    if (queueStats && queueStats.length > 0) {
      const remotionLoad = queueStats.find(s => s.engine === 'remotion')?.total_jobs || 0;
      const shotstackLoad = queueStats.find(s => s.engine === 'shotstack')?.total_jobs || 0;
      
      if (remotionLoad < shotstackLoad) {
        factors.queueLoad = 1;
      } else if (remotionLoad > shotstackLoad) {
        factors.queueLoad = -1;
      }
    }

    // 5. Historical performance
    if (templateId) {
      const { data: history } = await supabase
        .from('render_cost_history')
        .select('engine')
        .eq('template_id', templateId)
        .not('engine', 'is', null)
        .limit(5);

      if (history && history.length > 0) {
        const remotionCount = history.filter(h => h.engine === 'remotion').length;
        if (remotionCount > history.length / 2) {
          factors.history = 1; // Template has good history with Remotion
        }
      }
    }

    // Calculate total score
    const totalScore = Object.values(factors).reduce((sum: number, val: any) => sum + val, 0);

    const selectedEngine = totalScore >= 0 ? 'remotion' : 'shotstack';
    const confidence = Math.min(100, Math.abs(totalScore) * 20);

    const reasons = [];
    if (factors.duration > 0) reasons.push('Kurze Videodauer optimal für Remotion');
    if (factors.complexity > 0) reasons.push('Einfache Animationen gut für Remotion');
    if (factors.credits > 0) reasons.push('Kredite sparen mit günstigerer Option');
    if (factors.queueLoad > 0) reasons.push('Geringere Warteschlange');
    if (factors.history > 0) reasons.push('Gute Historie mit dieser Engine');
    
    if (factors.duration < 0) reasons.push('Längere Videos besser mit Shotstack');
    if (factors.complexity < 0) reasons.push('Komplexe Effekte optimal für Shotstack');

    console.log(`🤖 Engine selected for user ${user.id}: ${selectedEngine} (confidence: ${confidence}%)`);

    return new Response(
      JSON.stringify({
        engine: selectedEngine,
        confidence,
        reasons,
        factors,
        estimatedCost: selectedEngine === 'remotion' ? 5 : 10
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error selecting engine:', error);
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
