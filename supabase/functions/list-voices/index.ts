import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
    language_id: string;
    name?: string;
  }>;
  category?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const { language } = await req.json().catch(() => ({ language: 'all' }));

    console.log('Fetching voices from ElevenLabs API...');

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();
    const voices = data.voices || [];

    console.log(`Fetched ${voices.length} voices from ElevenLabs`);

    // Debug: Log first 2 voices to see structure
    if (voices.length > 0) {
      console.log('Sample voice data:', JSON.stringify(voices.slice(0, 2), null, 2));
    }

    // Map and detect languages with 3-stage approach
    const mappedVoices = voices.map((voice: ElevenLabsVoice) => {
      const accent = voice.labels?.accent || '';
      const description = voice.labels?.description || '';
      const labelLanguage = voice.labels?.language || '';
      
      // Support for multiple languages
      const supportedLanguages: string[] = [];
      
      // Stage 1: Check verified_languages (most reliable)
      if (voice.verified_languages && voice.verified_languages.length > 0) {
        console.log(`Voice ${voice.name} verified_languages:`, voice.verified_languages);
        
        for (const lang of voice.verified_languages) {
          const langId = lang.language_id.toLowerCase();
          if (langId === 'de' || langId === 'ger' || langId === 'german') {
            if (!supportedLanguages.includes('de')) {
              supportedLanguages.push('de');
            }
          }
          if (langId === 'en' || langId === 'eng' || langId === 'english') {
            if (!supportedLanguages.includes('en')) {
              supportedLanguages.push('en');
            }
          }
        }
      }
      
      // Stage 2: Check labels.language if no verified_languages
      if (supportedLanguages.length === 0 && labelLanguage) {
        const lang = labelLanguage.toLowerCase();
        if (lang.includes('german') || lang.includes('deutsch') || lang === 'de') {
          supportedLanguages.push('de');
        } else if (lang.includes('english') || lang === 'en') {
          supportedLanguages.push('en');
        }
      }
      
      // Stage 3: Fallback to accent/description detection
      if (supportedLanguages.length === 0) {
        const lowerAccent = accent.toLowerCase();
        const lowerDesc = description.toLowerCase();
        
        if (lowerAccent.includes('german') || lowerDesc.includes('german') || 
            lowerAccent.includes('deutsch') || lowerDesc.includes('deutsch')) {
          supportedLanguages.push('de');
        } else if (lowerAccent.includes('english') || lowerAccent.includes('american') || 
                   lowerAccent.includes('british') || lowerAccent.includes('australian')) {
          supportedLanguages.push('en');
        } else {
          // Default to English if no language detected
          supportedLanguages.push('en');
        }
      }

      // Primary language is the first one
      const primaryLanguage = supportedLanguages[0];

      return {
        id: voice.voice_id,
        name: voice.name,
        language: primaryLanguage,
        supportedLanguages: supportedLanguages,
        accent: accent || 'neutral',
        gender: voice.labels?.gender || 'neutral',
        age: voice.labels?.age || 'adult',
        description: description,
      };
    });

    // Filter by language if specified
    const filteredVoices = language !== 'all'
      ? mappedVoices.filter((v: any) => v.supportedLanguages.includes(language))
      : mappedVoices;

    console.log(`Returning ${filteredVoices.length} voices (filter: ${language})`);
    
    // Debug: Log language distribution
    const langCounts = filteredVoices.reduce((acc: any, v: any) => {
      acc[v.language] = (acc[v.language] || 0) + 1;
      return acc;
    }, {});
    console.log('Language distribution:', langCounts);

    return new Response(
      JSON.stringify({ voices: filteredVoices }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in list-voices function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        voices: [] 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
