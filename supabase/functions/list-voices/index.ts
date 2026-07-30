import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { PREMIUM_VOICES } from '../_shared/premium-voices.ts';
import { isQaMockRequest, qaMockJson } from '../_shared/qaMock.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface CacheRow {
  voice_id: string;
  name: string;
  language: string;
  supported_languages: string[] | null;
  accent: string | null;
  gender: string | null;
  age: string | null;
  use_case: string | null;
  descriptive: string | null;
  description: string | null;
  preview_url: string | null;
  is_native: boolean | null;
  popularity: number | null;
  quality: string | null;
  category: string | null;
}

function mapRow(r: CacheRow) {
  return {
    id: r.voice_id,
    name: r.name,
    language: r.language,
    supportedLanguages: r.supported_languages ?? [r.language],
    accent: r.accent,
    gender: r.gender,
    age: r.age,
    use_case: r.use_case,
    description: r.description || r.descriptive,
    preview_url: r.preview_url,
    is_native: r.is_native ?? true,
    popularity: Number(r.popularity ?? 0),
    tier: (r.quality === 'professional' ? 'premium' : 'community') as 'premium' | 'community',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: 'list-voices' });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const language: string = (body.language || 'all').toString().toLowerCase();
    const gender: string | null = body.gender || null;
    const accent: string | null = body.accent || null;
    const age: string | null = body.age || null;
    const useCases: string[] = Array.isArray(body.use_case)
      ? body.use_case.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
      : typeof body.use_case === 'string' && body.use_case.length > 0
        ? [body.use_case]
        : [];
    const search: string = (body.search || '').toString().trim();
    const nativeOnly: boolean =
      typeof body.nativeOnly === 'boolean'
        ? body.nativeOnly
        : language === 'de' || language === 'es';
    const page = Math.max(0, parseInt(body.page ?? '0', 10) || 0);
    const pageSize = Math.min(200, Math.max(10, parseInt(body.pageSize ?? '50', 10) || 50));
    const sort: 'popularity' | 'name' | 'newest' =
      body.sort === 'name' || body.sort === 'newest' ? body.sort : 'popularity';
    const withFacets = body.facets === true;

    // ---- Curated premium voices, pinned to the first page ----
    const premium = PREMIUM_VOICES
      .filter((v) => language === 'all' || v.language === language)
      .filter((v) => !gender || v.gender === gender)
      .filter((v) => !search || v.name.toLowerCase().includes(search.toLowerCase()))
      .map((v) => ({
        id: v.id,
        name: v.name,
        language: v.language,
        supportedLanguages: [v.language],
        accent: v.accent || 'native',
        gender: v.gender,
        age: v.age,
        use_case: (v as { use_case?: string }).use_case ?? null,
        description: v.description,
        preview_url: (v as { preview_url?: string }).preview_url ?? null,
        is_native: true,
        popularity: 10_000_000,
        tier: 'premium' as const,
        recommended_model: v.recommended_model,
        recommended_settings: v.recommended_settings,
      }));
    const premiumIds = new Set(premium.map((v) => v.id));

    // ---- SQL-backed community catalogue ----
    let q = admin
      .from('voice_library_cache')
      .select(
        'voice_id,name,language,supported_languages,accent,gender,age,use_case,descriptive,description,preview_url,is_native,popularity,quality,category',
        { count: 'exact' },
      );

    if (language !== 'all') q = q.contains('supported_languages', [language]);
    if (nativeOnly) q = q.eq('is_native', true);
    if (gender) q = q.eq('gender', gender);
    if (accent) q = q.ilike('accent', `%${accent}%`);
    if (age) q = q.eq('age', age);
    if (useCases.length === 1) q = q.eq('use_case', useCases[0]);
    else if (useCases.length > 1) q = q.in('use_case', useCases);
    if (search) {
      const esc = search.replace(/[,%()]/g, ' ');
      q = q.or(`name.ilike.%${esc}%,description.ilike.%${esc}%,descriptive.ilike.%${esc}%`);
    }

    if (sort === 'name') q = q.order('name', { ascending: true });
    else if (sort === 'newest') q = q.order('updated_at', { ascending: false });
    else q = q.order('popularity', { ascending: false, nullsFirst: false });

    const from = page * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);
    if (error) throw error;

    const community = (data as CacheRow[] ?? [])
      .filter((r) => !premiumIds.has(r.voice_id))
      .map(mapRow);

    const voices = page === 0 ? [...premium, ...community] : community;
    const total = (count ?? 0) + (page === 0 ? premium.length : 0);

    let facets: unknown = undefined;
    if (withFacets) {
      const { data: f } = await admin.rpc('voice_library_facets', {
        _language: language,
        _native_only: nativeOnly,
        _search: search,
      });
      facets = f ?? null;
    }

    return new Response(
      JSON.stringify({
        voices,
        total,
        nativeCount: nativeOnly ? total : undefined,
        hasMore: from + pageSize < (count ?? 0),
        page,
        pageSize,
        facets,
        source: 'cache',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[list-voices] error:', msg);
    return new Response(JSON.stringify({ error: msg, voices: [], total: 0, hasMore: false }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
