import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { name, sample_urls, language } = await req.json();

    if (!sample_urls || sample_urls.length < 3) {
      throw new Error('At least 3 voice samples required');
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Download audio samples
    const audioFiles = await Promise.all(
      sample_urls.map(async (url: string) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return blob;
      })
    );

    // Create FormData for ElevenLabs
    const formData = new FormData();
    formData.append('name', name);
    audioFiles.forEach((blob, idx) => {
      formData.append('files', blob, `sample_${idx}.mp3`);
    });

    // Call ElevenLabs Voice Cloning API
    const cloneResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!cloneResponse.ok) {
      const error = await cloneResponse.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    const cloneData = await cloneResponse.json();

    // Save to database
    const { data: customVoice, error } = await supabase
      .from('custom_voices')
      .insert({
        user_id: user.id,
        name,
        elevenlabs_voice_id: cloneData.voice_id,
        language: language || 'en',
        sample_urls,
        voice_characteristics: cloneData,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ 
        success: true,
        voice_id: customVoice.id,
        elevenlabs_voice_id: cloneData.voice_id,
        name: customVoice.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in clone-voice:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
