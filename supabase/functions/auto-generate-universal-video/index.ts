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
      await new Promise(r => setTimeout(r, 2000));
    };

    const cleanupVoiceover = (text: string): string => {
      if (!text) return '';
      let cleaned = text;
      const forbiddenPatterns = [
        /Also ich habe:?\s*[^.!?\n]*/gi,
        /Ich habe:?\s*[^.!?\n]*/gi,
        /Also\.\.\.:?\s*[^.!?\n]*/gi,
        /^Also[,:\s]+/gim,
      ];
      for (const pattern of forbiddenPatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
      return cleaned.replace(/\s+/g, ' ').trim();
    };

    const duration = consultationResult.duration || 60;

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Generate Script
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 1: Generating script... ═══');
    await updateProgress('script', 0, 5, '📝 Generiere kategoriespezifisches Drehbuch...');
    await new Promise(r => setTimeout(r, 5000));

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
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        durationSeconds: sceneDuration,
        startTime,
        endTime,
        spokenText: cleanupVoiceover(scene.voiceover || scene.spokenText || ''),
        voiceover: cleanupVoiceover(scene.voiceover || scene.spokenText || ''),
      };
    });
    
    console.log('✅ Script generated with', script.scenes?.length, 'scenes');
    await updateProgress('script', 0, 15, `✅ Drehbuch mit ${script.scenes?.length} Szenen erstellt!`, undefined, { script });
    await new Promise(r => setTimeout(r, 8000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Generate Visuals
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 2: Generating visuals... ═══');
    await updateProgress('visuals', 1, 20, '🎨 Generiere Szenen-Visuals...');
    
    const assets: any[] = [];
    const totalScenes = script.scenes?.length || 5;
    
    for (let i = 0; i < totalScenes; i++) {
      const scene = script.scenes[i];
      const sceneProgress = 20 + Math.floor((i / totalScenes) * 30);
      
      await updateProgress('visuals', 1, sceneProgress, `🎨 Generiere Visual ${i + 1}/${totalScenes}: ${scene.title}`);
      
      try {
        const visualResponse = await supabase.functions.invoke('generate-premium-visual', {
          body: {
            sceneDescription: scene.visualDescription,
            style: consultationResult.visualStyle || 'flat-design',
            mood: scene.mood || 'professional',
            aspectRatio: consultationResult.aspectRatio || '16:9'
          }
        });

        if (visualResponse.data?.imageUrl) {
          assets.push({
            sceneId: scene.id,
            imageUrl: visualResponse.data.imageUrl,
            type: 'image'
          });
          console.log(`✅ Visual ${i + 1} generated`);
        } else {
          console.warn(`⚠️ Visual ${i + 1} failed, using fallback`);
          assets.push({
            sceneId: scene.id,
            imageUrl: generateSVGFallback(scene.actType || 'hook', scene.title),
            type: 'svg-fallback'
          });
        }
      } catch (err) {
        console.error(`Error generating visual ${i + 1}:`, err);
        assets.push({
          sceneId: scene.id,
          imageUrl: generateSVGFallback(scene.actType || 'hook', scene.title),
          type: 'svg-fallback'
        });
      }
      
      await new Promise(r => setTimeout(r, 4000));
    }
    
    await updateProgress('visuals', 1, 50, `✅ ${assets.length} Visuals generiert!`, assets);
    await new Promise(r => setTimeout(r, 5000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Generate Voice-Over
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 3: Generating voice-over... ═══');
    await updateProgress('voiceover', 2, 55, '🎤 Generiere professionelles Voice-Over...');
    
    const fullVoiceover = script.scenes.map((s: any) => s.spokenText || s.voiceover).join(' ');
    let voiceoverUrl = '';
    
    try {
      const voiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
        body: {
          scriptText: fullVoiceover,
          voiceId: consultationResult.voiceId || 'pNInz6obpgDQGcFmaJgB', // Adam default
          language: consultationResult.language || 'de'
        }
      });

      if (voiceResponse.data?.audioUrl) {
        voiceoverUrl = voiceResponse.data.audioUrl;
        console.log('✅ Voice-over generated');
      }
    } catch (err) {
      console.error('Voice-over generation error:', err);
    }
    
    await updateProgress('voiceover', 2, 65, '✅ Voice-Over erstellt!');
    await new Promise(r => setTimeout(r, 5000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Select Music
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 4: Selecting music... ═══');
    await updateProgress('music', 3, 70, '🎵 Wähle passende Hintergrundmusik...');
    
    let musicUrl = '';
    try {
      const musicResponse = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: consultationResult.musicStyle || 'corporate upbeat',
          duration: duration
        }
      });
      
      if (musicResponse.data?.results?.[0]?.url) {
        musicUrl = musicResponse.data.results[0].url;
        console.log('✅ Music selected');
      }
    } catch (err) {
      console.error('Music selection error:', err);
    }
    
    await updateProgress('music', 3, 75, '✅ Musik ausgewählt!');
    await new Promise(r => setTimeout(r, 4000));

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Render Videos (3 formats)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 5: Rendering videos... ═══');
    
    const renderResults: Record<string, any> = {};
    const formats = ['16:9', '9:16', '1:1'];
    
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const formatProgress = 75 + Math.floor((i / formats.length) * 20);
      
      await updateProgress(`render-${format.replace(':', '-')}`, 4 + i, formatProgress, `🎬 Rendere ${format} Format...`);
      
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
      
      await new Promise(r => setTimeout(r, 3000));
    }

    // ═══════════════════════════════════════════════════════════════
    // COMPLETE
    // ═══════════════════════════════════════════════════════════════
    const projectData = {
      script,
      assets,
      voiceoverUrl,
      musicUrl,
      renderResults,
      category,
      duration,
      consultationResult
    };

    await supabase
      .from('universal_video_generation_progress')
      .update({
        current_step: 'completed',
        step_index: 7,
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
