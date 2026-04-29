import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HIGH_SEVERITY = new Set(['minor', 'impersonation', 'deepfake']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { characterId, reason, description, reporterEmail } = body as {
      characterId?: string;
      reason?: string;
      description?: string;
      reporterEmail?: string;
    };

    if (!characterId || !reason) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_INPUT' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validReasons = ['impersonation', 'copyright', 'minor', 'deepfake', 'nsfw', 'other'];
    if (!validReasons.includes(reason)) {
      return new Response(JSON.stringify({ ok: false, error: 'INVALID_REASON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try to identify reporter
    let reporterUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: u } = await supabase.auth.getUser();
      reporterUserId = u?.user?.id ?? null;
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: report, error: insErr } = await admin
      .from('character_marketplace_reports')
      .insert({
        character_id: characterId,
        reporter_user_id: reporterUserId,
        reporter_email: reporterEmail?.trim().slice(0, 320) ?? null,
        reason,
        description: description?.trim().slice(0, 2000) ?? null,
        status: 'open',
      })
      .select('id')
      .single();

    if (insErr) throw insErr;

    // High-severity → auto-quarantine
    if (HIGH_SEVERITY.has(reason)) {
      await admin
        .from('brand_characters')
        .update({
          marketplace_status: 'under_investigation',
          updated_at: new Date().toISOString(),
        })
        .eq('id', characterId)
        .eq('marketplace_status', 'published');
    }

    return new Response(JSON.stringify({ ok: true, reportId: report.id, quarantined: HIGH_SEVERITY.has(reason) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('report-marketplace-character', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
