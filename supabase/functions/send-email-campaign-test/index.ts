const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-qa-mock',
};
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse, qaMockJson } from "../_shared/qaMock.ts";

interface RequestBody {
  campaignId: string;
  subjectIndex: number;
  variantIndex: number;
  recipientEmail?: string; // defaults to logged-in user
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { name: "send-email-campaign-test" });


  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    // Beta-mode guard: block outbound campaign broadcasts during beta phase
    const { data: betaCfg } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'email.beta_mode')
      .maybeSingle();
    const isBeta = (betaCfg?.value === true) || ((betaCfg?.value as any)?.enabled === true);
    if (isBeta) {
      return new Response(
        JSON.stringify({ error: 'Email campaigns are disabled during the public beta phase.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body: RequestBody = await req.json();
    const { campaignId, subjectIndex, variantIndex, recipientEmail } = body;

    const { data: campaign, error: cErr } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = campaign.subjects?.[subjectIndex]?.text;
    const variant = campaign.variants?.[variantIndex];
    if (!subject || !variant) {
      return new Response(JSON.stringify({ error: 'Invalid subject/variant index' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetEmail = recipientEmail || user.email;
    if (!targetEmail) {
      return new Response(JSON.stringify({ error: 'No recipient email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow sending test to the logged-in user's own email (no bulk)
    if (targetEmail.toLowerCase() !== (user.email || '').toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Test sends are restricted to your own email address.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const testBanner = `<div style="background:#fff3cd;border:1px solid #ffeaa7;color:#856404;padding:10px 14px;font-family:Arial,sans-serif;font-size:12px;margin-bottom:16px;border-radius:4px;">⚡ TEST EMAIL — Variant: ${variant.label}</div>`;

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f4f4f4;"><div style="max-width:600px;margin:0 auto;background:#ffffff;padding:24px;">${testBanner}${variant.html}</div></body></html>`;

    const resendResp = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: 'Email Director <onboarding@resend.dev>',
        to: [targetEmail],
        subject: `[TEST] ${subject}`,
        html,
        text: variant.plain,
      }),
    });

    const resendJson = await resendResp.json();
    if (!resendResp.ok) {
      console.error('Resend error:', resendJson);
      return new Response(
        JSON.stringify({ error: 'Resend send failed', details: resendJson }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: resendJson.id, recipient: targetEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('send-email-campaign-test error:', e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
