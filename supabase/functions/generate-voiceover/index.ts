import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getPremiumVoiceById, getDefaultSettingsForVoice, getDefaultModelForVoice } from "../_shared/premium-voices.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VoiceoverRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  projectId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenlabsApiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const requestBody: VoiceoverRequest = await req.json();

    let validatedSpeed = requestBody.speed || 1.0;
    if (validatedSpeed < 0.7 || validatedSpeed > 1.2) {
      validatedSpeed = Math.max(0.7, Math.min(1.2, validatedSpeed));
    }

    const {
      text,
      voiceId = '9BWtsMINqrJLrRacOk9x',
      projectId,
    } = requestBody;
    const speed = validatedSpeed;

    // Pull premium defaults if known
    const premium = getPremiumVoiceById(voiceId);
    const defaultSettings = getDefaultSettingsForVoice(voiceId);
    const modelId = requestBody.modelId || getDefaultModelForVoice(voiceId);

    const stability = requestBody.stability ?? defaultSettings.stability;
    const similarityBoost = requestBody.similarityBoost ?? defaultSettings.similarity_boost;
    const style = requestBody.style ?? defaultSettings.style;
    const useSpeakerBoost = requestBody.useSpeakerBoost ?? defaultSettings.use_speaker_boost;

    console.log('Generating voiceover:', {
      textLength: text.length, voiceId, premium: !!premium, modelId,
      speed, stability, similarityBoost, style, useSpeakerBoost, projectId,
    });

    const elevenlabsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128&optimize_streaming_latency=2`;

    const elevenlabsResponse = await fetch(elevenlabsUrl, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: useSpeakerBoost,
          speed,
        },
      }),
    });

    if (!elevenlabsResponse.ok) {
      const errorText = await elevenlabsResponse.text();
      console.error('ElevenLabs API error:', elevenlabsResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${elevenlabsResponse.status}`);
    }

    const audioBlob = await elevenlabsResponse.blob();
    const audioBuffer = await audioBlob.arrayBuffer();
    const audioUint8Array = new Uint8Array(audioBuffer);

    const fileName = `${projectId}_voiceover.mp3`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(filePath, audioUint8Array, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('voiceover-audio').getPublicUrl(filePath);
    const cacheBustedUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const wordCount = text.split(/\s+/).length;
    const baseEstimatedDuration = (wordCount / 150) * 60;
    const estimatedDuration = Math.ceil(baseEstimatedDuration / speed);

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: cacheBustedUrl,
        duration: estimatedDuration,
        voiceId,
        modelId,
        voiceUsed: premium?.name || voiceId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating voiceover:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
