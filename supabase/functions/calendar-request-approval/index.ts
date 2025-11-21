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

    const { event_id, workflow_id, approvers } = await req.json();

    console.log('[calendar-request-approval] Starting approval request:', {
      event_id,
      workflow_id,
      approver_count: approvers?.length
    });

    if (!event_id || !approvers || approvers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'event_id and approvers are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify event exists and user has access
    const { data: event, error: eventError } = await supabaseClient
      .from('calendar_events')
      .select('id, title, workspace_id')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      console.error('[calendar-request-approval] Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create approval requests for each approver
    const approvalRequests = approvers.map((approver: any) => ({
      event_id,
      approver_email: approver.email,
      approver_role: approver.role || 'reviewer',
      stage: 'review',
      status: 'pending',
      review_token: crypto.randomUUID(),
      token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    const { data: approvals, error: approvalError } = await supabaseClient
      .from('calendar_approvals')
      .insert(approvalRequests)
      .select();

    if (approvalError) {
      console.error('[calendar-request-approval] Failed to create approvals:', approvalError);
      throw new Error('Failed to create approval requests');
    }

    // Create notifications for each approver
    const notifications = approvers.map((approver: any) => ({
      user_id: approver.user_id || user.id,
      type: 'approval_request',
      event_id,
      title: 'Approval angefordert',
      message: `Freigabe für Event "${event.title}" wurde angefordert`,
      metadata: { approver_email: approver.email, stage: 'review' }
    }));

    await supabaseClient
      .from('notification_queue')
      .insert(notifications);

    console.log('[calendar-request-approval] Approval requests created:', approvals.length);

    return new Response(
      JSON.stringify({
        success: true,
        approvals: approvals.length,
        message: `${approvals.length} Approval-Anfragen erstellt`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-request-approval] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
