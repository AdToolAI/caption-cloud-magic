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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { briefing, consultationResult, userId } = await req.json();
    
    // Accept both briefing and consultationResult for backwards compatibility
    const actualBriefing = briefing || consultationResult;
    
    if (!actualBriefing || !userId) {
      throw new Error('Briefing/consultationResult and userId are required');
    }

    console.log(`[auto-generate-universal-video] Starting for user: ${userId}, category: ${actualBriefing.category}`);

    // Create progress record
    const { data: progressRecord, error: progressError } = await supabase
      .from('universal_video_progress')
      .insert({
        user_id: userId,
        category: actualBriefing.category,
        status: 'pending',
        current_step: 'initializing',
        progress_percent: 0,
        briefing_json: actualBriefing,
      })
      .select()
      .single();

    if (progressError) {
      console.error('[auto-generate-universal-video] Progress insert error:', progressError);
      throw new Error('Failed to create progress record');
    }

    const progressId = progressRecord.id;
    console.log(`[auto-generate-universal-video] Progress ID: ${progressId}`);

    // Return immediately with progressId
    const responseBody = JSON.stringify({ progressId, status: 'started' });
    
    // Run generation in background (fire and forget)
    runGenerationPipeline(supabase, progressId, actualBriefing, userId).catch(console.error);

    return new Response(responseBody, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[auto-generate-universal-video] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function runGenerationPipeline(
  supabase: any,
  progressId: string,
  briefing: any,
  userId: string
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    // Step 1: Generate Script (10%)
    await updateProgress(supabase, progressId, 'generating_script', 5, '📝 Drehbuch wird erstellt...');
    await delay(4000); // Längerer Delay für sichtbares Progress Update

    const scriptResponse = await fetch(`${supabaseUrl}/functions/v1/generate-universal-script`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ briefing }),
    });

    if (!scriptResponse.ok) {
      const errorText = await scriptResponse.text();
      console.error('[auto-generate-universal-video] Script generation failed:', scriptResponse.status, errorText);
      throw new Error(`Script generation failed: ${errorText}`);
    }

    const { script } = await scriptResponse.json();
    console.log(`[auto-generate-universal-video] Script generated: ${script.scenes.length} scenes`);

    await updateProgress(supabase, progressId, 'script_complete', 15, '✅ Drehbuch fertig!', { script });
    await delay(5000); // 5 Sekunden zum Lesen

    // Step 2: Generate Character Sheet if needed (25%)
    let characterSheetUrl = null;
    if (briefing.hasCharacter) {
      await updateProgress(supabase, progressId, 'generating_character', 20, '🎭 Charakter wird erstellt...');
      await delay(4000);

      // Generate character using premium visual generator
      const characterResponse = await fetch(`${supabaseUrl}/functions/v1/generate-premium-visual`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `Character sheet for ${briefing.characterName || 'protagonist'}: ${briefing.characterDescription || 'friendly professional character'}. ${briefing.visualStyle} style. Multiple poses showing front view, side view, and expressions. Clean white background.`,
          style: briefing.visualStyle,
          aspectRatio: '1:1',
        }),
      });

      if (characterResponse.ok) {
        const { imageUrl } = await characterResponse.json();
        characterSheetUrl = imageUrl;
        console.log(`[auto-generate-universal-video] Character sheet generated`);
      }

      await updateProgress(supabase, progressId, 'character_complete', 25, '✅ Charakter fertig!', { characterSheetUrl });
      await delay(4000);
    }

    // Step 3: Generate Scene Visuals (25% - 60%)
    await updateProgress(supabase, progressId, 'generating_visuals', 30, '🎨 Szenen-Bilder werden erstellt...');
    await delay(3000);
    
    const sceneVisuals: string[] = [];
    const totalScenes = script.scenes.length;

    for (let i = 0; i < totalScenes; i++) {
      const scene = script.scenes[i];
      const progressPercent = 30 + Math.floor((i / totalScenes) * 30);
      
      await updateProgress(
        supabase, 
        progressId, 
        'generating_visuals', 
        progressPercent, 
        `🖼️ Szene ${i + 1}/${totalScenes} wird erstellt...`
      );
      await delay(2000); // Delay für UI Update

      try {
        const visualResponse = await fetch(`${supabaseUrl}/functions/v1/generate-premium-visual`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: `${scene.visualDescription}. Style: ${briefing.visualStyle}. Professional quality, ${briefing.emotionalTone} mood. Brand colors: ${briefing.brandColors?.join(', ') || 'professional palette'}.`,
            style: briefing.visualStyle,
            aspectRatio: briefing.aspectRatio,
            characterSheetUrl: characterSheetUrl,
          }),
        });

        if (visualResponse.ok) {
          const { imageUrl } = await visualResponse.json();
          sceneVisuals.push(imageUrl);
          script.scenes[i].imageUrl = imageUrl;
          console.log(`[auto-generate-universal-video] Scene ${i + 1} visual generated`);
        } else {
          const errorText = await visualResponse.text();
          console.error(`[auto-generate-universal-video] Scene ${i + 1} visual failed:`, visualResponse.status, errorText);
          sceneVisuals.push(generateSVGPlaceholder(scene.title, briefing.brandColors?.[0]));
          script.scenes[i].imageUrl = sceneVisuals[sceneVisuals.length - 1];
        }
      } catch (e) {
        console.error(`[auto-generate-universal-video] Scene ${i + 1} visual error:`, e);
        sceneVisuals.push(generateSVGPlaceholder(scene.title, briefing.brandColors?.[0]));
        script.scenes[i].imageUrl = sceneVisuals[sceneVisuals.length - 1];
      }

      await delay(4000); // Längerer Delay zwischen Szenen für sichtbare Updates
    }

    await updateProgress(supabase, progressId, 'visuals_complete', 60, '✅ Alle Szenen-Bilder fertig!', { sceneVisuals });
    await delay(4000);

    // Step 4: Generate Voice-Over WITH TIMESTAMPS for Lip-Sync (60% - 70%)
    await updateProgress(supabase, progressId, 'generating_voiceover', 65, '🎙️ Voiceover wird erstellt...');
    await delay(3000);

    const fullScript = script.scenes.map((s: any) => s.voiceover).join(' ');
    
    // ✅ NEW: Request timestamps for lip-sync
    const voiceoverResponse = await fetch(`${supabaseUrl}/functions/v1/generate-video-voiceover`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scriptText: fullScript,
        voiceGender: briefing.voiceGender || 'male',
        language: briefing.voiceLanguage || 'de',
        withTimestamps: true, // ✅ Request phoneme timestamps for lip-sync
      }),
    });

    let voiceoverUrl = null;
    let phonemeTimestamps = null;
    if (voiceoverResponse.ok) {
      const voiceoverData = await voiceoverResponse.json();
      voiceoverUrl = voiceoverData.audioUrl;
      
      // ✅ Transform ElevenLabs alignment to template format for lip-sync
      if (voiceoverData.alignment) {
        const alignment = voiceoverData.alignment;
        phonemeTimestamps = transformAlignmentToPhonemes(alignment);
        console.log(`[auto-generate-universal-video] Voiceover generated with phoneme timestamps:`, {
          originalCharacters: alignment.characters?.length || 0,
          transformedPhonemes: phonemeTimestamps?.length || 0,
        });
      }
    } else {
      const errorText = await voiceoverResponse.text();
      console.error('[auto-generate-universal-video] Voiceover failed:', voiceoverResponse.status, errorText);
    }

    await updateProgress(supabase, progressId, 'voiceover_complete', 70, '✅ Voiceover fertig!', { voiceoverUrl });
    await delay(3000);

    // Step 4b: Generate Subtitles from Voiceover (70% - 75%)
    let subtitles = null;
    if (voiceoverUrl) {
      await updateProgress(supabase, progressId, 'generating_subtitles', 72, '📝 Untertitel werden erstellt...');
      await delay(2000);

      try {
        const subtitleResponse = await fetch(`${supabaseUrl}/functions/v1/transcribe-audio`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioUrl: voiceoverUrl,
            language: briefing.voiceLanguage || 'de',
          }),
        });

        if (subtitleResponse.ok) {
          const subtitleData = await subtitleResponse.json();
          subtitles = subtitleData.subtitles;
          console.log(`[auto-generate-universal-video] Subtitles generated: ${subtitles?.length || 0} segments`);
        } else {
          console.error('[auto-generate-universal-video] Subtitle generation failed:', await subtitleResponse.text());
        }
      } catch (e) {
        console.error('[auto-generate-universal-video] Subtitle error:', e);
      }

      await updateProgress(supabase, progressId, 'subtitles_complete', 75, '✅ Untertitel fertig!');
      await delay(2000);
    }

    // Step 5: Select Background Music (75% - 78%)
    await updateProgress(supabase, progressId, 'selecting_music', 76, '🎵 Musik wird ausgewählt...');
    await delay(2000);

    const musicUrl = await selectBackgroundMusic(supabase, briefing.musicStyle, briefing.musicMood, supabaseUrl, supabaseServiceKey);

    await updateProgress(supabase, progressId, 'music_complete', 78, '✅ Musik ausgewählt!', { musicUrl });
    await delay(2000);

    // Step 5b: Analyze Music Beats (78% - 82%)
    let beatSyncData = null;
    if (musicUrl) {
      await updateProgress(supabase, progressId, 'analyzing_beats', 79, '🎼 Beat-Analyse läuft...');
      await delay(2000);

      try {
        const totalDuration = script.scenes.reduce((acc: number, scene: any) => 
          acc + (scene.durationSeconds || scene.duration || 5), 0);

        const beatResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-music-beats`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            musicUrl,
            duration: totalDuration,
          }),
        });

        if (beatResponse.ok) {
          beatSyncData = await beatResponse.json();
          console.log(`[auto-generate-universal-video] Beat analysis complete: ${beatSyncData.bpm} BPM, ${beatSyncData.transitionPoints?.length || 0} transition points`);
        } else {
          console.error('[auto-generate-universal-video] Beat analysis failed:', await beatResponse.text());
        }
      } catch (e) {
        console.error('[auto-generate-universal-video] Beat analysis error:', e);
      }

      await updateProgress(supabase, progressId, 'beats_complete', 82, '✅ Beat-Analyse fertig!');
      await delay(2000);
    }

    // Step 6: Render Video (82% - 100%)
    await updateProgress(supabase, progressId, 'rendering', 85, '🎬 Video wird gerendert...');
    await delay(2000);

    console.log('[auto-generate-universal-video] Starting render-universal-video call with full feature set...');
    
    // ✅ Pass ALL new data to renderer
    const renderResponse = await fetch(`${supabaseUrl}/functions/v1/render-universal-video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        briefing,
        voiceoverUrl,
        musicUrl,
        userId,
        // ✅ NEW: Pass subtitle, phoneme, and beat data
        subtitles,
        phonemeTimestamps,
        beatSyncData,
      }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error('[auto-generate-universal-video] Render request failed:', renderResponse.status, errorText);
      await updateProgress(supabase, progressId, 'failed', 85, `Render-Fehler: ${errorText.substring(0, 100)}`);
      throw new Error(`Video rendering failed: ${errorText}`);
    }

    const renderData = await renderResponse.json();
    const { renderId, outputUrl } = renderData;
    
    if (!renderId) {
      console.error('[auto-generate-universal-video] No renderId received:', renderData);
      throw new Error('No render ID received from render service');
    }
    console.log(`[auto-generate-universal-video] Render started: ${renderId}`);

    await updateProgress(supabase, progressId, 'render_started', 90, 'Video wird finalisiert...', { renderId });

    // Poll for render completion
    let renderComplete = false;
    let finalOutputUrl = outputUrl;
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max

    while (!renderComplete && attempts < maxAttempts) {
      await delay(10000); // Check every 10 seconds
      attempts++;

      const checkResponse = await fetch(`${supabaseUrl}/functions/v1/check-remotion-progress`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ renderId }),
      });

      if (checkResponse.ok) {
        const status = await checkResponse.json();
        if (status.done) {
          renderComplete = true;
          finalOutputUrl = status.outputFile || status.url;
          console.log(`[auto-generate-universal-video] Render complete: ${finalOutputUrl}`);
        } else if (status.fatalErrorEncountered) {
          throw new Error('Render failed: ' + status.errors?.join(', '));
        }
        
        const renderProgress = 90 + Math.floor((status.overallProgress || 0) * 10);
        await updateProgress(supabase, progressId, 'rendering', renderProgress, `Rendering... ${Math.floor((status.overallProgress || 0) * 100)}%`);
      }
    }

    if (!renderComplete) {
      throw new Error('Render timeout');
    }

    // Final update
    await updateProgress(supabase, progressId, 'completed', 100, 'Video fertig!', {
      outputUrl: finalOutputUrl,
      script,
      voiceoverUrl,
      musicUrl,
      sceneVisuals,
    });

    console.log(`[auto-generate-universal-video] Pipeline complete for ${progressId}`);

  } catch (error) {
    console.error(`[auto-generate-universal-video] Pipeline error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateProgress(supabase, progressId, 'failed', 0, `Fehler: ${errorMessage}`);
  }
}

async function updateProgress(
  supabase: any,
  progressId: string,
  step: string,
  percent: number,
  message: string,
  data?: Record<string, any>
) {
  const updateData: any = {
    current_step: step,
    progress_percent: percent,
    status_message: message,
    updated_at: new Date().toISOString(),
  };

  if (step === 'completed') {
    updateData.status = 'completed';
    updateData.completed_at = new Date().toISOString();
  } else if (step === 'failed') {
    updateData.status = 'failed';
  } else {
    updateData.status = 'processing';
  }

  if (data) {
    updateData.result_data = data;
  }

  const { error } = await supabase
    .from('universal_video_progress')
    .update(updateData)
    .eq('id', progressId);

  if (error) {
    console.error('[auto-generate-universal-video] Progress update error:', error);
  }
}

async function selectBackgroundMusic(
  supabase: any,
  style: string,
  mood: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<string | null> {
  // Try Jamendo first
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-stock-music`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `${style} ${mood}`,
        limit: 1,
      }),
    });

    if (searchResponse.ok) {
      const { results } = await searchResponse.json();
      if (results?.[0]?.url) {
        return results[0].url;
      }
    }
  } catch (e) {
    console.error('[auto-generate-universal-video] Music search failed:', e);
  }

  // Fallback to hardcoded library
  const MUSIC_FALLBACK: Record<string, string> = {
    'upbeat': 'https://cdn.pixabay.com/audio/2024/11/12/audio_c09a6e2f0d.mp3',
    'calm': 'https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1912.mp3',
    'corporate': 'https://cdn.pixabay.com/audio/2022/10/25/audio_b36e8b618a.mp3',
    'inspirational': 'https://cdn.pixabay.com/audio/2024/04/17/audio_db71c3e9ba.mp3',
    'energetic': 'https://cdn.pixabay.com/audio/2023/07/13/audio_3d4a5a0c0b.mp3',
  };

  return MUSIC_FALLBACK[mood] || MUSIC_FALLBACK['corporate'];
}

function generateSVGPlaceholder(title: string, color?: string): string {
  const bgColor = color || '#3b82f6';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
        <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <text x="960" y="540" font-family="Arial, sans-serif" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">${title || 'Scene'}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ✅ Transform ElevenLabs alignment format to template-compatible phoneme timestamps
// ElevenLabs format: { characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[] }
// Template format: { character: string, start_time: number, end_time: number }[] (snake_case!)
function transformAlignmentToPhonemes(alignment: {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}): Array<{ character: string; start_time: number; end_time: number }> {
  if (!alignment?.characters || !alignment?.character_start_times_seconds || !alignment?.character_end_times_seconds) {
    return [];
  }

  const phonemes: Array<{ character: string; start_time: number; end_time: number }> = [];
  
  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const startTime = alignment.character_start_times_seconds[i];
    const endTime = alignment.character_end_times_seconds[i];
    
    // Only include valid phoneme data (skip whitespace, invalid times)
    if (char && char.trim() && typeof startTime === 'number' && typeof endTime === 'number') {
      phonemes.push({
        character: char,
        start_time: startTime,  // ← snake_case for template compatibility
        end_time: endTime,      // ← snake_case for template compatibility
      });
    }
  }
  
  return phonemes;
}
