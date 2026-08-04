import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('PEXELS_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ code: 'MISSING_KEY', results: [] }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? '').slice(0, 120).trim();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Suchbegriff fehlt' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24&orientation=square`,
      { headers: { Authorization: key } },
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Stock-Suche fehlgeschlagen' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const json = await res.json();
    const results = (json?.photos ?? []).map((p: Record<string, any>) => ({
      url: p?.src?.large2x ?? p?.src?.large,
      preview: p?.src?.medium,
      credit: `Foto: ${p?.photographer ?? 'Pexels'}`,
    }));

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
