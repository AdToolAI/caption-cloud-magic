import { createClient } from 'npm:@supabase/supabase-js@2';
import { trackBusinessEvent } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ ok: false, error: 'FORBIDDEN' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { characterId, action, reportId, decisionReason, refundBuyers } = await req.json();
    if (!characterId || !['unlist', 'permanent_remove', 'dismiss', 'reinstate'].includes(action)) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let newStatus: string | null = null;
    if (action === 'unlist') newStatus = 'unlisted';
    if (action === 'permanent_remove') newStatus = 'permanent_removed';
    if (action === 'reinstate') newStatus = 'published';
    if (action === 'dismiss') newStatus = null; // status unchanged

    if (newStatus) {
      await admin.from('brand_characters').update({
        marketplace_status: newStatus,
        rejection_reason: decisionReason ? String(decisionReason).slice(0, 1000) : null,
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', characterId);
    }

    // Refund buyers on permanent removal
    let refundedCount = 0;
    if (action === 'permanent_remove' && refundBuyers !== false) {
      const { data: purchases } = await admin
        .from('character_purchases')
        .select('id, buyer_user_id, price_credits, refunded_at')
        .eq('character_id', characterId)
        .is('refunded_at', null)
        .gt('price_credits', 0);

      for (const p of purchases ?? []) {
        // Refund credits
        const { data: credRow } = await admin
          .from('user_credits').select('credits_balance').eq('user_id', p.buyer_user_id).maybeSingle();
        if (credRow) {
          await admin.from('user_credits').update({
            credits_balance: (credRow.credits_balance ?? 0) + (p.price_credits ?? 0),
            updated_at: new Date().toISOString(),
          }).eq('user_id', p.buyer_user_id);
        } else {
          await admin.from('user_credits').insert({
            user_id: p.buyer_user_id,
            credits_balance: p.price_credits ?? 0,
          });
        }
        await admin.from('character_purchases').update({ refunded_at: new Date().toISOString() }).eq('id', p.id);
        refundedCount++;
      }
    }

    // Update report row if provided
    if (reportId) {
      await admin.from('character_marketplace_reports').update({
        status: action === 'dismiss' ? 'dismissed' : action === 'unlist' ? 'unlisted' : action === 'permanent_remove' ? 'permanent_removed' : 'reviewing',
        resolved_by: userData.user.id,
        resolved_at: new Date().toISOString(),
      }).eq('id', reportId);
    }

    return new Response(JSON.stringify({ ok: true, action, refundedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('takedown-marketplace-character', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
