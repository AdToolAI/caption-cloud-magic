import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ElevenLabs voice IDs
const VOICE_IDS: Record<string, string> = {
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'aria': '9BWtsMINqrJLrRacOk9x',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'brian': 'nPczCjzI2devNBz1zQrb',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      script_text, 
      voice_id = 'sarah', 
      language = 'de-DE',
      speed = 1,
      project_id 
    } = await req.json();

    if (!script_text) {
      return new Response(JSON.stringify({ error: 'Missing script_text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[VoiceOver] Generating voice-over for user ${user.id}, voice: ${voice_id}`);

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const elevenlabsVoiceId = VOICE_IDS[voice_id] || VOICE_IDS['sarah'];

    // Generate voice-over with ElevenLabs
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenlabsVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: script_text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('[VoiceOver] ElevenLabs error:', errorText);
      throw new Error(`ElevenLabs API error: ${ttsResponse.status}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBlob = new Uint8Array(audioBuffer);

    // Upload to Supabase Storage
    const fileName = `director-cut/${user.id}/${Date.now()}_voiceover.mp3`;
    
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('voiceover-audio')
      .upload(fileName, audioBlob, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[VoiceOver] Upload error:', uploadError);
      throw new Error('Failed to upload audio file');
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('voiceover-audio')
      .getPublicUrl(fileName);

    const voiceoverUrl = urlData.publicUrl;

    console.log(`[VoiceOver] Generated voiceover: ${voiceoverUrl}`);

    // Update project if provided
    if (project_id) {
      await supabaseClient
        .from('director_cut_projects')
        .update({ 
          voiceover_url: voiceoverUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project_id)
        .eq('user_id', user.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      voiceover_url: voiceoverUrl,
      duration_estimate: Math.ceil(script_text.length / 15), // Rough estimate
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VoiceOver] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
