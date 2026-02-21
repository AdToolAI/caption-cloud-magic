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
    const { progressId, renderId } = await req.json();

    if (!progressId && !renderId) {
      return new Response(
        JSON.stringify({ error: 'progressId or renderId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const report: Record<string, any> = {
      timestamp: new Date().toISOString(),
      query: { progressId, renderId },
    };

    // 1. Fetch universal_video_progress
    if (progressId) {
      const { data: progress, error: pErr } = await supabase
        .from('universal_video_progress')
        .select('*')
        .eq('id', progressId)
        .maybeSingle();

      report.progress = progress || null;
      report.progressError = pErr?.message || null;

      // Extract renderId from result_data if not provided
      if (!renderId && progress?.result_data) {
        const rd = progress.result_data as any;
        if (rd.renderId) {
          report.derivedRenderId = rd.renderId;
        }
      }
    }

    // 2. Fetch video_renders
    const searchRenderId = renderId || report.derivedRenderId;
    if (searchRenderId) {
      const { data: render, error: rErr } = await supabase
        .from('video_renders')
        .select('render_id, status, error_message, content_config, created_at, updated_at, completed_at')
        .eq('render_id', searchRenderId)
        .maybeSingle();

      report.render = render || null;
      report.renderError = rErr?.message || null;

      if (render?.content_config) {
        const cc = render.content_config as any;
        report.lambdaRenderId = cc.lambda_render_id || null;
      }
    }

    // 3. Diagnose
    const diag: string[] = [];

    if (report.progress) {
      const p = report.progress;
      diag.push(`Progress status: ${p.status}, step: ${p.current_step}, percent: ${p.progress_percent}%`);
      
      if (p.status === 'failed') {
        diag.push(`❌ FAILED: ${p.status_message}`);
      }
      
      // Check staleness
      const updatedAt = new Date(p.updated_at).getTime();
      const age = Date.now() - updatedAt;
      if (age > 120000) {
        diag.push(`⚠️ Progress not updated for ${Math.round(age / 1000)}s — likely stale/timed out`);
      }
    } else if (progressId) {
      diag.push('❌ No progress record found');
    }

    if (report.render) {
      const r = report.render;
      diag.push(`Render status: ${r.status}`);
      if (r.error_message) diag.push(`Render error: ${r.error_message}`);
      if (!report.lambdaRenderId) {
        diag.push('⚠️ lambda_render_id is NULL — invoke-remotion-render likely never completed (timeout?)');
      } else {
        diag.push(`✅ lambda_render_id: ${report.lambdaRenderId}`);
      }
    } else if (searchRenderId) {
      diag.push('❌ No render record found for renderId');
    }

    // Check for the known timeout issue
    if (report.render && !report.lambdaRenderId && report.render.status === 'rendering') {
      diag.push('🔴 DIAGNOSIS: invoke-remotion-render was killed by timeout before Lambda responded. The Edge Function default timeout (~200s) is too short for the Lambda call (~3+ min).');
    }

    report.diagnosis = diag;

    return new Response(
      JSON.stringify(report, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
