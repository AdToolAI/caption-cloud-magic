import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";
import { tl, withLang } from "../_shared/i18n.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

const FUNCTION_VERSION = 'clone-voice-v249-single-sample-errors';

class ApiError extends Error {
  constructor(message: string, public status = 500, public details?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ version: FUNCTION_VERSION, ...payload }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve((req: Request) => withLang(req, () => (async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // QA smoke short-circuit
  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { fn: "clone-voice", version: FUNCTION_VERSION });
  }

  try {
    console.log(`[clone-voice] boot ${FUNCTION_VERSION}`);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new ApiError(tl({ de: 'Bitte melde dich erneut an.', en: 'Please log in again.', es: 'Por favor, inicia sesión de nuevo.' }), 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(tl({ de: 'Ungültige Anfrage: JSON konnte nicht gelesen werden.', en: 'Invalid request: JSON could not be read.', es: 'Solicitud no válida: No se pudo leer el JSON.' }), 400);
    }

    const { name, sample_urls, language, description, remove_background_noise } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new ApiError('Voice-Name fehlt (mindestens 2 Zeichen).', 400);
    }
    if (!Array.isArray(sample_urls) || sample_urls.length < 1) {
      throw new ApiError('Mindestens 1 Audio-Sample erforderlich.', 400);
    }
    console.log(`[clone-voice] samples=${sample_urls.length} lang=${language} denoise=${remove_background_noise}`);

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new ApiError(tl({ de: 'Voice-Cloning ist noch nicht verbunden. Bitte ElevenLabs-Verbindung prüfen.', en: 'Voice cloning is not yet connected. Please check ElevenLabs connection.', es: 'La clonación de voz aún no está conectada. Por favor, verifica la conexión de ElevenLabs.' }), 503);
    }

    // Download audio samples, keep their real container so ElevenLabs
    // can decode OGG/Opus (WhatsApp voice notes), M4A, MP3, WAV, etc.
    const audioFiles = await Promise.all(
      sample_urls.map(async (url, idx: number) => {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          throw new ApiError(`Audio-Sample ${idx + 1} hat keine gültige URL.`, 400);
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new ApiError(
            tl({ de: `Audio-Sample ${idx + 1} konnte nicht gelesen werden. Bitte erneut hochladen.`, en: `Audio sample ${idx + 1} could not be read. Please upload again.`, es: `La muestra de audio ${idx + 1} no pudo ser leída. Por favor, súbela de nuevo.` }),
            400,
            `Fetch status ${response.status}`,
          );
        }
        const blob = await response.blob();
        if (blob.size < 4096) {
          throw new ApiError(tl({ de: `Audio-Sample ${idx + 1} ist leer oder zu kurz.`, en: `Audio sample ${idx + 1} is empty or too short.`, es: `La muestra de audio ${idx + 1} está vacía o es demasiado corta.` }), 400);
        }
        const contentType = response.headers.get('content-type') || blob.type || 'audio/mpeg';
        const extFromType: Record<string, string> = {
          'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/wave': 'wav',
          'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
          'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac',
        };
        const cleanType = contentType.split(';')[0].trim().toLowerCase();
        const ext = extFromType[cleanType] || (url.match(/\.(mp3|wav|m4a|ogg|opus|webm|flac)(?:\?|$)/i)?.[1]?.toLowerCase()) || 'mp3';
        return { blob, ext, type: cleanType };
      })
    );

    // Create FormData for ElevenLabs
    const formData = new FormData();
    formData.append('name', name);
    if (description) formData.append('description', String(description).slice(0, 500));
    // ElevenLabs' built-in denoise on ingest — no external DSP required.
    formData.append('remove_background_noise', remove_background_noise === false ? 'false' : 'true');
    audioFiles.forEach(({ blob, ext }, idx) => {
      formData.append('files', blob, `sample_${idx}.${ext}`);
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
      console.error(`[clone-voice] ElevenLabs error ${cloneResponse.status}: ${error}`);
      throw new ApiError(
        tl({ de: 'Voice-Cloning-Anbieter konnte die Stimme nicht erstellen.', en: 'Voice cloning provider could not create the voice.', es: 'El proveedor de clonación de voz no pudo crear la voz.' }),
        cloneResponse.status,
        error,
      );
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

    if (error) {
      throw new ApiError(tl({ de: 'Die geklonte Stimme konnte nicht gespeichert werden.', en: 'The cloned voice could not be saved.', es: 'La voz clonada no pudo ser guardada.' }), 500, error.message);
    }

    return jsonResponse({ 
      success: true,
      voice_id: customVoice.id,
      elevenlabs_voice_id: cloneData.voice_id,
      name: customVoice.name
    });

  } catch (error) {
    console.error('Error in clone-voice:', error);
    if (error instanceof ApiError) {
      return jsonResponse({ error: error.message, details: error.details }, error.status);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
})(req)));
