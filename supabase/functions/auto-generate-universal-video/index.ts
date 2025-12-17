import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoGenerateRequest {
  consultationResult: any;
  userId: string;
  category: string;
}

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { consultationResult, userId, category } = await req.json() as AutoGenerateRequest;
    
    console.log('🚀 [auto-generate-universal-video] Starting for user:', userId, 'category:', category);

    // Create progress record immediately
    const progressId = crypto.randomUUID();
    const { error: progressInsertError } = await supabase
      .from('universal_video_generation_progress')
      .insert({
        id: progressId,
        user_id: userId,
        category,
        current_step: 'pending',
        step_index: 0,
        progress: 0,
        message: '🚀 Initialisiere KI-Generierung...',
        consultation_result: consultationResult,
      });
    
    if (progressInsertError) {
      console.error('Failed to create progress record:', progressInsertError);
      throw new Error('Could not initialize progress tracking');
    }

    console.log('✅ Progress record created:', progressId);

    // Return progressId immediately
    const immediateResponse = new Response(
      JSON.stringify({ 
        ok: true,
        success: true, 
        progressId,
        message: 'Generation gestartet - Progress-Updates folgen in Echtzeit' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // Run main generation pipeline in background
    EdgeRuntime.waitUntil(
      runGenerationPipeline(supabase, progressId, userId, category, consultationResult)
    );

    console.log('✅ Background task started, returning immediate response');
    return immediateResponse;

  } catch (error) {
    console.error('[auto-generate-universal-video] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOUND EFFECTS LIBRARY - Scene-type specific sounds
// ═══════════════════════════════════════════════════════════════════════════
const SOUND_EFFECTS_MAPPING: Record<string, { sounds: string[] }> = {
  'hook': { sounds: ['impact-reveal', 'whoosh-fast'] },
  'intro': { sounds: ['whoosh-soft', 'notification-ding'] },
  'problem': { sounds: ['error-buzz', 'impact-punch'] },
  'conflict': { sounds: ['impact-punch', 'error-buzz'] },
  'solution': { sounds: ['success-chime', 'swoosh-magic'] },
  'turning_point': { sounds: ['swoosh-magic', 'impact-reveal'] },
  'feature': { sounds: ['click-soft', 'whoosh-soft'] },
  'steps': { sounds: ['click-soft', 'notification-ding'] },
  'tips': { sounds: ['notification-ding', 'whoosh-soft'] },
  'proof': { sounds: ['success-chime', 'notification-ding'] },
  'resolution': { sounds: ['success-chime', 'swoosh-magic'] },
  'moral': { sounds: ['success-chime', 'impact-reveal'] },
  'cta': { sounds: ['impact-boom', 'impact-reveal'] },
  'summary': { sounds: ['notification-ding', 'success-chime'] },
  'content': { sounds: ['click-soft', 'whoosh-soft'] },
};

const SOUND_LIBRARY: Record<string, string> = {
  'impact-reveal': 'https://cdn.freesound.org/previews/270/270304_5123851-lq.mp3',
  'whoosh-fast': 'https://cdn.freesound.org/previews/60/60013_634166-lq.mp3',
  'error-buzz': 'https://cdn.freesound.org/previews/142/142608_1840739-lq.mp3',
  'impact-punch': 'https://cdn.freesound.org/previews/270/270324_5123851-lq.mp3',
  'success-chime': 'https://cdn.freesound.org/previews/320/320654_5260872-lq.mp3',
  'swoosh-magic': 'https://cdn.freesound.org/previews/60/60009_634166-lq.mp3',
  'click-soft': 'https://cdn.freesound.org/previews/475/475772_9159316-lq.mp3',
  'whoosh-soft': 'https://cdn.freesound.org/previews/60/60012_634166-lq.mp3',
  'notification-ding': 'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3',
  'impact-boom': 'https://cdn.freesound.org/previews/413/413489_7842741-lq.mp3',
};

// ═══════════════════════════════════════════════════════════════════════════
// MUSIC LIBRARY FALLBACK - By mood/style
// ═══════════════════════════════════════════════════════════════════════════
const MUSIC_LIBRARY_FALLBACK: Record<string, string> = {
  'upbeat': 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3',
  'corporate': 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b0939c8.mp3',
  'calm': 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
  'inspirational': 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3',
  'energetic': 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749d484.mp3',
  'emotional': 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_91b32e02f9.mp3',
  'professional': 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b0939c8.mp3',
  'cinematic': 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bab.mp3',
};

async function runGenerationPipeline(
  supabase: any, 
  progressId: string, 
  userId: string, 
  category: string,
  consultationResult: any
) {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 UNIVERSAL VIDEO BACKGROUND PIPELINE STARTED');
    console.log('═══════════════════════════════════════════════════════════');

    const updateProgress = async (
      step: string, 
      stepIndex: number, 
      progress: number, 
      message: string, 
      assets?: any[], 
      projectData?: any
    ) => {
      const updateData: any = {
        current_step: step,
        step_index: stepIndex,
        progress,
        message,
        updated_at: new Date().toISOString(),
      };
      if (assets) updateData.assets_json = assets;
      if (projectData) updateData.project_data = projectData;
      
      await supabase
        .from('universal_video_generation_progress')
        .update(updateData)
        .eq('id', progressId);
      
      console.log(`📊 Progress: [${step}] ${stepIndex} - ${progress}% - ${message}`);
      // Extended delay for UI visibility
      await new Promise(r => setTimeout(r, 2000));
    };

    // ✅ AGGRESSIVE CLEANUP: Remove forbidden German filler phrases
    const cleanupVoiceover = (text: string): string => {
      if (!text) return '';
      let cleaned = text;
      const forbiddenPatterns = [
        /Also ich habe:?\s*[^.!?\n]*/gi,
        /Ich habe:?\s*[^.!?\n]*/gi,
        /Also\.\.\.:?\s*[^.!?\n]*/gi,
        /^Also[,:\s]+/gim,
        /Also,?\s+ich/gi,
        /^Ich\s+(?!bin|biete|stelle|präsentiere|zeige)[^.!?\n]*/gim,
        /Hier kommt die Klarheit:?\s*[^.!?\n]*/gi,
        /Was mache ich jetzt\??\s*/gi,
        /Und hier kommt:?\s*/gi,
        /Na gut[,:?\s]*/gi,
        /Ganz ehrlich[,:?\s]*/gi,
        /Wie gesagt[,:?\s]*/gi,
        /Sozusagen[,:?\s]*/gi,
        /Quasi[,:?\s]*/gi,
        /Naja[,:?\s]*/gi,
        /Eigentlich[,:?\s]*/gi,
      ];
      for (const pattern of forbiddenPatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
      // Recursive check
      let iterations = 0;
      while (cleaned.toLowerCase().includes('also ich habe') && iterations < 5) {
        cleaned = cleaned.replace(/also ich habe:?\s*[^.!?\n]*/gi, '');
        iterations++;
      }
      return cleaned.replace(/\s+/g, ' ').trim();
    };

    const duration = consultationResult.duration || 60;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Generate Script (8-10 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 1: Generating script... ═══');
    await updateProgress('script', 0, 5, '📝 Analysiere Briefing und erstelle kategoriespezifisches Drehbuch...');
    await new Promise(r => setTimeout(r, 5000));
    
    await updateProgress('script', 0, 8, `📝 Generiere ${category}-optimierte Szenenstruktur...`);
    await new Promise(r => setTimeout(r, 3000));

    const scriptResponse = await supabase.functions.invoke('generate-universal-script', {
      body: { 
        category,
        consultationResult,
        duration
      }
    });

    if (scriptResponse.error || !scriptResponse.data?.script) {
      console.error('Script generation error:', scriptResponse.error);
      await updateProgress('script', 0, 0, `❌ Drehbuch-Fehler: ${scriptResponse.error?.message || 'Unbekannter Fehler'}`);
      return;
    }

    let script = scriptResponse.data.script;
    
    // Clean voiceover and calculate timing
    let currentTime = 0;
    script.scenes = (script.scenes || []).map((scene: any, index: number) => {
      const sceneDuration = scene.duration || scene.durationSeconds || 5;
      const startTime = currentTime;
      const endTime = currentTime + sceneDuration;
      currentTime = endTime;
      
      const originalVoiceover = scene.voiceover || scene.spokenText || '';
      const cleanedVoiceover = cleanupVoiceover(originalVoiceover);
      
      if (originalVoiceover !== cleanedVoiceover) {
        console.log(`🎤 Scene ${index + 1} cleanup: removed ${originalVoiceover.length - cleanedVoiceover.length} chars`);
      }
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        durationSeconds: sceneDuration,
        startTime,
        endTime,
        spokenText: cleanedVoiceover,
        voiceover: cleanedVoiceover,
      };
    });
    
    console.log('✅ Script generated with', script.scenes?.length, 'scenes');
    await updateProgress('script', 0, 15, `✅ Drehbuch mit ${script.scenes?.length} Szenen erstellt!`, undefined, { script });
    
    // ✅ EXTENDED DELAY: 8 seconds after script for visibility
    await new Promise(r => setTimeout(r, 8000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 1.5: Generate Character Sheet (if character enabled)
    // ═══════════════════════════════════════════════════════════════
    let characterSheetUrl: string | null = null;
    const hasCharacter = consultationResult.hasCharacter || consultationResult.characterPreferences?.hasCharacter;
    
    if (hasCharacter) {
      console.log('═══ STEP 1.5: Generating character sheet... ═══');
      await updateProgress('character-sheet', 1, 18, '👤 Erstelle Character Sheet für visuelle Konsistenz...');
      await new Promise(r => setTimeout(r, 4000));
      
      try {
        const characterResponse = await supabase.functions.invoke('generate-premium-visual', {
          body: {
            type: 'character-sheet',
            style: consultationResult.visualStyle || 'flat-design',
            character: {
              hasCharacter: true,
              gender: consultationResult.characterPreferences?.gender || 'neutral',
              appearance: consultationResult.characterPreferences?.appearance || '',
              skinTone: consultationResult.characterPreferences?.skinTone,
              clothing: consultationResult.characterPreferences?.clothing,
            },
          }
        });
        
        if (characterResponse.data?.imageUrl) {
          characterSheetUrl = characterResponse.data.imageUrl;
          console.log('✅ Character sheet generated:', characterSheetUrl?.substring(0, 50));
        }
      } catch (e) {
        console.error('Character sheet generation failed:', e);
      }
      
      await updateProgress('character-sheet', 1, 22, characterSheetUrl ? '✅ Character Sheet erstellt!' : '⚠️ Character Sheet übersprungen');
      
      // ✅ EXTENDED DELAY: 6 seconds after character sheet
      await new Promise(r => setTimeout(r, 6000));
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Generate Visuals (with IP-Adapter for character consistency)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 2: Generating visuals... ═══');
    await updateProgress('visuals', 2, 25, '🎨 Starte Premium Visual-Generierung...');
    await new Promise(r => setTimeout(r, 4000));
    
    const assets: any[] = [];
    const totalScenes = script.scenes?.length || 5;
    
    for (let i = 0; i < totalScenes; i++) {
      const scene = script.scenes[i];
      const sceneProgress = 25 + Math.floor((i / totalScenes) * 30);
      
      await updateProgress('visuals', 2, sceneProgress, `🎨 Generiere Visual ${i + 1}/${totalScenes}: ${scene.title || scene.actType}`);
      
      let imageUrl: string | null = null;
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries && !imageUrl) {
        try {
          const visualResponse = await supabase.functions.invoke('generate-premium-visual', {
            body: {
              type: 'scene',
              sceneId: scene.id,
              sceneDescription: scene.visualDescription,
              style: retries >= 3 ? 'flat-design' : (consultationResult.visualStyle || 'flat-design'),
              mood: scene.mood || 'professional',
              aspectRatio: consultationResult.aspectRatio || '16:9',
              // ✅ IP-ADAPTER: Pass character sheet for consistency
              characterSheetUrl: characterSheetUrl,
              character: hasCharacter ? {
                hasCharacter: true,
                gender: consultationResult.characterPreferences?.gender || 'neutral',
                appearance: consultationResult.characterPreferences?.appearance || '',
              } : undefined,
            }
          });

          if (visualResponse.data?.imageUrl && visualResponse.data.imageUrl.length > 10) {
            imageUrl = visualResponse.data.imageUrl;
            console.log(`✅ Visual ${i + 1} generated`);
          } else {
            retries++;
            if (retries < maxRetries) {
              await new Promise(r => setTimeout(r, 2000 * retries));
            }
          }
        } catch (err) {
          console.error(`Error generating visual ${i + 1}:`, err);
          retries++;
          if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 2000 * retries));
          }
        }
      }
      
      // Fallback to SVG if all retries failed
      if (!imageUrl) {
        console.warn(`⚠️ Using SVG fallback for scene ${i + 1}`);
        imageUrl = generateSVGFallback(scene.actType || 'hook', scene.title || '');
      }
      
      assets.push({
        sceneId: scene.id,
        imageUrl,
        type: imageUrl.startsWith('data:') ? 'svg-fallback' : 'image',
        isPremium: !imageUrl.startsWith('data:'),
      });
      
      // ✅ EXTENDED DELAY: 4 seconds per visual for visibility
      await new Promise(r => setTimeout(r, 4000));
    }
    
    await updateProgress('visuals', 2, 55, `✅ ${assets.length} Visuals generiert!`, assets);
    
    // ✅ EXTENDED DELAY: 5 seconds after all visuals
    await new Promise(r => setTimeout(r, 5000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Generate Voice-Over
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 3: Generating voice-over... ═══');
    await updateProgress('voiceover', 3, 58, '🎤 Generiere professionelles Voice-Over mit ElevenLabs...');
    await new Promise(r => setTimeout(r, 4000));
    
    const fullVoiceover = script.scenes.map((s: any) => s.spokenText || s.voiceover).filter(Boolean).join(' ');
    let voiceoverUrl = '';
    
    if (fullVoiceover.trim().length > 10) {
      try {
        const voiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
          body: {
            scriptText: fullVoiceover,
            voiceId: consultationResult.voiceId || 'pNInz6obpgDQGcFmaJgB', // Adam default
            language: consultationResult.language || 'de',
            speed: 1.0,
          }
        });

        if (voiceResponse.data?.audioUrl) {
          voiceoverUrl = voiceResponse.data.audioUrl;
          console.log('✅ Voice-over generated');
        }
      } catch (err) {
        console.error('Voice-over generation error:', err);
      }
    }
    
    await updateProgress('voiceover', 3, 65, voiceoverUrl ? '✅ Voice-Over generiert!' : '⚠️ Voice-Over übersprungen');
    
    // ✅ EXTENDED DELAY: 8 seconds after voiceover
    await new Promise(r => setTimeout(r, 8000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Select Music
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 4: Selecting music... ═══');
    await updateProgress('music', 4, 68, '🎵 Suche passende Hintergrundmusik...');
    await new Promise(r => setTimeout(r, 3000));
    
    let musicUrl = '';
    const musicStyle = consultationResult.musicStyle || 'corporate';
    
    try {
      // Try Jamendo first
      const musicResponse = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: musicStyle,
          duration: duration
        }
      });
      
      if (musicResponse.data?.results?.[0]?.url) {
        musicUrl = musicResponse.data.results[0].url;
        console.log('✅ Music selected from Jamendo');
      }
    } catch (err) {
      console.error('Music search error:', err);
    }
    
    // Fallback to library
    if (!musicUrl) {
      musicUrl = MUSIC_LIBRARY_FALLBACK[musicStyle] || MUSIC_LIBRARY_FALLBACK['corporate'];
      console.log('📻 Using fallback music library');
    }
    
    await updateProgress('music', 4, 72, '✅ Hintergrundmusik ausgewählt!');
    
    // ✅ EXTENDED DELAY: 6 seconds after music
    await new Promise(r => setTimeout(r, 6000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 4.5: Auto-assign Sound Effects
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 4.5: Auto-assigning sound effects... ═══');
    await updateProgress('sound-effects', 4, 75, '🔊 Weise Sound-Effekte den Szenen zu...');
    
    const soundEffects: Array<{ sceneId: string; soundUrl: string; volume: number; startTime: number }> = [];
    
    let cumulativeTime = 0;
    for (const scene of script.scenes || []) {
      const sceneType = scene.actType || scene.type || 'hook';
      const mapping = SOUND_EFFECTS_MAPPING[sceneType] || SOUND_EFFECTS_MAPPING['hook'];
      const soundId = mapping.sounds[0];
      const soundUrl = SOUND_LIBRARY[soundId];
      
      if (soundUrl) {
        soundEffects.push({
          sceneId: scene.id,
          soundUrl,
          volume: 0.5,
          startTime: cumulativeTime + 0.3, // Slight delay for impact
        });
      }
      cumulativeTime += scene.durationSeconds || 5;
    }
    
    console.log(`✅ Assigned ${soundEffects.length} sound effects`);
    await updateProgress('sound-effects', 4, 78, `✅ ${soundEffects.length} Sound-Effekte zugewiesen!`);
    
    // ✅ EXTENDED DELAY: 4 seconds after sound effects
    await new Promise(r => setTimeout(r, 4000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Render Videos (3 formats)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 5: Rendering videos... ═══');
    
    const renderResults: Record<string, any> = {};
    const formats = ['16:9', '9:16', '1:1'];
    
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const formatProgress = 78 + Math.floor((i / formats.length) * 18);
      
      await updateProgress(`render-${format.replace(':', '-')}`, 5 + i, formatProgress, `🎬 Rendere ${format} Format...`);
      
      try {
        const renderResponse = await supabase.functions.invoke('render-with-remotion', {
          body: {
            component_name: 'UniversalVideo',
            aspect_ratio: format,
            customizations: {
              voiceoverUrl,
              voiceoverDuration: duration,
              backgroundMusicUrl: musicUrl,
              backgroundMusicVolume: 0.3,
              soundEffects, // ✅ Include sound effects
              scenes: script.scenes.map((scene: any, idx: number) => ({
                ...scene,
                background: {
                  type: 'image',
                  imageUrl: assets[idx]?.imageUrl
                }
              })),
              subtitles: consultationResult.subtitlesEnabled ? [] : undefined,
            },
            format: 'mp4',
            quality: 'hd'
          }
        });

        if (renderResponse.data?.render_id) {
          renderResults[format] = {
            status: 'rendering',
            renderId: renderResponse.data.render_id
          };
          console.log(`✅ Render started for ${format}: ${renderResponse.data.render_id}`);
        } else {
          renderResults[format] = { status: 'failed', error: 'No render ID' };
        }
      } catch (err) {
        console.error(`Render error for ${format}:`, err);
        renderResults[format] = { status: 'failed', error: String(err) };
      }
      
      // ✅ EXTENDED DELAY: 6 seconds per format for visibility
      await new Promise(r => setTimeout(r, 6000));
    }

    // ═══════════════════════════════════════════════════════════════
    // COMPLETE
    // ═══════════════════════════════════════════════════════════════
    const projectData = {
      script,
      assets,
      voiceoverUrl,
      musicUrl,
      soundEffects,
      renderResults,
      category,
      duration,
      characterSheetUrl,
      consultationResult
    };

    await supabase
      .from('universal_video_generation_progress')
      .update({
        current_step: 'completed',
        step_index: 8,
        progress: 100,
        message: '✅ Alle Videos werden gerendert!',
        project_data: projectData,
        voiceover_url: voiceoverUrl,
        music_url: musicUrl,
        render_results: renderResults,
        script,
        assets_json: assets
      })
      .eq('id', progressId);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 UNIVERSAL VIDEO PIPELINE COMPLETED');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('[Pipeline Error]:', error);
    await supabase
      .from('universal_video_generation_progress')
      .update({
        current_step: 'error',
        error: error instanceof Error ? error.message : 'Pipeline error',
        message: `❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      })
      .eq('id', progressId);
  }
}

function generateSVGFallback(sceneType: string, title: string): string {
  const colors: Record<string, string> = {
    hook: '#F59E0B', problem: '#EF4444', solution: '#10B981',
    feature: '#3B82F6', proof: '#8B5CF6', cta: '#F5C76A',
    intro: '#6366F1', conflict: '#DC2626', turning_point: '#F97316',
    resolution: '#22C55E', moral: '#A855F7', content: '#0EA5E9',
    steps: '#14B8A6', tips: '#F59E0B', summary: '#6366F1',
  };
  const icons: Record<string, string> = {
    hook: '💡', problem: '❓', solution: '✅', feature: '⭐', proof: '📈',
    cta: '🚀', intro: '👋', conflict: '⚡', turning_point: '🔄',
    resolution: '🎯', moral: '💎', content: '📝', steps: '📋',
    tips: '💡', summary: '📊',
  };
  
  const color = colors[sceneType] || '#F5C76A';
  const icon = icons[sceneType] || '💡';
  const bgColor = '#0f172a';
  const safeTitle = (title || sceneType).replace(/[<>"'&]/g, '').substring(0, 30);
  
  const svg = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.5"/>
        <stop offset="50%" stop-color="${color}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${bgColor}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgColor}"/>
        <stop offset="50%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="${bgColor}"/>
      </linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/>
    <ellipse cx="960" cy="540" rx="500" ry="350" fill="url(#glow)"/>
    <circle cx="960" cy="460" r="140" fill="${color}" opacity="0.15"/>
    <circle cx="960" cy="460" r="100" fill="${color}" opacity="0.3"/>
    <circle cx="960" cy="460" r="70" fill="${color}"/>
    <text x="960" y="485" text-anchor="middle" font-size="70" fill="white">${icon}</text>
    <rect x="560" y="620" width="800" height="80" rx="40" fill="${color}" opacity="0.1"/>
    <text x="960" y="675" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="white" font-weight="bold">${safeTitle}</text>
    <text x="960" y="750" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="${color}" letter-spacing="4">${sceneType.toUpperCase()}</text>
  </svg>`;
  
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
