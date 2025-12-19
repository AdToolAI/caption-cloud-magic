import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 Check Remotion progress request received');
    
    const { render_id, renderId, source } = await req.json();
    
    const effectiveRenderId = render_id || renderId;
    
    if (!effectiveRenderId) {
      throw new Error('render_id is required');
    }

    console.log('📊 Checking progress for render:', effectiveRenderId, 'source:', source);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============================================
    // ✅ HANDLE PENDING RENDER IDs WITH TIME-BASED PROGRESS
    // Since we use async Lambda, we can't query real progress
    // Webhook will update status when done
    // ============================================
    if (effectiveRenderId.startsWith('pending-')) {
      console.log('⏳ Pending render ID detected, checking DB status...');
      
      const { data: renderData, error: renderError } = await supabaseAdmin
        .from('video_renders')
        .select('render_id, bucket_name, status, error_message, video_url, started_at, completed_at')
        .eq('render_id', effectiveRenderId)
        .maybeSingle();

      if (renderError) {
        console.error('DB query error:', renderError);
      }

      // Render not found
      if (!renderData) {
        console.log('📋 Render not found, returning queued status');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: false,
            outputFile: null,
            errors: null,
            overallProgress: 0.01,
            status: 'queued',
            message: 'Render is being prepared...',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for completion (webhook updated status)
      if (renderData.status === 'completed' && renderData.video_url) {
        console.log('✅ Render completed via webhook!');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: true,
            fatalErrorEncountered: false,
            outputFile: renderData.video_url,
            errors: null,
            overallProgress: 1,
            status: 'completed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check for failure
      if (renderData.status === 'failed') {
        console.log('❌ Render failed');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: true,
            outputFile: null,
            errors: [renderData.error_message || 'Render failed'],
            overallProgress: 0,
            status: 'failed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ============================================
      // ✅ TIME-BASED PROGRESS SIMULATION
      // Typical render takes 2-3 minutes
      // Progress goes from 10% to 90% over ~3 minutes
      // Jumps to 100% when webhook updates to completed
      // ============================================
      const startedAt = renderData.started_at ? new Date(renderData.started_at).getTime() : Date.now();
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      
      // Progress curve: starts at 10%, reaches 90% at ~180 seconds (3 min)
      // Uses a logarithmic curve for realistic feel (fast at start, slows down)
      const maxProgressTime = 180; // 3 minutes
      const progressRatio = Math.min(elapsedSeconds / maxProgressTime, 1);
      
      // Logarithmic progress curve: 0.1 + 0.8 * (1 - e^(-3 * ratio))
      const simulatedProgress = 0.1 + 0.8 * (1 - Math.exp(-3 * progressRatio));
      
      // Cap at 90% - webhook will set 100%
      const clampedProgress = Math.min(simulatedProgress, 0.9);
      
      console.log(`⏱️ Elapsed: ${Math.round(elapsedSeconds)}s, Simulated progress: ${Math.round(clampedProgress * 100)}%`);
      
      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: clampedProgress,
          status: 'rendering',
          message: `Rendering... (${Math.round(clampedProgress * 100)}%)`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // ✅ NON-PENDING ID: Check DB directly
    // For Director's Cut or legacy renders
    // ============================================
    
    const isDirectorsCut = source === 'directors-cut';
    const tableName = isDirectorsCut ? 'director_cut_renders' : 'video_renders';
    const renderIdColumn = isDirectorsCut ? 'remotion_render_id' : 'render_id';
    const outputColumn = isDirectorsCut ? 'output_url' : 'video_url';

    console.log('📋 Querying table:', tableName, 'column:', renderIdColumn);

    const { data: renderData, error: renderError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq(renderIdColumn, effectiveRenderId)
      .maybeSingle();

    if (renderError) {
      console.error('DB query error:', renderError);
    }

    if (renderData) {
      // Check if completed
      if (renderData.status === 'completed' && renderData[outputColumn]) {
        console.log('✅ Render completed');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: true,
            fatalErrorEncountered: false,
            outputFile: renderData[outputColumn],
            errors: null,
            overallProgress: 1,
            status: 'completed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if failed
      if (renderData.status === 'failed') {
        console.log('❌ Render failed');
        return new Response(
          JSON.stringify({
            success: true,
            render_id: effectiveRenderId,
            done: false,
            fatalErrorEncountered: true,
            outputFile: null,
            errors: [renderData.error_message || 'Render failed'],
            overallProgress: 0,
            status: 'failed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Still rendering - use time-based progress
      const startedAt = renderData.started_at || renderData.created_at;
      const startTime = startedAt ? new Date(startedAt).getTime() : Date.now();
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const progressRatio = Math.min(elapsedSeconds / 180, 1);
      const simulatedProgress = 0.1 + 0.8 * (1 - Math.exp(-3 * progressRatio));
      const clampedProgress = Math.min(simulatedProgress, 0.9);

      console.log(`⏱️ Legacy render - Elapsed: ${Math.round(elapsedSeconds)}s, Progress: ${Math.round(clampedProgress * 100)}%`);

      return new Response(
        JSON.stringify({
          success: true,
          render_id: effectiveRenderId,
          done: false,
          fatalErrorEncountered: false,
          outputFile: null,
          errors: null,
          overallProgress: clampedProgress,
          status: 'rendering',
          message: `Rendering... (${Math.round(clampedProgress * 100)}%)`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No record found - return initializing status
    console.log('⏳ No render record found, returning initializing status');
    return new Response(
      JSON.stringify({
        success: true,
        render_id: effectiveRenderId,
        done: false,
        fatalErrorEncountered: false,
        outputFile: null,
        errors: null,
        overallProgress: 0.05,
        status: 'queued',
        message: 'Initializing render...',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error checking Remotion progress:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
