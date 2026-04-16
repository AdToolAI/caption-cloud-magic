import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { PREMIUM_VOICES } from '../_shared/premium-voices.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: {
    language?: string;
    accent?: string;
    description?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
  verified_languages?: Array<{
    language: string;
    model_id?: string;
    accent?: string;
    locale?: string;
    preview_url?: string;
  }>;
  category?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const { language } = await req.json().catch(() => ({ language: 'all' }));

    // ----- 1. Build curated premium voices (always included) -----
    const premiumMapped = PREMIUM_VOICES.map((v) => ({
      id: v.id,
      name: v.name,
      language: v.language,
      supportedLanguages: [v.language],
      accent: v.accent || 'neutral',
      gender: v.gender,
      age: v.age,
      description: v.description,
      tier: 'premium' as const,
      recommended_model: v.recommended_model,
      recommended_settings: v.recommended_settings,
    }));

    // ----- 2. Fetch user's own ElevenLabs voices -----
    let accountVoices: any[] = [];
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        const voices: ElevenLabsVoice[] = data.voices || [];

        accountVoices = voices.map((voice) => {
          const accent = voice.labels?.accent || '';
          const description = voice.labels?.description || '';
          const labelLanguage = voice.labels?.language || '';
          const supportedLanguages: string[] = [];

          if (voice.verified_languages?.length) {
            for (const lang of voice.verified_languages) {
              const langId = (lang.language || '').toLowerCase();
              if (['de', 'ger', 'german'].includes(langId) && !supportedLanguages.includes('de')) supportedLanguages.push('de');
              if (['en', 'eng', 'english'].includes(langId) && !supportedLanguages.includes('en')) supportedLanguages.push('en');
              if (['es', 'spa', 'spanish'].includes(langId) && !supportedLanguages.includes('es')) supportedLanguages.push('es');
            }
          }
          if (supportedLanguages.length === 0 && labelLanguage) {
            const lang = labelLanguage.toLowerCase();
            if (lang.includes('german') || lang.includes('deutsch') || lang === 'de') supportedLanguages.push('de');
            else if (lang.includes('english') || lang === 'en') supportedLanguages.push('en');
            else if (lang.includes('spanish') || lang.includes('español') || lang === 'es') supportedLanguages.push('es');
          }
          if (supportedLanguages.length === 0) {
            const a = (accent + ' ' + description).toLowerCase();
            if (a.includes('german') || a.includes('deutsch')) supportedLanguages.push('de');
            else if (a.includes('spanish') || a.includes('español')) supportedLanguages.push('es');
            else supportedLanguages.push('en');
          }

          const tier: 'standard' | 'custom' = voice.category === 'cloned' || voice.category === 'generated' ? 'custom' : 'standard';

          return {
            id: voice.voice_id,
            name: voice.name,
            language: supportedLanguages[0],
            supportedLanguages,
            accent: accent || 'neutral',
            gender: voice.labels?.gender || 'neutral',
            age: voice.labels?.age || 'adult',
            description,
            tier,
            recommended_model: 'eleven_multilingual_v2',
            recommended_settings: {
              stability: 0.4,
              similarity_boost: 0.8,
              style: 0.3,
              use_speaker_boost: true,
            },
          };
        });
      } else {
        console.warn('ElevenLabs /v1/voices returned', response.status);
      }
    } catch (err) {
      console.warn('Failed to fetch account voices, using premium-only:', err);
    }

    // ----- 3. Merge: premium first, dedupe by id -----
    const seen = new Set(premiumMapped.map((v) => v.id));
    const uniqueAccountVoices = accountVoices.filter((v) => !seen.has(v.id));
    const all = [...premiumMapped, ...uniqueAccountVoices];

    // ----- 4. Filter by language if requested -----
    const filtered = language && language !== 'all'
      ? all.filter((v: any) => v.supportedLanguages.includes(language))
      : all;

    console.log(`[list-voices] Returning ${filtered.length} voices (premium: ${premiumMapped.length}, account: ${uniqueAccountVoices.length}, filter: ${language})`);

    return new Response(JSON.stringify({ voices: filtered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in list-voices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage, voices: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
