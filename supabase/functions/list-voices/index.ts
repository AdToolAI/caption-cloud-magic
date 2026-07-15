import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { PREMIUM_VOICES } from '../_shared/premium-voices.ts';

import { isQaMockRequest, qaMockJson } from '../_shared/qaMock.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const NON_NATIVE_ACCENTS_FOR_DE_ES = new Set([
  'american', 'british', 'australian', 'canadian',
  'irish', 'scottish', 'south african', 'new zealand', 'indian',
]);

function isAccentNativeFor(language: string, accent?: string | null): boolean {
  if (!accent) return true;
  const a = accent.toLowerCase().trim();
  if (language === 'de') {
    if (NON_NATIVE_ACCENTS_FOR_DE_ES.has(a)) return false;
    return a.includes('german') || a.includes('austrian') || a.includes('swiss') || a === 'native' || a === 'neutral' || a === '';
  }
  if (language === 'es') {
    if (NON_NATIVE_ACCENTS_FOR_DE_ES.has(a)) return false;
    return a.includes('spanish') || a.includes('mexican') || a.includes('castilian') || a.includes('latin') || a === 'native' || a === 'neutral' || a === '';
  }
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (isQaMockRequest(req)) return qaMockJson(corsHeaders, { fn: 'list-voices' });

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const language: string = body.language || 'all';
    const gender: string | null = body.gender || null;
    const accent: string | null = body.accent || null;
    const age: string | null = body.age || null;
    const useCase: string | null = body.use_case || null;
    const search: string = (body.search || '').toString().toLowerCase().trim();
    // Native-only defaults ON for DE/ES; can be overridden explicitly.
    const nativeOnly: boolean =
      typeof body.nativeOnly === 'boolean'
        ? body.nativeOnly
        : language === 'de' || language === 'es';
    const page: number = Math.max(0, parseInt(body.page ?? '0', 10) || 0);
    const pageSize: number = Math.min(200, Math.max(10, parseInt(body.pageSize ?? '50', 10) || 50));
    const sort: 'popularity' | 'name' | 'newest' = body.sort === 'name' || body.sort === 'newest' ? body.sort : 'popularity';

    // ----- 1. Curated premium voices (always included, native-safe) -----
    const premiumRaw = PREMIUM_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      supportedLanguages: [v.language],
      accent: v.accent || 'native',
      gender: v.gender,
      age: v.age,
      description: v.description,
      use_case: (v as { use_case?: string }).use_case ?? null,
      preview_url: (v as { preview_url?: string }).preview_url ?? null,
      is_native: true,
      popularity: 1_000_000, // ensure premium ranks above community
      tier: 'premium' as const,
      recommended_model: v.recommended_model,
      recommended_settings: v.recommended_settings,
    }));

    const byId = new Map<string, typeof premiumRaw[number]>();
    for (const v of premiumRaw) {
      const existing = byId.get(v.id);
      if (!existing) {
        byId.set(v.id, { ...v, supportedLanguages: [...v.supportedLanguages] });
        continue;
      }
      for (const lang of v.supportedLanguages) {
        if (!existing.supportedLanguages.includes(lang)) existing.supportedLanguages.push(lang);
      }
      if (language && language !== 'all' && v.language === language && existing.language !== language) {
        existing.name = v.name;
        existing.language = v.language;
        existing.accent = v.accent;
        existing.description = v.description;
        existing.recommended_settings = v.recommended_settings;
      }
    }
    const premiumMapped = Array.from(byId.values());

    // ----- 2. Workspace account voices (real ElevenLabs library) -----
    let accountVoices: Array<Record<string, unknown>> = [];
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        const voices = (data.voices || []) as Array<{
          voice_id: string;
          name: string;
          category?: string;
          labels?: Record<string, string>;
          verified_languages?: Array<{ language: string; accent?: string }>;
          preview_url?: string;
          description?: string;
        }>;
        accountVoices = voices.map((voice) => {
          const acc = voice.labels?.accent || '';
          const description = voice.labels?.description || voice.description || '';
          const labelLanguage = voice.labels?.language || '';
          const supportedLanguages: string[] = [];
          if (voice.verified_languages?.length) {
            for (const l of voice.verified_languages) {
              const id = (l.language || '').toLowerCase();
              if (['de', 'ger', 'german'].includes(id) && !supportedLanguages.includes('de')) supportedLanguages.push('de');
              if (['en', 'eng', 'english'].includes(id) && !supportedLanguages.includes('en')) supportedLanguages.push('en');
              if (['es', 'spa', 'spanish'].includes(id) && !supportedLanguages.includes('es')) supportedLanguages.push('es');
            }
          }
          if (supportedLanguages.length === 0 && labelLanguage) {
            const l = labelLanguage.toLowerCase();
            if (l.includes('german') || l.includes('deutsch') || l === 'de') supportedLanguages.push('de');
            else if (l.includes('spanish') || l.includes('español') || l === 'es') supportedLanguages.push('es');
            else if (l.includes('english') || l === 'en') supportedLanguages.push('en');
          }
          if (supportedLanguages.length === 0) supportedLanguages.push('en');

          const tier: 'standard' | 'custom' = voice.category === 'cloned' || voice.category === 'generated' ? 'custom' : 'standard';
          const primaryLang = supportedLanguages[0];
          return {
            id: voice.voice_id,
            name: voice.name,
            language: primaryLang,
            supportedLanguages,
            accent: acc || 'native',
            gender: voice.labels?.gender || 'neutral',
            age: voice.labels?.age || 'adult',
            description,
            use_case: voice.labels?.use_case || null,
            preview_url: voice.preview_url || null,
            is_native: isAccentNativeFor(primaryLang, acc),
            popularity: 500_000,
            tier,
            recommended_model: 'eleven_multilingual_v2',
            recommended_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
          };
        });
      } else {
        console.warn('ElevenLabs /v1/voices returned', response.status);
      }
    } catch (err) {
      console.warn('Failed to fetch account voices:', err);
    }

    // ----- 2b. Upgrade tier for user's cloned voices -----
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization');
      if (SUPABASE_URL && SUPABASE_ANON && authHeader) {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: cloned } = await userClient
          .from('custom_voices')
          .select('elevenlabs_voice_id, name, language, is_active')
          .eq('is_active', true);
        if (cloned && cloned.length > 0) {
          const clonedIds = new Map(cloned.map((c: { elevenlabs_voice_id: string }) => [c.elevenlabs_voice_id, c]));
          accountVoices = accountVoices.map((v) => {
            if (clonedIds.has(v.id as string)) return { ...v, tier: 'cloned', isMine: true, popularity: 10_000_000 };
            return v;
          });
        }
      }
    } catch (e) {
      console.warn('[list-voices] custom_voices lookup failed (non-fatal):', e);
    }

    // ----- 3. Community library from cache -----
    let communityVoices: Array<Record<string, unknown>> = [];
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
      const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (SUPABASE_URL && SERVICE_ROLE) {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        let query = admin.from('voice_library_cache').select('*').order('popularity', { ascending: false }).limit(1000);
        if (language && language !== 'all') query = query.contains('supported_languages', [language]);
        if (nativeOnly) query = query.eq('is_native', true);
        const { data: cache } = await query;
        if (cache && cache.length > 0) {
          communityVoices = cache.map((row: Record<string, unknown>) => ({
            id: row.voice_id,
            name: row.name,
            language: row.language,
            supportedLanguages: (row.supported_languages as string[]) || [row.language],
            accent: row.accent || 'native',
            gender: row.gender || 'neutral',
            age: row.age || 'adult',
            description: row.description || '',
            use_case: row.use_case || null,
            preview_url: row.preview_url || null,
            is_native: !!row.is_native,
            popularity: (row.popularity as number) || 0,
            tier: 'community',
            recommended_model: 'eleven_multilingual_v2',
            recommended_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
          }));
        }
      }
    } catch (e) {
      console.warn('[list-voices] cache lookup failed (non-fatal):', e);
    }

    // ----- 4. Merge & dedupe (premium > account > community) -----
    const seen = new Set(premiumMapped.map((v) => v.id));
    const uniqueAccount = accountVoices.filter((v) => !seen.has(v.id as string));
    for (const v of uniqueAccount) seen.add(v.id as string);
    const uniqueCommunity = communityVoices.filter((v) => !seen.has(v.id as string));

    let all: Array<Record<string, unknown>> = [
      ...premiumMapped,
      ...uniqueAccount,
      ...uniqueCommunity,
    ];

    // ----- 5. Filters -----
    if (language && language !== 'all') {
      all = all.filter((v) => (v.supportedLanguages as string[]).includes(language));
    }
    if (nativeOnly && (language === 'de' || language === 'es')) {
      all = all.filter((v) => v.is_native !== false && isAccentNativeFor(language, v.accent as string | undefined));
    }
    if (gender) all = all.filter((v) => String(v.gender || '').toLowerCase() === gender.toLowerCase());
    if (accent) all = all.filter((v) => String(v.accent || '').toLowerCase().includes(accent.toLowerCase()));
    if (age) all = all.filter((v) => String(v.age || '').toLowerCase().includes(age.toLowerCase()));
    if (useCase) all = all.filter((v) => String(v.use_case || '').toLowerCase().includes(useCase.toLowerCase()));
    if (search) {
      all = all.filter((v) =>
        String(v.name || '').toLowerCase().includes(search) ||
        String(v.description || '').toLowerCase().includes(search) ||
        String(v.accent || '').toLowerCase().includes(search),
      );
    }

    // ----- 6. Sort -----
    all.sort((a, b) => {
      if (sort === 'name') return String(a.name).localeCompare(String(b.name));
      // popularity default
      const tierWeight = (t: string) => t === 'cloned' ? 0 : t === 'premium' ? 1 : t === 'standard' ? 2 : 3;
      const ta = tierWeight(a.tier as string);
      const tb = tierWeight(b.tier as string);
      if (ta !== tb) return ta - tb;
      return ((b.popularity as number) || 0) - ((a.popularity as number) || 0);
    });

    const total = all.length;
    const nativeCount = all.filter((v) => v.is_native !== false).length;
    const start = page * pageSize;
    const paged = all.slice(start, start + pageSize);
    const hasMore = start + pageSize < total;

    console.log(`[list-voices] lang=${language} native=${nativeOnly} total=${total} native=${nativeCount} page=${page} returned=${paged.length}`);

    return new Response(
      JSON.stringify({ voices: paged, total, nativeCount, hasMore, page, pageSize }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in list-voices:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', voices: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
