import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { video_url, target_language, voice_id, include_subtitles } = await req.json();
    if (!video_url || !target_language) {
      throw new Error('video_url and target_language are required');
    }

    // Create translation record
    const { data: translation, error: insertError } = await supabaseAdmin
      .from('video_translations')
      .insert({
        user_id: user.id,
        source_video_url: video_url,
        target_language,
        status: 'transcribing',
        metadata: { voice_id, include_subtitles },
      })
      .select()
      .single();

    if (insertError) throw insertError;
    const translationId = translation.id;

    const updateStatus = async (status: string, extra: Record<string, unknown> = {}) => {
      await supabaseAdmin
        .from('video_translations')
        .update({ status, ...extra })
        .eq('id', translationId);
    };

    // Run pipeline asynchronously (don't await - return immediately)
    (async () => {
      try {
        const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY')!;
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

        // === STEP 1: Download video audio and transcribe ===
        console.log(`[translate-video] Step 1: Transcribing ${translationId}`);

        // Download video to get audio
        const videoResponse = await fetch(video_url);
        if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
        const videoBlob = await videoResponse.blob();

        // Transcribe with ElevenLabs STT (auto-detect language)
        const sttFormData = new FormData();
        sttFormData.append('file', videoBlob, 'video.mp4');
        sttFormData.append('model_id', 'scribe_v1');
        sttFormData.append('diarize', 'false');
        sttFormData.append('tag_audio_events', 'false');

        const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: { 'xi-api-key': ELEVENLABS_API_KEY },
          body: sttFormData,
        });

        if (!sttResponse.ok) {
          const errText = await sttResponse.text();
          throw new Error(`STT failed: ${errText}`);
        }

        const transcription = await sttResponse.json();
        const originalText = transcription.text || '';
        const detectedLanguage = transcription.language_code || 'unknown';
        const words = transcription.words || [];

        console.log(`[translate-video] Detected language: ${detectedLanguage}, words: ${words.length}`);

        await updateStatus('translating', {
          source_language: detectedLanguage,
          original_transcript: originalText,
          metadata: { voice_id, include_subtitles, word_count: words.length },
        });

        // === STEP 2: Segment and translate ===
        console.log(`[translate-video] Step 2: Translating to ${target_language}`);

        // Group words into segments (~10 words each for natural sentences)
        const segments: Array<{ text: string; startTime: number; endTime: number; duration: number }> = [];
        const WORDS_PER_SEGMENT = 10;

        for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
          const segWords = words.slice(i, i + WORDS_PER_SEGMENT);
          const segText = segWords.map((w: { text: string }) => w.text).join(' ');
          const startTime = segWords[0]?.start || 0;
          const endTime = segWords[segWords.length - 1]?.end || startTime + 2;
          segments.push({ text: segText, startTime, endTime, duration: endTime - startTime });
        }

        // Translate all segments in one AI call
        const langMap: Record<string, string> = {
          de: 'German', en: 'English', es: 'Spanish', fr: 'French',
          it: 'Italian', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
          ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ru: 'Russian',
          tr: 'Turkish', nl: 'Dutch', pl: 'Polish', sv: 'Swedish',
        };
        const targetLangName = langMap[target_language] || target_language;

        const translationPrompt = segments.map((s, i) =>
          `[${i}] (${s.duration.toFixed(1)}s): ${s.text}`
        ).join('\n');

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
                content: `You are a professional translator. Translate each numbered segment to ${targetLangName}. 
Keep the same number of segments. Each segment should be roughly speakable in the given duration.
Return ONLY the translated segments, one per line, prefixed with the segment number like: [0] translated text`
              },
              { role: 'user', content: translationPrompt }
            ],
          }),
        });

        if (!aiResponse.ok) throw new Error(`Translation API error: ${aiResponse.status}`);
        const aiData = await aiResponse.json();
        const translatedRaw = aiData.choices[0].message.content.trim();

        // Parse translated segments
        const translatedSegments: string[] = [];
        const lines = translatedRaw.split('\n').filter((l: string) => l.trim());
        for (const line of lines) {
          const match = line.match(/^\[(\d+)\]\s*(.+)/);
          if (match) {
            translatedSegments[parseInt(match[1])] = match[2].trim();
          }
        }

        // Fill missing segments
        for (let i = 0; i < segments.length; i++) {
          if (!translatedSegments[i]) translatedSegments[i] = segments[i].text;
        }

        const fullTranslation = translatedSegments.join(' ');

        await updateStatus('generating', {
          translated_transcript: fullTranslation,
        });

        // === STEP 3: Generate voiceover with TTS ===
        console.log(`[translate-video] Step 3: Generating voiceover`);

        const ttsVoiceId = voice_id || '21m00Tcm4TlvDq8ikWAM'; // Default Rachel voice
        const audioSegments: Uint8Array[] = [];

        for (let i = 0; i < translatedSegments.length; i++) {
          const segText = translatedSegments[i];
          const origDuration = segments[i]?.duration || 2;

          // Estimate speed: ~150 words per minute at 1.0x
          // Rough chars-per-second at 1.0x is ~15
          const estimatedDurationAt1x = segText.length / 15;
          let speed = Math.max(0.7, Math.min(1.2, estimatedDurationAt1x / origDuration));

          const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${ttsVoiceId}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: segText,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: {
                  stability: 0.5,
                  similarity_boost: 0.75,
                  speed,
                },
              }),
            }
          );

          if (!ttsResponse.ok) {
            const errText = await ttsResponse.text();
            console.error(`[translate-video] TTS error for segment ${i}:`, errText);
            continue;
          }

          const audioBuffer = await ttsResponse.arrayBuffer();
          audioSegments.push(new Uint8Array(audioBuffer));
        }

        // Combine all audio segments into one blob
        const totalLength = audioSegments.reduce((sum, seg) => sum + seg.length, 0);
        const combinedAudio = new Uint8Array(totalLength);
        let offset = 0;
        for (const seg of audioSegments) {
          combinedAudio.set(seg, offset);
          offset += seg.length;
        }

        // Upload voiceover to storage
        const audioFileName = `${user.id}/${translationId}_voiceover.mp3`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from('voiceover-audio')
          .upload(audioFileName, combinedAudio, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl: voiceoverUrl } } = supabaseAdmin.storage
          .from('voiceover-audio')
          .getPublicUrl(audioFileName);

        await updateStatus('completed', {
          voiceover_url: voiceoverUrl,
          output_video_url: voiceoverUrl, // First version: audio-only output
          metadata: {
            voice_id: ttsVoiceId,
            include_subtitles,
            word_count: words.length,
            segment_count: segments.length,
            detected_language: detectedLanguage,
            target_language,
            subtitles: include_subtitles ? translatedSegments.map((text, i) => ({
              id: `sub-${i}`,
              text,
              startTime: segments[i]?.startTime || 0,
              endTime: segments[i]?.endTime || 0,
            })) : undefined,
          },
        });

        console.log(`[translate-video] Completed: ${translationId}`);

      } catch (err) {
        console.error(`[translate-video] Pipeline error:`, err);
        await updateStatus('failed', {
          error_message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    })();

    // Return immediately with translation ID for polling
    return new Response(
      JSON.stringify({
        success: true,
        translation_id: translationId,
        status: 'transcribing',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[translate-video] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
