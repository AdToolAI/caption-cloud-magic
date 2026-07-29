import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Ingests the ElevenLabs Shared Voice Library into `public.voice_library_cache`.
 *
 * Runs nightly via pg_cron; also callable manually (admin / debug).
 *
 * Design notes (v295):
 *  - No `featured=true` hard filter: it collapsed the catalog to ~0 usable rows.
 *  - `category` is NOT used as a hard filter either; quality is stored as a
 *    ranking signal (`quality`) so professional voices float to the top.
 *  - Paging continues until `has_more === false` or MAX_PAGES is reached.
 *  - Every run is recorded in `voice_library_sync_runs`.
 */

interface SharedVoice {
  voice_id: string;
  name: string;
  accent?: string;
  gender?: string;
  age?: string;
  language?: string;
  locale?: string;
  descriptive?: string;
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

const DEFAULT_LANGUAGES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'tr'];
const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 15; // up to 1500 voices per language

const NON_NATIVE_ACCENTS_FOR_DE_ES = new Set([
  'american', 'british', 'australian', 'canadian',
  'irish', 'scottish', 'south african', 'new zealand', 'indian',
]);

function isAccentNativeFor(language: string, accent?: string | null): boolean {
  if (!accent) return true;
  const a = accent.toLowerCase().trim();
  if (language === 'de') {
    if (NON_NATIVE_ACCENTS_FOR_DE_ES.has(a)) return false;
    return a.includes('german') || a.includes('austrian') || a.includes('swiss') ||
      a === 'native' || a === 'neutral' || a === 'standard' || a === '';
  }
  if (language === 'es') {
    if (NON_NATIVE_ACCENTS_FOR_DE_ES.has(a)) return false;
    return a.includes('spanish') || a.includes('mexican') || a.includes('castilian') ||
      a.includes('latin') || a === 'native' || a === 'neutral' || a === 'standard' || a === '';
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
  if (['nl', 'dutch', 'nld'].includes(s)) return 'nl';
  if (['pl', 'pol', 'polish'].includes(s)) return 'pl';
  if (['tr', 'tur', 'turkish'].includes(s)) return 'tr';
  return s.slice(0, 2);
}

/** Quality weight so professional voices outrank generic ones. */
function qualityBoost(category?: string | null): number {
  const c = (category || '').toLowerCase();
  if (c === 'professional') return 5_000_000;
  if (c === 'high_quality') return 2_000_000;
  return 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const languages: string[] = Array.isArray(body.languages) && body.languages.length
    ? (body.languages as string[]).map((l) => String(l).toLowerCase().slice(0, 2))
    : DEFAULT_LANGUAGES;
  const maxPages: number = Math.min(50, Math.max(1, Number(body.maxPages) || DEFAULT_MAX_PAGES));
  const triggerSource = String(body.trigger ?? 'manual');
  // Wall-clock budget so the worker never hits the platform resource limit.
  const budgetMs: number = Math.min(220_000, Math.max(20_000, Number(body.budgetMs) || 120_000));
  const startedAt = Date.now();
  const outOfBudget = () => Date.now() - startedAt > budgetMs;


  let runId: string | null = null;
  try {
    const { data: run } = await admin
      .from('voice_library_sync_runs')
      .insert({ languages, trigger_source: triggerSource, status: 'running' })
      .select('id')
      .single();
    runId = run?.id ?? null;
  } catch (_) { /* non-fatal */ }

  const finish = async (
    status: string,
    fetched: number,
    upserted: number,
    error?: string,
  ) => {
    if (!runId) return;
    try {
      await admin.from('voice_library_sync_runs')
        .update({ status, fetched, upserted, error: error ?? null, finished_at: new Date().toISOString() })
        .eq('id', runId);
    } catch (_) { /* non-fatal */ }
  };

  const seen = new Set<string>();
  let totalFetched = 0;
  let upserted = 0;
  const errors: string[] = [];


  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    for (const targetLang of languages) {
      if (outOfBudget()) { errors.push('time budget reached'); break; }
      for (let page = 0; page < maxPages; page++) {
        if (outOfBudget()) { errors.push('time budget reached'); break; }

        const url = new URL('https://api.elevenlabs.io/v1/shared-voices');
        url.searchParams.set('language', targetLang);
        url.searchParams.set('page_size', String(PAGE_SIZE));
        url.searchParams.set('page', String(page));

        let res: Response;
        try {
          res = await fetch(url.toString(), { headers: { 'xi-api-key': apiKey } });
        } catch (e) {
          errors.push(`${targetLang} p${page}: fetch failed ${e}`);
          break;
        }
        if (!res.ok) {
          const txt = await res.text();
          console.warn(`[refresh-voice-library] ${targetLang} p${page} → ${res.status}: ${txt.slice(0, 200)}`);
          errors.push(`${targetLang} p${page}: HTTP ${res.status}`);
          break;
        }
        const json = await res.json();
        const voices: SharedVoice[] = json.voices || [];
        if (voices.length === 0) break;

        const pageRows: Record<string, unknown>[] = [];
        for (const v of voices) {
          totalFetched++;
          if (seen.has(v.voice_id)) continue;
          seen.add(v.voice_id);

          const accent = v.accent ?? v.labels?.accent ?? null;
          const primary = normalizeLangCode(v.language) ?? targetLang;
          const isNative = isAccentNativeFor(primary, accent);

          const supported = new Set<string>();
          if (v.verified_languages?.length) {
            for (const l of v.verified_languages) {
              const n = normalizeLangCode(l.language);
              if (n) supported.add(n);
            }
          }
          supported.add(primary);
          supported.add(targetLang);

          const popularity =
            (v.usage_character_count_1y ?? 0) +
            (v.cloned_by_count ?? 0) * 100 +
            qualityBoost(v.category) +
            (v.featured ? 1_000_000 : 0);

          pageRows.push({
            voice_id: v.voice_id,
            name: v.name,
            language: primary,
            supported_languages: Array.from(supported),
            accent,
            gender: v.gender ?? v.labels?.gender ?? null,
            age: v.age ?? v.labels?.age ?? null,
            use_case: v.use_case ?? v.labels?.use_case ?? null,
            descriptive: v.descriptive ?? v.labels?.descriptive ?? null,
            locale: v.locale ?? null,
            quality: v.category ?? null,
            description: v.description ?? null,
            preview_url: v.preview_url ?? null,
            is_native: isNative,
            popularity,
            tier: 'community',
            category: v.category ?? null,
            labels: v.labels ?? {},
            updated_at: new Date().toISOString(),
          });
        }

        // Stream-upsert page by page to stay inside the worker memory budget.
        if (pageRows.length > 0) {
          const { error } = await admin
            .from('voice_library_cache')
            .upsert(pageRows, { onConflict: 'voice_id' });
          if (error) {
            console.error('[refresh-voice-library] upsert error:', error.message);
            if (errors.length < 10) errors.push(`upsert: ${error.message}`);
          } else {
            upserted += pageRows.length;
          }
        }

        if (json.has_more === false || voices.length < PAGE_SIZE) break;
      }
    }

    console.log(`[refresh-voice-library] fetched=${totalFetched} upserted=${upserted} errors=${errors.length}`);


    const status = upserted === 0 ? 'failed' : errors.length ? 'partial' : 'ok';
    await finish(status, totalFetched, upserted, errors.slice(0, 5).join(' | ') || undefined);

    return new Response(
      JSON.stringify({ ok: upserted > 0, fetched: totalFetched, upserted, errors: errors.slice(0, 5) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[refresh-voice-library] error:', msg);
    await finish('failed', totalFetched, upserted, msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
