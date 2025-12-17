import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
// NOTE: Direct renderMediaOnLambda import removed - using render-with-remotion Edge Function instead
// to avoid Deno compatibility issues with @remotion/lambda-client (module.require not implemented)

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
    const { 
      script, 
      briefing, 
      voiceoverUrl, 
      musicUrl, 
      userId,
      // ✅ NEW: Accept subtitle, phoneme, and beat data
      subtitles = null,
      phonemeTimestamps = null,
      beatSyncData = null,
    } = await req.json();

    if (!script || !briefing || !userId) {
      throw new Error('Script, briefing, and userId are required');
    }

    console.log(`[render-universal-video] Starting render for user: ${userId}`);
    console.log(`[render-universal-video] Category: ${briefing.category}, Scenes: ${script.scenes?.length}`);
    console.log(`[render-universal-video] Features: subtitles=${!!subtitles}, phonemes=${!!phonemeTimestamps}, beatSync=${!!beatSyncData}`);

    // Get Remotion configuration
    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');
    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

    // Calculate dimensions based on aspect ratio
    const getDimensions = (aspectRatio: string) => {
      const dimensionMap: Record<string, { width: number; height: number }> = {
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '1:1': { width: 1080, height: 1080 },
        '4:5': { width: 1080, height: 1350 },
      };
      return dimensionMap[aspectRatio] || { width: 1920, height: 1080 };
    };

    const dimensions = getDimensions(briefing.aspectRatio || '16:9');
    const fps = 30;

    // Calculate total duration from scenes
    const totalDuration = script.scenes.reduce((acc: number, scene: any) => {
      return acc + (scene.durationSeconds || scene.duration || 5);
    }, 0);
    const durationInFrames = Math.ceil(totalDuration * fps);

    console.log(`[render-universal-video] Duration: ${totalDuration}s, Frames: ${durationInFrames}`);

    // Transform scenes to Remotion format with FULL animation support
    const remotionScenes = script.scenes.map((scene: any, index: number) => {
      const startTime = script.scenes.slice(0, index).reduce((acc: number, s: any) => 
        acc + (s.durationSeconds || s.duration || 5), 0);
      const duration = scene.durationSeconds || scene.duration || 5;
      const sceneType = scene.sceneType || scene.type || 'content';
      
      return {
        id: `scene-${index}`,
        sceneNumber: scene.sceneNumber || index + 1,
        type: sceneType,
        sceneType: sceneType,
        
        // Content
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        spokenText: scene.voiceover || '',
        voiceover: scene.voiceover || '',
        visualDescription: scene.visualDescription || '',
        
        // Timing
        duration: duration,
        durationSeconds: duration,
        startTime,
        endTime: startTime + duration,
        
        // Background
        background: {
          type: scene.imageUrl ? 'image' : 'gradient',
          imageUrl: scene.imageUrl,
          gradientColors: briefing.brandColors || ['#3b82f6', '#1e40af'],
        },
        
        // ====== ANIMATION FEATURES ======
        animation: scene.animation || getDefaultAnimation(sceneType),
        kenBurnsDirection: scene.kenBurnsDirection || 'in',
        
        // Text Animation
        textOverlay: {
          enabled: true,
          text: scene.title || '',
          animation: scene.textAnimation || getDefaultTextAnimation(sceneType),
          position: scene.textPosition || 'center',
        },
        textAnimation: scene.textAnimation || getDefaultTextAnimation(sceneType),
        textPosition: scene.textPosition || 'center',
        
        // Sound Effects
        soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType),
        soundEffectType: scene.soundEffect || getDefaultSoundEffect(sceneType),
        
        // Character System
        showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType),
        characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType),
        characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType),
        
        // Stats & Overlays
        statsOverlay: scene.statsOverlay || null,
        
        // Beat Sync
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        
        // Transitions
        transition: {
          type: scene.transitionIn || 'fade',
          duration: 0.5,
          direction: 'right',
        },
        transitionIn: scene.transitionIn || 'fade',
        transitionOut: scene.transitionOut || 'fade',
      };
    });

    console.log(`[render-universal-video] Transformed ${remotionScenes.length} scenes with animations`);
    console.log(`[render-universal-video] Sample scene animations:`, JSON.stringify({
      scene0: {
        type: remotionScenes[0]?.sceneType,
        animation: remotionScenes[0]?.animation,
        textAnimation: remotionScenes[0]?.textAnimation,
        soundEffect: remotionScenes[0]?.soundEffect,
        showCharacter: remotionScenes[0]?.showCharacter,
      }
    }));

    // Build input props for UniversalCreatorVideo template with FULL feature set
    const inputProps = {
      // Category & Structure
      category: briefing.category || 'marketing',
      storytellingStructure: briefing.storytellingStructure || 'problem-solution',
      
      // Content
      title: script.title || briefing.productName || 'Video',
      subtitle: script.subtitle || briefing.tagline || '',
      scenes: remotionScenes,
      
      // Styling
      primaryColor: briefing.brandColors?.[0] || '#3b82f6',
      secondaryColor: briefing.brandColors?.[1] || '#1e40af',
      fontFamily: briefing.fontFamily || 'Inter',
      visualStyle: briefing.visualStyle || 'modern-3d',
      
      // Audio
      voiceoverUrl: voiceoverUrl || null,
      backgroundMusicUrl: musicUrl || null,
      voiceoverVolume: 1,
      musicVolume: 0.3,
      masterVolume: 1,
      
      // ====== CHARACTER SYSTEM ======
      useCharacter: briefing.hasCharacter !== false,
      characterType: briefing.characterType || 'lottie', // lottie, rive, svg
      characterName: briefing.characterName || 'Assistant',
      
      // ====== PHONEME DATA FOR LIP-SYNC ======
      phonemeTimestamps: phonemeTimestamps || null,
      enableLipSync: !!phonemeTimestamps,
      
      // ====== SUBTITLES with Karaoke Animation ======
      showSubtitles: (briefing.showSubtitles !== false) || !!subtitles,
      subtitles: subtitles || [], // ✅ Word-by-word timestamps for karaoke
      subtitleStyle: {
        position: briefing.subtitlePosition || 'bottom',
        animation: 'highlight', // Karaoke-style highlighting
        outlineStyle: 'glow',
        fontSize: 32,
        fontWeight: 'bold',
      },
      subtitlePosition: briefing.subtitlePosition || 'bottom',
      subtitleColor: '#ffffff',
      subtitleBackgroundColor: 'rgba(0,0,0,0.7)',
      
      // ====== SOUND EFFECTS ======
      enableSoundEffects: true,
      soundLibraryEnabled: true,
      
      // ====== BEAT SYNC ======
      beatSyncEnabled: !!beatSyncData,
      beatSyncData: beatSyncData || null, // ✅ BPM, beats, transition points
      
      // ====== VISUAL FEATURES ======
      showProgressBar: briefing.showProgressBar !== false,
      progressBarColor: briefing.brandColors?.[0] || '#3b82f6',
      showWatermark: briefing.showWatermark === true,
      watermarkText: briefing.watermarkText || '',
      watermarkPosition: 'bottom-right',
      
      // ====== ANIMATIONS GLOBAL ======
      defaultAnimation: 'fadeIn',
      enableKenBurns: true,
      enableParallax: true,
      
      // Format
      aspectRatio: briefing.aspectRatio || '16:9',
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps,
      durationInFrames,
    };
    
    console.log(`[render-universal-video] InputProps prepared with FULL feature set`);
    console.log(`[render-universal-video] Features: character=${inputProps.useCharacter}, lipSync=${inputProps.enableLipSync}, subtitles=${(subtitles || []).length} segments, beatSync=${!!beatSyncData} (${beatSyncData?.bpm || 0} BPM)`);

    // Call render-with-remotion Edge Function instead of direct Lambda invocation
    // This avoids Deno compatibility issues with @remotion/lambda-client
    const authHeader = req.headers.get('Authorization');
    
    console.log(`[render-universal-video] Calling render-with-remotion Edge Function...`);
    
    const renderResponse = await fetch(`${supabaseUrl}/functions/v1/render-with-remotion`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader || `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        component_name: 'UniversalCreatorVideo',
        customizations: inputProps,
        format: 'mp4',
        aspect_ratio: briefing.aspectRatio || '16:9',
        quality: 'hd',
        userId: userId, // ✅ Pass userId for Service Role authentication
      }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error('[render-universal-video] render-with-remotion failed:', renderResponse.status, errorText);
      throw new Error(`Render request failed: ${errorText}`);
    }

    const renderData = await renderResponse.json();
    console.log(`[render-universal-video] Render started via render-with-remotion`);
    console.log(`[render-universal-video] Render ID: ${renderData.renderId}`);
    console.log(`[render-universal-video] Bucket: ${renderData.bucketName}`);

    // Create render record
    const { error: renderError } = await supabase
      .from('video_renders')
      .insert({
        render_id: renderData.renderId,
        bucket_name: renderData.bucketName,
        format_config: {
          format: 'mp4',
          aspect_ratio: briefing.aspectRatio || '16:9',
          width: dimensions.width,
          height: dimensions.height,
        },
        content_config: {
          category: briefing.category,
          scenes: remotionScenes.length,
          hasVoiceover: !!voiceoverUrl,
          hasMusic: !!musicUrl,
          animations: remotionScenes.map((s: any) => s.animation),
          textAnimations: remotionScenes.map((s: any) => s.textAnimation),
          soundEffects: remotionScenes.map((s: any) => s.soundEffect),
          hasCharacter: inputProps.useCharacter,
        },
        subtitle_config: {
          enabled: briefing.showSubtitles !== false,
          style: briefing.subtitleStyle || 'modern',
          animation: 'highlight',
        },
        status: 'rendering',
        started_at: new Date().toISOString(),
        user_id: userId,
      });

    if (renderError) {
      console.error('[render-universal-video] Failed to create render record:', renderError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renderId: renderData.renderId,
        bucketName: renderData.bucketName,
        outputUrl: null,
        status: 'rendering',
        estimatedDuration: totalDuration,
        features: {
          animations: true,
          textAnimations: true,
          soundEffects: true,
          character: inputProps.useCharacter,
          subtitles: inputProps.showSubtitles,
          beatSync: inputProps.beatSyncEnabled,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[render-universal-video] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isThrottleError = errorMessage.includes('Rate Exceeded') ||
                           errorMessage.includes('Concurrency limit') ||
                           errorMessage.includes('TooManyRequestsException') ||
                           errorMessage.includes('ThrottlingException');

    if (isThrottleError) {
      return new Response(
        JSON.stringify({
          error: 'AWS Render-Kapazität vorübergehend erschöpft. Bitte versuche es in 1-2 Minuten erneut.',
          retryable: true,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ====== HELPER FUNCTIONS FOR INTELLIGENT DEFAULTS ======

function getDefaultAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'popIn',
    'intro': 'flyIn',
    'problem': 'kenBurns',
    'solution': 'morphIn',
    'feature': 'parallax',
    'benefit': 'slideUp',
    'proof': 'fadeIn',
    'testimonial': 'fadeIn',
    'cta': 'bounce',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'glowPulse',
    'intro': 'bounceIn',
    'problem': 'typewriter',
    'solution': 'splitReveal',
    'feature': 'bounceIn',
    'benefit': 'highlight',
    'proof': 'highlight',
    'testimonial': 'fadeWords',
    'cta': 'waveIn',
  };
  return map[sceneType] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'whoosh',
    'intro': 'whoosh',
    'problem': 'alert',
    'solution': 'success',
    'feature': 'pop',
    'benefit': 'pop',
    'proof': 'success',
    'testimonial': 'none',
    'cta': 'success',
  };
  return map[sceneType] || 'none';
}

function shouldShowCharacter(sceneType: string): boolean {
  return ['hook', 'problem', 'solution', 'cta', 'intro'].includes(sceneType);
}

function getDefaultCharacterPosition(sceneType: string): string {
  return sceneType === 'problem' ? 'left' : 'right';
}

function getDefaultCharacterGesture(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'pointing',
    'intro': 'waving',
    'problem': 'thinking',
    'solution': 'celebrating',
    'feature': 'pointing',
    'benefit': 'celebrating',
    'proof': 'idle',
    'testimonial': 'idle',
    'cta': 'pointing',
  };
  return map[sceneType] || 'idle';
}
