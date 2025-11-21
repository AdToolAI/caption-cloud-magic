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
      projectId, 
      templateId, 
      config, 
      priority = 5, 
      engine = 'auto',
      estimatedDurationSec 
    } = await req.json();

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Load template with remotion component ID and field mappings
    let templateData = null;
    let fieldMappings = [];
    
    if (templateId) {
      const { data: template, error: templateError } = await supabase
        .from('content_templates')
        .select('*, remotion_component_id')
        .eq('id', templateId)
        .single();

      if (!templateError && template) {
        templateData = template;

        // Load field mappings for this template
        const { data: mappings } = await supabase
          .from('template_field_mappings')
          .select('*')
          .eq('template_id', templateId);

        if (mappings) {
          fieldMappings = mappings;
        }
      }
    }

    // Estimate cost based on config
    let estimatedCost = 5; // Default
    if (engine === 'remotion') {
      estimatedCost = 5;
    } else if (engine === 'shotstack') {
      estimatedCost = 10;
    } else {
      // Auto: estimate based on duration
      estimatedCost = estimatedDurationSec && estimatedDurationSec > 60 ? 10 : 5;
    }

    // Prepare config with mapped props
    const preparedConfig = {
      ...config,
      remotionComponentId: templateData?.remotion_component_id || config?.remotionComponentId,
      fieldMappings: fieldMappings.length > 0 ? fieldMappings : undefined,
      templateData: templateData ? {
        name: templateData.name,
        aspectRatio: templateData.aspect_ratio,
        duration: templateData.duration_max
      } : undefined
    };

    console.log(`📦 Prepared config with component ID: ${preparedConfig.remotionComponentId}`);
    if (fieldMappings.length > 0) {
      console.log(`🗺️ Found ${fieldMappings.length} field mappings for template`);
    }

    // Insert into queue
    const { data: queueJob, error: insertError } = await supabase
      .from('render_queue')
      .insert({
        user_id: user.id,
        project_id: projectId,
        template_id: templateId,
        config: preparedConfig,
        priority,
        engine,
        estimated_cost: estimatedCost,
        estimated_duration_sec: estimatedDurationSec,
        status: 'queued',
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to add to queue: ${insertError.message}`);
    }

    console.log(`✅ Job added to queue: ${queueJob.id} for user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        jobId: queueJob.id,
        estimatedCost,
        position: 'calculating...'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error adding to queue:', error);
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
