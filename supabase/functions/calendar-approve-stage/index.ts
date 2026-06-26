import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "calendar-approve-stage" });


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

    const { approval_id, comment, approved_changes } = await req.json();

    console.log('[calendar-approve-stage] Approving:', { approval_id, user_id: user.id });

    if (!approval_id) {
      return new Response(
        JSON.stringify({ error: 'approval_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get approval
    const { data: approval, error: approvalError } = await supabaseClient
      .from('calendar_approvals')
      .select('*, calendar_events(title, workspace_id)')
      .eq('id', approval_id)
      .single();

    if (approvalError || !approval) {
      return new Response(
        JSON.stringify({ error: 'Approval not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: caller must be the designated approver (by id or email)
    // OR a member of the event's workspace.
    const isDesignatedApprover =
      (approval.approver_id && approval.approver_id === user.id) ||
      (approval.approver_email && user.email &&
        approval.approver_email.toLowerCase() === user.email.toLowerCase());

    let isWorkspaceMember = false;
    if (!isDesignatedApprover && approval.calendar_events?.workspace_id) {
      const { data: membership } = await supabaseClient
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', approval.calendar_events.workspace_id)
        .eq('user_id', user.id)
        .maybeSingle();
      isWorkspaceMember = !!membership;
    }

    if (!isDesignatedApprover && !isWorkspaceMember) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: not authorized to act on this approval' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update approval
    const { error: updateError } = await supabaseClient
      .from('calendar_approvals')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        approver_id: user.id,
        comment,
        approved_changes,
        stage: 'final_approval'
      })
      .eq('id', approval_id);

    if (updateError) {
      throw new Error('Failed to update approval');
    }

    // Update event status if all approvals are done
    const { data: allApprovals } = await supabaseClient
      .from('calendar_approvals')
      .select('status')
      .eq('event_id', approval.event_id);

    const allApproved = allApprovals?.every(a => a.status === 'approved');

    if (allApproved) {
      await supabaseClient
        .from('calendar_events')
        .update({ status: 'approved' })
        .eq('id', approval.event_id);
    }

    // Create notification
    await supabaseClient
      .from('notification_queue')
      .insert({
        user_id: approval.created_by || user.id,
        type: 'approval_approved',
        event_id: approval.event_id,
        title: 'Freigabe erteilt',
        message: `Event "${approval.calendar_events.title}" wurde freigegeben`,
        metadata: { approver_email: user.email }
      });

    console.log('[calendar-approve-stage] Approval successful');

    return new Response(
      JSON.stringify({ success: true, all_approved: allApproved }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[calendar-approve-stage] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
