import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: {
    accent?: string;
    description?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
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

    // Map and filter voices
    const mappedVoices = voices.map((voice: ElevenLabsVoice) => {
      const accent = voice.labels?.accent || '';
      const description = voice.labels?.description || '';
      
      // Detect language from accent or description
      let detectedLanguage = 'en';
      const lowerAccent = accent.toLowerCase();
      const lowerDesc = description.toLowerCase();
      
      if (lowerAccent.includes('german') || lowerDesc.includes('german') || 
          lowerAccent.includes('deutsch') || lowerDesc.includes('deutsch')) {
        detectedLanguage = 'de';
      } else if (lowerAccent.includes('english') || lowerAccent.includes('american') || 
                 lowerAccent.includes('british') || lowerAccent.includes('australian')) {
        detectedLanguage = 'en';
      }

      return {
        id: voice.voice_id,
        name: voice.name,
        language: detectedLanguage,
        accent: accent || 'neutral',
        gender: voice.labels?.gender || 'neutral',
        age: voice.labels?.age || 'adult',
        description: description,
      };
    });

    // Filter by language if specified
    const filteredVoices = language !== 'all'
      ? mappedVoices.filter((v: any) => v.language === language)
      : mappedVoices;

    console.log(`Returning ${filteredVoices.length} voices (filter: ${language})`);

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
