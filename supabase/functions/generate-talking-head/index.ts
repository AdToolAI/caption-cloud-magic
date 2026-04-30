import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { isQaMockRequest, qaMockResponse } from "../_shared/qaMock.ts"; // [qa-mock-injected]
import { detectQaServiceAuth } from "../_shared/qaServiceAuth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock, x-qa-real-spend, x-qa-user-id',
};

const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')!;
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TalkingHeadRequest {
  sceneId?: string;
  projectId?: string;
  imageUrl: string;
  audioUrl?: string;
  text?: string;
  voiceId?: string;
  customVoiceId?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  resolution?: '480p' | '720p';
}

// Hedra Character-3 model on Replicate
const HEDRA_MODEL = 'hedra/character-3';

async function synthesizeAudio(text: string, voiceId: string): Promise<string> {
  // Generate TTS via ElevenLabs
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${err}`);
  }

  // Upload to Supabase storage
  const audioBuffer = await response.arrayBuffer();
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const path = `talking-head-tts/${crypto.randomUUID()}.mp3`;
  
  const { error: uploadError } = await admin.storage
    .from('voiceover-audio')
    .upload(path, audioBuffer, { contentType: 'audio/mpeg' });
  
  if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`);
  
  const { data: { publicUrl } } = admin.storage
    .from('voiceover-audio')
    .getPublicUrl(path);
  
  return publicUrl;
}

async function callHedra(imageUrl: string, audioUrl: string, aspectRatio: string, resolution: string) {
  const aspectMap: Record<string, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '1:1': '1:1',
  };

  // Use the model-scoped predictions endpoint so we don't need a pinned version hash.
  // Replicate accepts POST /v1/models/{owner}/{name}/predictions and locks to the
  // model owner's currently published version.
  const response = await fetch(`https://api.replicate.com/v1/models/${HEDRA_MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${REPLICATE_API_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        image: imageUrl,
        audio: audioUrl,
        aspect_ratio: aspectMap[aspectRatio] || '9:16',
        resolution: resolution || '720p',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Hedra prediction failed: ${err}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Bond QA Agent: short-circuit on x-qa-mock header (no provider call, no credits)
  if (isQaMockRequest(req)) {
    return qaMockResponse({ corsHeaders, kind: "talking-head" });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // QA service-role shortcut (only honored when caller IS the service role)
    const qaSvc = detectQaServiceAuth(req);
    let user: { id: string } | null = null;
    if (qaSvc.isQaService && qaSvc.userId) {
      user = { id: qaSvc.userId };
      console.log(`[talking-head] QA service-auth user=${user.id}`);
    } else {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: jwtUser }, error: userError } = await userClient.auth.getUser();
      if (userError || !jwtUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = jwtUser;
    }

    const body: TalkingHeadRequest = await req.json();
    const {
      sceneId,
      imageUrl,
      audioUrl: providedAudioUrl,
      text,
      voiceId,
      customVoiceId,
      aspectRatio = '9:16',
      resolution = '720p',
    } = body;

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'imageUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!providedAudioUrl && !text) {
      return new Response(JSON.stringify({ error: 'Either audioUrl or text+voiceId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Get audio (synthesize via TTS if needed)
    let audioUrl = providedAudioUrl;
    if (!audioUrl && text) {
      const finalVoiceId = customVoiceId || voiceId || 'EXAVITQu4vr4xnSDxMaL';
      console.log(`[talking-head] Synthesizing TTS with voice ${finalVoiceId}`);
      audioUrl = await synthesizeAudio(text, finalVoiceId);
      console.log(`[talking-head] Audio synthesized: ${audioUrl}`);
    }

    if (!audioUrl) throw new Error('Audio URL missing after synthesis');

    // Step 2: Call Hedra Character-3
    console.log(`[talking-head] Starting Hedra generation for image=${imageUrl}`);
    const prediction = await callHedra(imageUrl, audioUrl, aspectRatio, resolution);
    console.log(`[talking-head] Hedra prediction: ${prediction.id}, status=${prediction.status}`);

    // Step 3: Update scene if sceneId provided
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    if (sceneId) {
      await admin.from('composer_scenes').update({
        clip_source: 'talking-head',
        character_image_url: imageUrl,
        character_audio_url: audioUrl,
        character_voice_id: voiceId || customVoiceId,
        character_script: text,
        talking_head_aspect: aspectRatio,
        talking_head_resolution: resolution,
        replicate_prediction_id: prediction.id,
        clip_status: prediction.status === 'succeeded' ? 'completed' : 'processing',
        clip_url: prediction.output || null,
        updated_at: new Date().toISOString(),
      }).eq('id', sceneId);
    }

    return new Response(JSON.stringify({
      success: true,
      predictionId: prediction.id,
      status: prediction.status,
      videoUrl: prediction.output || null,
      audioUrl,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[talking-head] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
