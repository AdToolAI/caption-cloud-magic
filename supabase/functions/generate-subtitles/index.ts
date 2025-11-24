import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl } = await req.json();

    if (!audioUrl) {
      throw new Error('Audio URL is required');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    // Download audio from Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract storage path from URL
    const urlParts = audioUrl.split('/storage/v1/object/public/voiceover-audio/');
    const storagePath = urlParts[1];

    const { data: audioData, error: downloadError } = await supabase.storage
      .from('voiceover-audio')
      .download(storagePath);

    if (downloadError) {
      throw new Error(`Failed to download audio: ${downloadError.message}`);
    }

    // Convert blob to array buffer
    const audioBuffer = await audioData.arrayBuffer();

    // Create form data for ElevenLabs Speech-to-Text API
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
    formData.append('model_id', 'scribe_v1');
    formData.append('timestamps_granularity', 'word');
    formData.append('language', 'de');

    // Call ElevenLabs Speech-to-Text API
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`ElevenLabs API (${response.status}): ${errorText || response.statusText}`);
    }

    const result = await response.json();

    console.log('ElevenLabs Response:', {
      textLength: result.text?.length,
      wordsCount: result.words?.length,
      firstWord: result.words?.[0]
    });

    // Check if we got any words back
    if (!result.words || result.words.length === 0) {
      throw new Error('Keine Wörter in der Audio-Datei erkannt');
    }

    // Filter only actual words (not spacing) and map to our format
    const words = result.words
      .filter((w: any) => w.type === 'word')
      .map((w: any) => ({
        text: w.text,
        startTime: w.start,
        endTime: w.end
      }));

    console.log('Filtered words:', words.length);

    // Group words into subtitle segments (max 10 words or 3 seconds per segment)
    const segments: any[] = [];
    let currentSegment: any = { words: [], startTime: 0, endTime: 0, text: '' };

    words.forEach((word: any, index: number) => {
      if (currentSegment.words.length === 0) {
        currentSegment.startTime = word.startTime;
      }

      currentSegment.words.push(word);
      currentSegment.text += (currentSegment.text ? ' ' : '') + word.text;
      currentSegment.endTime = word.endTime;

      // Create new segment if we have 10 words or 3+ seconds duration
      const duration = currentSegment.endTime - currentSegment.startTime;
      if (currentSegment.words.length >= 10 || duration >= 3 || index === words.length - 1) {
        segments.push({
          id: `segment-${segments.length}`,
          startTime: currentSegment.startTime,
          endTime: currentSegment.endTime,
          text: currentSegment.text,
          words: currentSegment.words,
        });
        currentSegment = { words: [], startTime: 0, endTime: 0, text: '' };
      }
    });

    console.log('Generated segments:', segments.length);

    return new Response(
      JSON.stringify({
        subtitles: segments,
        fullText: result.text || '',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error generating subtitles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
