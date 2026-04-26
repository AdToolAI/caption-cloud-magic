import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const { templateId, rating, reviewText } = await req.json();
    const r = Math.max(1, Math.min(5, Math.floor(Number(rating) || 0)));
    if (!templateId || !r) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check ownership / purchase
    const { data: tpl } = await supabase
      .from('motion_studio_templates')
      .select('creator_user_id, marketplace_status')
      .eq('id', templateId)
      .maybeSingle();

    if (!tpl || tpl.marketplace_status !== 'published') {
      return new Response(JSON.stringify({ ok: false, error: 'TEMPLATE_NOT_PUBLISHED' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tpl.creator_user_id === userId) {
      return new Response(JSON.stringify({ ok: false, error: 'CANNOT_RATE_OWN_TEMPLATE' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: purchase } = await supabase
      .from('template_purchases')
      .select('id')
      .eq('template_id', templateId)
      .eq('buyer_user_id', userId)
      .maybeSingle();

    if (!purchase) {
      return new Response(JSON.stringify({ ok: false, error: 'MUST_PURCHASE_FIRST' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: upErr } = await supabase
      .from('template_marketplace_ratings')
      .upsert({
        template_id: templateId,
        user_id: userId,
        rating: r,
        review_text: reviewText ? String(reviewText).slice(0, 2000) : null,
      }, { onConflict: 'template_id,user_id' });

    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, rating: r }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
