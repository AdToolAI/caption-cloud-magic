// Search royalty-free SFX via Pixabay Audio API.
// Pixabay also serves SFX on its audio endpoint — keyword-driven.
// Falls back to a small built-in catalog if no API key is set.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SfxRequest {
  query?: string;
  category?: string; // whoosh, impact, click, transition, ambient, ui, cinematic
  limit?: number;
}

interface SfxResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  preview_url: string;
  download_url: string;
  source: 'pixabay' | 'fallback';
  tags: string[];
}

// Tiny fallback catalog — points at freely-hostable mixkit-like sample URLs
// (these are stable, public, no-key sample SFX commonly used in demos).
const FALLBACK_SFX: SfxResult[] = [
  {
    id: 'fallback-whoosh-1',
    title: 'Whoosh Transition',
    artist: 'Mixkit',
    duration: 1,
    preview_url: 'https://assets.mixkit.co/active_storage/sfx/2566/2566-preview.mp3',
    download_url: 'https://assets.mixkit.co/active_storage/sfx/2566/2566-preview.mp3',
    source: 'fallback',
    tags: ['whoosh', 'transition'],
  },
  {
    id: 'fallback-impact-1',
    title: 'Cinematic Impact',
    artist: 'Mixkit',
    duration: 2,
    preview_url: 'https://assets.mixkit.co/active_storage/sfx/1619/1619-preview.mp3',
    download_url: 'https://assets.mixkit.co/active_storage/sfx/1619/1619-preview.mp3',
    source: 'fallback',
    tags: ['impact', 'cinematic'],
  },
  {
    id: 'fallback-click-1',
    title: 'UI Click',
    artist: 'Mixkit',
    duration: 1,
    preview_url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    download_url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
    source: 'fallback',
    tags: ['click', 'ui'],
  },
  {
    id: 'fallback-pop-1',
    title: 'Pop Notification',
    artist: 'Mixkit',
    duration: 1,
    preview_url: 'https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3',
    download_url: 'https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3',
    source: 'fallback',
    tags: ['pop', 'notification', 'ui'],
  },
  {
    id: 'fallback-success-1',
    title: 'Success Bell',
    artist: 'Mixkit',
    duration: 2,
    preview_url: 'https://assets.mixkit.co/active_storage/sfx/1822/1822-preview.mp3',
    download_url: 'https://assets.mixkit.co/active_storage/sfx/1822/1822-preview.mp3',
    source: 'fallback',
    tags: ['success', 'bell', 'positive'],
  },
];

function filterFallback(query: string, category: string): SfxResult[] {
  const q = (query + ' ' + category).toLowerCase().trim();
  if (!q) return FALLBACK_SFX;
  return FALLBACK_SFX.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    s.tags.some((t) => q.includes(t) || t.includes(q))
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: SfxRequest = req.method === 'POST' ? await req.json() : {};
    const query = (body.query ?? '').trim();
    const category = (body.category ?? '').trim();
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

    const PIXABAY_KEY = Deno.env.get('PIXABAY_API_KEY');

    // No API key → return curated fallback SFX
    if (!PIXABAY_KEY) {
      const results = filterFallback(query, category).slice(0, limit);
      return new Response(
        JSON.stringify({ ok: true, results, source: 'fallback', count: results.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const q = encodeURIComponent([query, category].filter(Boolean).join(' ') || 'sound effect');
    const url = `https://pixabay.com/api/audio/?key=${PIXABAY_KEY}&q=${q}&per_page=${limit}&safesearch=true`;

    const resp = await fetch(url);
    if (!resp.ok) {
      // graceful fallback on Pixabay error
      const results = filterFallback(query, category).slice(0, limit);
      return new Response(
        JSON.stringify({ ok: true, results, source: 'fallback', count: results.length, note: 'pixabay_error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await resp.json();
    const hits = Array.isArray(data?.hits) ? data.hits : [];

    const results: SfxResult[] = hits.map((h: any) => ({
      id: String(h.id),
      title: h.tags?.split(',')[0]?.trim() || 'Sound Effect',
      artist: h.user || 'Pixabay',
      duration: Number(h.duration) || 0,
      preview_url: h.audio || h.preview || '',
      download_url: h.audio || '',
      source: 'pixabay' as const,
      tags: (h.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
    })).filter((r: SfxResult) => !!r.preview_url);

    return new Response(
      JSON.stringify({ ok: true, results, source: 'pixabay', count: results.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('search-stock-sfx error:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
