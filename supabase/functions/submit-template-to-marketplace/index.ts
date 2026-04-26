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

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { templateId, pricingType, priceCredits } = body as {
      templateId?: string; pricingType?: 'free' | 'premium'; priceCredits?: number;
    };

    if (!templateId || !pricingType || (pricingType !== 'free' && pricingType !== 'premium')) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safePrice = pricingType === 'free' ? 0 : Math.max(25, Math.min(1000, Math.floor(priceCredits ?? 0)));
    if (pricingType === 'premium' && safePrice < 25) {
      return new Response(JSON.stringify({ ok: false, error: 'PRICE_TOO_LOW' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-Role for status writes (bypasses creator-update policy restrictions)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: tpl, error: tplErr } = await admin
      .from('motion_studio_templates')
      .select('id, creator_user_id, name, description, thumbnail_url, preview_video_url, scene_suggestions, marketplace_status')
      .eq('id', templateId)
      .maybeSingle();

    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ ok: false, error: 'TEMPLATE_NOT_FOUND' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tpl.creator_user_id !== userId) {
      return new Response(JSON.stringify({ ok: false, error: 'NOT_OWNER' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tpl.name || !tpl.description || !tpl.thumbnail_url) {
      return new Response(JSON.stringify({ ok: false, error: 'MISSING_METADATA', detail: 'Name, description and thumbnail required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scenes = Array.isArray(tpl.scene_suggestions) ? tpl.scene_suggestions : [];
    if (scenes.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'NO_SCENES' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newStatus = pricingType === 'free' ? 'published' : 'pending_review';
    const updates: Record<string, unknown> = {
      marketplace_status: newStatus,
      pricing_type: pricingType,
      price_credits: safePrice,
      updated_at: new Date().toISOString(),
    };
    if (pricingType === 'free') updates.published_at = new Date().toISOString();

    const { error: updErr } = await admin
      .from('motion_studio_templates')
      .update(updates)
      .eq('id', templateId);

    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true, status: newStatus, priceCredits: safePrice }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('submit-template-to-marketplace', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
