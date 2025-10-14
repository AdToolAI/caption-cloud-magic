import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { event_id, approver_email, message } = await req.json();

    if (!event_id || !approver_email) {
      return new Response(
        JSON.stringify({ error: 'event_id and approver_email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify event exists
    const { data: event, error: eventError } = await supabaseClient
      .from('calendar_events')
      .select('id, title')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      console.error('Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique review token
    const reviewToken = crypto.randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setDate(tokenExpiresAt.getDate() + 7); // 7 days expiry

    // Create approval record
    const { data: approval, error: approvalError } = await supabaseClient
      .from('calendar_approvals')
      .insert({
        event_id,
        approver_email,
        status: 'pending',
        comment: message || null,
        review_token: reviewToken,
        token_expires_at: tokenExpiresAt.toISOString(),
      })
      .select()
      .single();

    if (approvalError) {
      console.error('Failed to create approval:', approvalError);
      return new Response(
        JSON.stringify({ error: 'Failed to create approval' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate review URL
    const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('https://lbunafpxuskwmsrraqxl.supabase.co', 'https://your-domain.com') || 'http://localhost:5173';
    const reviewUrl = `${baseUrl}/review/${reviewToken}`;

    console.log('Approval link created:', {
      event_id,
      approval_id: approval.id,
      approver_email,
      expires_at: tokenExpiresAt.toISOString()
    });

    return new Response(
      JSON.stringify({
        approval_id: approval.id,
        review_url: reviewUrl,
        review_token: reviewToken,
        expires_at: tokenExpiresAt.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in calendar-create-approval-link:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
