import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getPremiumVoiceById, getDefaultSettingsForVoice, getDefaultModelForVoice } from "../_shared/premium-voices.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Legacy short-name → ID mapping (backwards compatibility)
const LEGACY_NAME_MAP: Record<string, string> = {
  'sarah': 'EXAVITQu4vr4xnSDxMaL',
  'roger': 'CwhRBWXzGAHq8TQ4Fs17',
  'aria': '9BWtsMINqrJLrRacOk9x',
  'laura': 'FGY2WhTYpPnrIDTdsKH5',
  'charlie': 'IKne3meq5aSn9XLyUdCD',
  'george': 'JBFqnCBsd6RMkjVDRZzb',
  'brian': 'nPczCjzI2devNBz1zQrb',
};

function resolveVoiceId(input: string): string {
  if (!input) return 'EXAVITQu4vr4xnSDxMaL';
  // If it's a long string, treat as full ElevenLabs voice_id
  if (input.length > 15) return input;
  return LEGACY_NAME_MAP[input.toLowerCase()] || input;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body = await req.json();
    const {
      script_text,
      voice_id = 'sarah',
      project_id,
      voice_settings: customSettings,
      model_id: customModel,
    } = body;

    if (!script_text) {
      return new Response(JSON.stringify({ error: 'Missing script_text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is not configured');

    const elevenlabsVoiceId = resolveVoiceId(voice_id);
    const premium = getPremiumVoiceById(elevenlabsVoiceId);

    // Use premium-specific settings if available, otherwise natural defaults
    const voiceSettings = customSettings || getDefaultSettingsForVoice(elevenlabsVoiceId);
    const modelId = customModel || getDefaultModelForVoice(elevenlabsVoiceId);

    console.log(`[VoiceOver] user=${user.id} voice=${elevenlabsVoiceId} premium=${!!premium} model=${modelId}`);

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenlabsVoiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: script_text,
          model_id: modelId,
          voice_settings: voiceSettings,
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

    const fileName = `director-cut/${user.id}/${Date.now()}_voiceover.mp3`;
    const { error: uploadError } = await supabaseClient.storage
      .from('voiceover-audio')
      .upload(fileName, audioBlob, { contentType: 'audio/mpeg', upsert: true });

    if (uploadError) {
      console.error('[VoiceOver] Upload error:', uploadError);
      throw new Error('Failed to upload audio file');
    }

    const { data: urlData } = supabaseClient.storage
      .from('voiceover-audio')
      .getPublicUrl(fileName);
    const voiceoverUrl = urlData.publicUrl;

    if (project_id) {
      await supabaseClient
        .from('director_cut_projects')
        .update({ voiceover_url: voiceoverUrl, updated_at: new Date().toISOString() })
        .eq('id', project_id)
        .eq('user_id', user.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      voiceover_url: voiceoverUrl,
      duration_estimate: Math.ceil(script_text.length / 15),
      voice_used: premium?.name || elevenlabsVoiceId,
      model_used: modelId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[VoiceOver] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
