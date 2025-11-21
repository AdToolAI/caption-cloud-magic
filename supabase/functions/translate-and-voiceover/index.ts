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

    const { text, source_language, target_language, voice_id, custom_voice_id } = await req.json();

    // Step 1: Translate text using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate text accurately while preserving tone and meaning.`
          },
          {
            role: 'user',
            content: `Translate from ${source_language} to ${target_language}:\n\n${text}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Translation API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const translatedText = aiData.choices[0].message.content.trim();

    // Step 2: Get voice ID (custom or default)
    let elevenLabsVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM'; // Default voice

    if (custom_voice_id) {
      const { data: customVoice } = await supabase
        .from('custom_voices')
        .select('elevenlabs_voice_id')
        .eq('id', custom_voice_id)
        .eq('user_id', user.id)
        .single();
      
      if (customVoice) {
        elevenLabsVoiceId = customVoice.elevenlabs_voice_id;
      }
    }

    // Step 3: Generate voiceover with ElevenLabs
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    const voiceResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: translatedText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!voiceResponse.ok) {
      const error = await voiceResponse.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    const audioBlob = await voiceResponse.blob();

    // Step 4: Upload audio to Supabase Storage
    const fileName = `${user.id}/${Date.now()}_translation.mp3`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('voiceover-audio')
      .upload(fileName, audioBlob, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('voiceover-audio')
      .getPublicUrl(fileName);

    // Step 5: Save translation to database
    const { data: translation, error: dbError } = await supabase
      .from('voice_translations')
      .insert({
        user_id: user.id,
        original_text: text,
        original_language: source_language,
        translated_text: translatedText,
        target_language,
        voiceover_url: publicUrl,
        voice_id: custom_voice_id || null,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({ 
        success: true,
        translation_id: translation.id,
        translated_text: translatedText,
        voiceover_url: publicUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in translate-and-voiceover:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
