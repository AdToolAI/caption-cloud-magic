import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

/**
 * Refreshes the `voice_library_cache` table from ElevenLabs Shared Voice Library.
 * Meant to run daily via pg_cron. Also callable manually by an admin.
 *
 * Strategy:
 *   1. For each target language (de, en, es) fetch pages of /v1/shared-voices
 *      filtered by featured=true + category=professional (highest quality tier).
 *   2. Normalize + upsert into public.voice_library_cache.
 *   3. Track supported_languages across languages so a bilingual voice
 *      appears in DE and EN filters.
 */

interface SharedVoice {
  voice_id: string;
  name: string;
  accent?: string;
  gender?: string;
  age?: string;
  language?: string;
  use_case?: string;
  description?: string;
  preview_url?: string;
  category?: string;
  labels?: Record<string, string>;
  verified_languages?: Array<{ language: string; accent?: string; locale?: string }>;
  usage_character_count_1y?: number;
  cloned_by_count?: number;
  featured?: boolean;
}

const LANGUAGES = ['de', 'en', 'es'] as const;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_LANG = 5; // → up to 500 professional voices per language

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

function normalizeLangCode(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (['de', 'ger', 'deu', 'german', 'deutsch'].includes(s)) return 'de';
  if (['en', 'eng', 'english'].includes(s)) return 'en';
  if (['es', 'spa', 'spanish', 'español', 'espanol'].includes(s)) return 'es';
  if (['fr', 'fra', 'french', 'français'].includes(s)) return 'fr';
  if (['it', 'ita', 'italian'].includes(s)) return 'it';
  if (['pt', 'por', 'portuguese'].includes(s)) return 'pt';
  if (['nl', 'dutch'].includes(s)) return 'nl';
  return s.slice(0, 2);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // voice_id → normalized cache row (deduped across per-language fetches)
    const byId = new Map<string, {
      voice_id: string;
      name: string;
      language: string;
      supported_languages: string[];
      accent: string | null;
      gender: string | null;
      age: string | null;
      use_case: string | null;
      description: string | null;
      preview_url: string | null;
      is_native: boolean;
      popularity: number;
      tier: string;
      category: string | null;
      labels: Record<string, unknown>;
    }>();

    let totalFetched = 0;

    for (const targetLang of LANGUAGES) {
      for (let page = 0; page < MAX_PAGES_PER_LANG; page++) {
        const url = new URL('https://api.elevenlabs.io/v1/shared-voices');
        url.searchParams.set('language', targetLang);
        url.searchParams.set('page_size', String(PAGE_SIZE));
        url.searchParams.set('page', String(page));
        url.searchParams.set('featured', 'true');
        url.searchParams.set('category', 'professional');

        const res = await fetch(url.toString(), { headers: { 'xi-api-key': apiKey } });
        if (!res.ok) {
          console.warn(`[refresh-voice-library] ${targetLang} page ${page} → ${res.status}: ${await res.text()}`);
          break;
        }
        const json = await res.json();
        const voices: SharedVoice[] = json.voices || [];
        if (voices.length === 0) break;

        for (const v of voices) {
          totalFetched++;
          const accent = v.accent ?? v.labels?.accent ?? null;
          const isNative = isAccentNativeFor(targetLang, accent);

          const supported = new Set<string>();
          if (v.verified_languages?.length) {
            for (const l of v.verified_languages) {
              const n = normalizeLangCode(l.language);
              if (n) supported.add(n);
            }
          }
          if (supported.size === 0) supported.add(targetLang);
          else supported.add(targetLang);

          const existing = byId.get(v.voice_id);
          const popularity = (v.usage_character_count_1y ?? 0) + (v.cloned_by_count ?? 0) * 100;

          if (existing) {
            for (const l of supported) if (!existing.supported_languages.includes(l)) existing.supported_languages.push(l);
            existing.is_native = existing.is_native || isNative;
            existing.popularity = Math.max(existing.popularity, popularity);
          } else {
            byId.set(v.voice_id, {
              voice_id: v.voice_id,
              name: v.name,
              language: targetLang,
              supported_languages: Array.from(supported),
              accent,
              gender: v.gender ?? v.labels?.gender ?? null,
              age: v.age ?? v.labels?.age ?? null,
              use_case: v.use_case ?? v.labels?.use_case ?? null,
              description: v.description ?? null,
              preview_url: v.preview_url ?? null,
              is_native: isNative,
              popularity,
              tier: 'community',
              category: v.category ?? null,
              labels: v.labels ?? {},
            });
          }
        }

        if (voices.length < PAGE_SIZE) break;
      }
    }

    const rows = Array.from(byId.values());
    console.log(`[refresh-voice-library] fetched=${totalFetched} unique=${rows.length}`);

    // Chunked upsert
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
      const { error } = await admin.from('voice_library_cache').upsert(chunk, { onConflict: 'voice_id' });
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, fetched: totalFetched, upserted: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[refresh-voice-library] error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
