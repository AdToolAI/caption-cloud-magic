import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Transcribe audio to get word-by-word timestamps for Karaoke subtitles
 * Uses ElevenLabs Speech-to-Text API
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioUrl, language = 'de' } = await req.json();

    if (!audioUrl) {
      throw new Error('audioUrl is required');
    }

    console.log('[transcribe-audio] Starting transcription:', { audioUrl, language });

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Download audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBlob = await audioResponse.blob();

    // Create form data for ElevenLabs Speech-to-Text
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', language === 'de' ? 'deu' : 'eng');
    formData.append('diarize', 'false');
    formData.append('tag_audio_events', 'false');

    // Call ElevenLabs Speech-to-Text API
    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      console.error('[transcribe-audio] ElevenLabs STT error:', errorText);
      throw new Error(`ElevenLabs STT failed: ${errorText}`);
    }

    const transcription = await sttResponse.json();
    console.log('[transcribe-audio] Transcription received:', {
      textLength: transcription.text?.length,
      wordCount: transcription.words?.length,
    });

    // Transform to subtitle format for Remotion
    const subtitles = transformToSubtitles(transcription);

    return new Response(
      JSON.stringify({
        success: true,
        text: transcription.text,
        subtitles,
        wordCount: transcription.words?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[transcribe-audio] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

/**
 * Transform ElevenLabs transcription to Remotion subtitle format
 * Groups words into segments of 3-5 words for readable subtitles
 */
function transformToSubtitles(transcription: any): any[] {
  const words = transcription.words || [];
  if (words.length === 0) return [];

  const subtitles: any[] = [];
  const WORDS_PER_SEGMENT = 4;

  for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
    const segmentWords = words.slice(i, i + WORDS_PER_SEGMENT);
    const segmentText = segmentWords.map((w: any) => w.text).join(' ');
    
    const startTime = segmentWords[0]?.start || 0;
    const endTime = segmentWords[segmentWords.length - 1]?.end || startTime + 2;

    subtitles.push({
      id: `subtitle-${i}`,
      startTime,
      endTime,
      text: segmentText,
      words: segmentWords.map((w: any) => ({
        text: w.text,
        startTime: w.start,
        endTime: w.end,
      })),
    });
  }

  console.log('[transcribe-audio] Generated subtitles:', subtitles.length, 'segments');
  return subtitles;
}
