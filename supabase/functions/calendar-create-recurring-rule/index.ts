import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const {
      workspace_id,
      name,
      template_event,
      recurrence_pattern,
      auto_render,
      video_template_id
    } = await req.json();

    console.log('[calendar-create-recurring-rule] Creating rule:', { name, workspace_id });

    if (!workspace_id || !name || !template_event || !recurrence_pattern) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate first execution time
    const now = new Date();
    const firstExecution = new Date(now);
    firstExecution.setDate(firstExecution.getDate() + 1);
    firstExecution.setHours(9, 0, 0, 0);

    // Create recurring rule
    const { data: rule, error: ruleError } = await supabaseClient
      .from('recurring_event_rules')
      .insert({
        workspace_id,
        name,
        template_event,
        recurrence_pattern,
        auto_render: auto_render || false,
        video_template_id,
        next_execution: firstExecution.toISOString(),
        is_active: true
      })
      .select()
      .single();

    if (ruleError) {
      console.error('[calendar-create-recurring-rule] Failed to create rule:', ruleError);
      throw new Error('Failed to create recurring rule');
    }

    console.log('[calendar-create-recurring-rule] Rule created:', rule.id);

    return new Response(
      JSON.stringify({
        success: true,
        rule_id: rule.id,
        next_execution: rule.next_execution
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-create-recurring-rule] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
