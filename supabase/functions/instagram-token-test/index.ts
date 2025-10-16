import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json(null, 204);
  }

  try {
    // 1) Eingaben: Token aus Datenbank (Fallback: ENV), igUserId aus Body oder Secret
    const { igUserId } = await req.json().catch(() => ({}));
    const IG_USER_ID = igUserId || Deno.env.get('IG_USER_ID');
    
    // Token aus app_secrets Tabelle lesen
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    let PAGE_TOKEN = Deno.env.get('IG_PAGE_ACCESS_TOKEN');
    
    // Versuche zuerst aus Datenbank zu lesen
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data, error } = await supabase
          .from('app_secrets')
          .select('encrypted_value')
          .eq('name', 'IG_PAGE_ACCESS_TOKEN')
          .single();
        
        if (!error && data?.encrypted_value) {
          PAGE_TOKEN = data.encrypted_value;
          console.log('Token loaded from secure database');
        } else {
          console.log('Token not found in database, using ENV fallback');
        }
      } catch (dbError) {
        console.warn('Database read failed, using ENV fallback:', dbError);
      }
    }

    if (!PAGE_TOKEN) {
      console.error('IG_PAGE_ACCESS_TOKEN nicht konfiguriert');
      return json({
        ok: false,
        error: 'IG_PAGE_ACCESS_TOKEN fehlt (Secret nicht gesetzt)',
      });
    }

    if (!IG_USER_ID) {
      return json({
        ok: false,
        error: 'Instagram User ID fehlt (IG_USER_ID Secret oder Body.igUserId)',
      });
    }

    // 2) Kern-Check: IG-User via Page Token (nur id,username - kein account_type!)
    console.log(`Testing token for IG User ID: ${IG_USER_ID}`);
    const testUrl = `https://graph.facebook.com/v24.0/${IG_USER_ID}?fields=id,username&access_token=${encodeURIComponent(PAGE_TOKEN)}`;

    const res = await fetch(testUrl);
    const data = await res.json();

    if (!res.ok || data.error) {
      const e = data.error || {};
      const code = e.code ?? 'UNKNOWN';
      const sub = e.error_subcode;
      const msg = e.message || JSON.stringify(data);

      console.error('Meta API error:', JSON.stringify(data, null, 2));

      // Benutzerfreundliche Fehlermeldungen
      let human = 'Token-Validierung fehlgeschlagen';
      if (code === 190) {
        human = 'Token ist ungültig oder abgelaufen';
      } else if (code === 100) {
        human = 'Ungültige Instagram User ID oder fehlende Berechtigungen';
      } else if ((msg || '').includes('Invalid platform')) {
        human = 'App/Platform falsch konfiguriert (Invalid platform app)';
      }

      return json({
        ok: false,
        error: human,
        details: {
          code,
          subcode: sub,
          type: e.type,
          message: msg,
          fbtrace_id: e.fbtrace_id,
        },
      });
    }

    // 3) Optional: Page ↔ IG-Verknüpfung prüfen
    const PAGE_ID = Deno.env.get('FB_PAGE_ID') || '797827560073785';
    let linkedIgId = null;

    try {
      const linkUrl = `https://graph.facebook.com/v24.0/${PAGE_ID}?fields=instagram_business_account&access_token=${encodeURIComponent(PAGE_TOKEN)}`;
      const linkRes = await fetch(linkUrl);
      const link = await linkRes.json();
      linkedIgId = link?.instagram_business_account?.id ?? null;
    } catch (linkErr) {
      console.warn('Could not verify page-instagram link:', linkErr);
    }

    // Token ist gültig!
    console.log('Token validation successful:', data);

    return json({
      ok: true,
      user: {
        id: data.id,
        username: data.username,
      },
      link: {
        page_id: PAGE_ID,
        instagram_business_account_id: linkedIgId,
      },
    });
  } catch (err: any) {
    console.error('Token test error:', err);
    return json({
      ok: false,
      error: err?.message || 'Unerwarteter Fehler bei der Token-Validierung',
      details: {
        name: err?.name,
        stack: err?.stack,
      },
    });
  }
});

// Helfer: einheitliches JSON + No-Cache + Version-Header
function json(payload: any, status = 200) {
  return new Response(payload ? JSON.stringify(payload) : null, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Diag-Version': 'v2',
    },
  });
}
