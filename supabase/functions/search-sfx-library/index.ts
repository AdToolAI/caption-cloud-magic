// Unified SFX search across Pixabay + Freesound with 24h DB cache.
// Falls back to a small built-in catalog if no provider keys are set.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SfxResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  preview_url: string;
  download_url: string;
  source: 'pixabay' | 'freesound' | 'fallback';
  tags: string[];
  license?: string;
}

const FALLBACK_SFX: SfxResult[] = [
  { id: 'fb-whoosh-1', title: 'Whoosh Transition', artist: 'Mixkit', duration: 1, preview_url: 'https://assets.mixkit.co/active_storage/sfx/2566/2566-preview.mp3', download_url: 'https://assets.mixkit.co/active_storage/sfx/2566/2566-preview.mp3', source: 'fallback', tags: ['whoosh','transition'], license: 'Mixkit Free' },
  { id: 'fb-impact-1', title: 'Cinematic Impact', artist: 'Mixkit', duration: 2, preview_url: 'https://assets.mixkit.co/active_storage/sfx/1619/1619-preview.mp3', download_url: 'https://assets.mixkit.co/active_storage/sfx/1619/1619-preview.mp3', source: 'fallback', tags: ['impact','cinematic'], license: 'Mixkit Free' },
  { id: 'fb-click-1', title: 'UI Click', artist: 'Mixkit', duration: 1, preview_url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', download_url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', source: 'fallback', tags: ['click','ui'], license: 'Mixkit Free' },
  { id: 'fb-pop-1', title: 'Pop Notification', artist: 'Mixkit', duration: 1, preview_url: 'https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3', download_url: 'https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3', source: 'fallback', tags: ['pop','notification'], license: 'Mixkit Free' },
  { id: 'fb-success-1', title: 'Success Bell', artist: 'Mixkit', duration: 2, preview_url: 'https://assets.mixkit.co/active_storage/sfx/1822/1822-preview.mp3', download_url: 'https://assets.mixkit.co/active_storage/sfx/1822/1822-preview.mp3', source: 'fallback', tags: ['success','bell'], license: 'Mixkit Free' },
];

function filterFallback(query: string, category: string): SfxResult[] {
  const q = (query + ' ' + category).toLowerCase().trim();
  if (!q) return FALLBACK_SFX;
  return FALLBACK_SFX.filter((s) =>
    s.title.toLowerCase().includes(q) ||
    s.tags.some((t) => q.includes(t) || t.includes(q))
  );
}

async function searchPixabay(query: string, limit: number, key: string): Promise<SfxResult[]> {
  const url = `https://pixabay.com/api/audio/?key=${key}&q=${encodeURIComponent(query || 'sound effect')}&per_page=${limit}&safesearch=true`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map((h: any) => ({
    id: `pixabay-${h.id}`,
    title: h.tags?.split(',')[0]?.trim() || 'Sound Effect',
    artist: h.user || 'Pixabay',
    duration: Number(h.duration) || 0,
    preview_url: h.audio || h.preview || '',
    download_url: h.audio || '',
    source: 'pixabay' as const,
    tags: (h.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
    license: 'Pixabay Content License',
  })).filter((r: SfxResult) => !!r.preview_url);
}

async function searchFreesound(query: string, limit: number, key: string): Promise<SfxResult[]> {
  const fields = 'id,name,username,duration,previews,tags,license';
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query || 'sfx')}&page_size=${limit}&fields=${fields}&token=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map((r: any) => ({
    id: `freesound-${r.id}`,
    title: r.name || 'Sound',
    artist: r.username || 'Freesound',
    duration: Number(r.duration) || 0,
    preview_url: r.previews?.['preview-hq-mp3'] || r.previews?.['preview-lq-mp3'] || '',
    download_url: r.previews?.['preview-hq-mp3'] || '',
    source: 'freesound' as const,
    tags: Array.isArray(r.tags) ? r.tags : [],
    license: r.license || 'Creative Commons',
  })).filter((r: SfxResult) => !!r.preview_url);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json() : {};
    const query = String(body.query ?? '').trim();
    const category = String(body.category ?? '').trim();
    const limit = Math.min(Math.max(Number(body.limit) || 24, 1), 50);

    const cacheKey = `sfx:${query}|${category}|${limit}`.toLowerCase();

    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // 1) DB cache hit
    const { data: cached } = await supa
      .from('sfx_library_cache')
      .select('results, expires_at, source')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(
        JSON.stringify({ ok: true, results: cached.results, source: cached.source, cached: true, count: (cached.results as any[]).length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PIXABAY_KEY = Deno.env.get('PIXABAY_API_KEY');
    const FREESOUND_KEY = Deno.env.get('FREESOUND_API_KEY');
    const rawTerm = [query, category].filter(Boolean).join(' ').trim();
    // Default term so empty page-load returns real sounds instead of fallbacks
    const searchTerm = rawTerm || 'sound effect';

    const promises: Promise<SfxResult[]>[] = [];
    if (PIXABAY_KEY) promises.push(searchPixabay(searchTerm, Math.ceil(limit / 2), PIXABAY_KEY));
    if (FREESOUND_KEY) promises.push(searchFreesound(searchTerm, Math.ceil(limit / 2), FREESOUND_KEY));

    let results: SfxResult[] = [];
    let sourceLabel = 'mixed';

    if (promises.length === 0) {
      results = filterFallback(query, category).slice(0, limit);
      sourceLabel = 'fallback';
    } else {
      const settled = await Promise.allSettled(promises);
      for (const s of settled) {
        if (s.status === 'fulfilled') results.push(...s.value);
      }
      // Interleave so providers are mixed
      results = results.slice(0, limit);
      if (results.length === 0) {
        results = filterFallback(query, category).slice(0, limit);
        sourceLabel = 'fallback';
      }
    }

    // Cache (best effort) — never poison cache with fallback results
    try {
      if (sourceLabel !== 'fallback') await supa.from('sfx_library_cache').upsert({
        cache_key: cacheKey,
        query,
        category: category || null,
        source: sourceLabel,
        results,
        result_count: results.length,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' });
    } catch (e) {
      console.warn('sfx cache write failed:', e);
    }

    return new Response(
      JSON.stringify({ ok: true, results, source: sourceLabel, cached: false, count: results.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('search-sfx-library error:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
