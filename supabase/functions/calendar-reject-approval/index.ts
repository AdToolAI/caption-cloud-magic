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

    const { approval_id, comment } = await req.json();

    console.log('[calendar-reject-approval] Rejecting:', { approval_id, user_id: user.id });

    if (!approval_id) {
      return new Response(
        JSON.stringify({ error: 'approval_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get approval
    const { data: approval, error: approvalError } = await supabaseClient
      .from('calendar_approvals')
      .select('*, calendar_events(title)')
      .eq('id', approval_id)
      .single();

    if (approvalError || !approval) {
      return new Response(
        JSON.stringify({ error: 'Approval not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update approval
    const { error: updateError } = await supabaseClient
      .from('calendar_approvals')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        approver_id: user.id,
        comment
      })
      .eq('id', approval_id);

    if (updateError) {
      throw new Error('Failed to update approval');
    }

    // Update event status
    await supabaseClient
      .from('calendar_events')
      .update({ status: 'revision' })
      .eq('id', approval.event_id);

    // Create notification
    await supabaseClient
      .from('notification_queue')
      .insert({
        user_id: approval.created_by || user.id,
        type: 'approval_rejected',
        event_id: approval.event_id,
        title: 'Freigabe abgelehnt',
        message: `Event "${approval.calendar_events.title}" wurde abgelehnt: ${comment}`,
        metadata: { approver_email: user.email, rejection_reason: comment }
      });

    console.log('[calendar-reject-approval] Rejection successful');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-reject-approval] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
