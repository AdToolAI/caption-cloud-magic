import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoGenerateRequest {
  consultationResult: any;
  userId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { consultationResult, userId } = await req.json() as AutoGenerateRequest;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-generation for user:', userId);
    console.log('Consultation result:', JSON.stringify(consultationResult, null, 2));

    // Build briefing from consultation result
    const briefing = {
      productDescription: consultationResult.productSummary || 'Produkt',
      targetAudience: consultationResult.targetAudience || ['Allgemeine Zielgruppe'],
      style: consultationResult.recommendedStyle || 'flat-design',
      tone: consultationResult.recommendedTone || 'professional',
      duration: consultationResult.recommendedDuration || 60,
      language: consultationResult.audioPreferences?.language || 'de',
      voiceId: getVoiceId(consultationResult.audioPreferences),
      voiceName: getVoiceName(consultationResult.audioPreferences),
      character: consultationResult.characterPreferences?.hasCharacter ? {
        hasCharacter: true,
        gender: 'neutral',
        appearance: consultationResult.characterPreferences.appearance || ''
      } : { hasCharacter: false },
      productDetails: consultationResult.productDetails,
      audienceDetails: consultationResult.audienceDetails,
      audioPreferences: consultationResult.audioPreferences,
      customStyleDescription: consultationResult.customStyleDescription,
      extractedStyleGuide: consultationResult.extractedStyleGuide,
    };

    // Step 1: Generate Script
    console.log('Step 1: Generating script...');
    const scriptResponse = await supabase.functions.invoke('generate-explainer-script', {
      body: briefing
    });

    if (scriptResponse.error) {
      throw new Error(`Script generation failed: ${scriptResponse.error.message}`);
    }

    const script = scriptResponse.data;
    console.log('Script generated with', script.scenes?.length, 'scenes');

    // Step 2: Generate Character Sheet (if character is requested)
    let characterSheetUrl = null;
    if (briefing.character?.hasCharacter) {
      console.log('Step 2: Generating character sheet...');
      try {
        const characterResponse = await supabase.functions.invoke('generate-premium-visual', {
          body: {
            type: 'character-sheet',
            style: briefing.style,
            character: briefing.character,
            styleGuide: briefing.extractedStyleGuide,
          }
        });
        if (characterResponse.data?.imageUrl) {
          characterSheetUrl = characterResponse.data.imageUrl;
          console.log('Character sheet generated');
        }
      } catch (e) {
        console.error('Character sheet generation failed, continuing:', e);
      }
    }

    // Step 3: Generate Visuals for all scenes
    console.log('Step 3: Generating scene visuals...');
    const assets: Array<{
      id: string;
      sceneId: string;
      type: string;
      imageUrl: string;
      prompt: string;
      style: string;
      isPremium: boolean;
    }> = [];
    
    for (const scene of script.scenes || []) {
      try {
        console.log(`Generating visual for scene: ${scene.id}`);
        const visualResponse = await supabase.functions.invoke('generate-premium-visual', {
          body: {
            type: 'scene',
            sceneId: scene.id,
            sceneDescription: scene.visualDescription,
            style: briefing.style,
            character: briefing.character,
            characterSheetUrl,
            styleGuide: briefing.extractedStyleGuide,
            customStyleDescription: briefing.customStyleDescription,
          }
        });

        if (visualResponse.data?.imageUrl) {
          assets.push({
            id: crypto.randomUUID(),
            sceneId: scene.id,
            type: 'background',
            imageUrl: visualResponse.data.imageUrl,
            prompt: visualResponse.data.prompt || scene.visualDescription,
            style: briefing.style,
            isPremium: true,
          });
        }
      } catch (e) {
        console.error(`Visual generation failed for scene ${scene.id}:`, e);
      }
    }
    console.log(`Generated ${assets.length} scene visuals`);

    // Step 4: Generate Voice-Over
    console.log('Step 4: Generating voice-over...');
    let voiceoverUrl = null;
    
    // Combine all spoken text
    const fullScript = script.scenes?.map((s: any) => s.spokenText).join(' ') || '';
    
    try {
      const voiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
        body: {
          text: fullScript,
          voiceId: briefing.voiceId,
          language: briefing.language,
        }
      });

      if (voiceResponse.data?.audioUrl) {
        voiceoverUrl = voiceResponse.data.audioUrl;
        console.log('Voice-over generated');
      }
    } catch (e) {
      console.error('Voice-over generation failed:', e);
    }

    // Step 5: Select Background Music
    console.log('Step 5: Selecting background music...');
    let backgroundMusicUrl = null;
    
    const musicStyle = consultationResult.audioPreferences?.musicStyle || 'upbeat';
    if (musicStyle !== 'none') {
      try {
        const musicResponse = await supabase.functions.invoke('suggest-video-music', {
          body: {
            mood: musicStyle,
            duration: briefing.duration,
          }
        });

        if (musicResponse.data?.tracks?.[0]?.audio) {
          backgroundMusicUrl = musicResponse.data.tracks[0].audio;
          console.log('Background music selected');
        }
      } catch (e) {
        console.error('Music selection failed:', e);
      }
    }

    // Step 5.5: Auto-assign Sound Effects based on scene types
    console.log('Step 5.5: Auto-assigning sound effects...');
    const soundEffects: Array<{ sceneId: string; soundUrl: string; volume: number; startTime: number }> = [];
    
    // Scene type to sound effect mapping
    const sceneSoundMapping: Record<string, { category: string; sounds: string[] }> = {
      'hook': { category: 'impact', sounds: ['impact-reveal', 'whoosh-fast'] },
      'problem': { category: 'notification', sounds: ['error-buzz', 'impact-punch'] },
      'solution': { category: 'notification', sounds: ['success-chime', 'swoosh-magic'] },
      'feature': { category: 'ui', sounds: ['click-soft', 'whoosh-soft'] },
      'proof': { category: 'notification', sounds: ['success-chime', 'notification-ding'] },
      'cta': { category: 'impact', sounds: ['impact-boom', 'impact-reveal'] },
    };
    
    // Sound effect URLs (Freesound.org public domain)
    const soundLibrary: Record<string, string> = {
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
    
    let cumulativeTime = 0;
    for (const scene of script.scenes || []) {
      const mapping = sceneSoundMapping[scene.type] || sceneSoundMapping['hook'];
      const soundId = mapping.sounds[0]; // Use first recommended sound
      const soundUrl = soundLibrary[soundId];
      
      if (soundUrl) {
        soundEffects.push({
          sceneId: scene.id,
          soundUrl,
          volume: 0.6,
          startTime: cumulativeTime + 0.3, // Slight delay after scene start
        });
      }
      cumulativeTime += scene.durationSeconds || 5;
    }
    console.log(`Assigned ${soundEffects.length} sound effects`);

    // Step 5.6: Generate Subtitles from Voice-Over Text
    console.log('Step 5.6: Generating subtitles...');
    const subtitles: Array<{ text: string; startTime: number; endTime: number }> = [];
    
    let subtitleTime = 0;
    for (const scene of script.scenes || []) {
      const spokenText = scene.spokenText || '';
      const sceneDuration = scene.durationSeconds || 5;
      
      if (spokenText) {
        // Split into sentences for subtitle chunks
        const sentences = spokenText.match(/[^.!?]+[.!?]+/g) || [spokenText];
        const timePerSentence = sceneDuration / sentences.length;
        
        for (let i = 0; i < sentences.length; i++) {
          subtitles.push({
            text: sentences[i].trim(),
            startTime: subtitleTime + (i * timePerSentence),
            endTime: subtitleTime + ((i + 1) * timePerSentence) - 0.1,
          });
        }
      }
      subtitleTime += sceneDuration;
    }
    console.log(`Generated ${subtitles.length} subtitle segments`);

    // Step 6: Prepare render configuration with enhanced animations
    console.log('Step 6: Preparing render configuration...');
    
    // Assign Ken Burns and Parallax animations to scenes
    const enhancedScenes = (script.scenes || []).map((scene: any, index: number) => {
      const asset = assets.find((a: any) => a.sceneId === scene.id);
      
      // Alternate between Ken Burns and Parallax for visual interest
      const animation = index % 3 === 0 ? 'kenBurns' : index % 3 === 1 ? 'parallax' : 'zoomIn';
      const kenBurnsDirections = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
      const kenBurnsDirection = kenBurnsDirections[index % kenBurnsDirections.length];
      
      // Use more dynamic text animations
      const textAnimations = ['fadeWords', 'splitReveal', 'glowPulse', 'highlight'] as const;
      const textAnimation = textAnimations[index % textAnimations.length];
      
      return {
        ...scene,
        imageUrl: asset?.imageUrl,
        animation,
        kenBurnsDirection,
        textAnimation,
        parallaxLayers: 3,
      };
    });
    
    const animationConfig = {
      entryAnimation: 'fade-in',
      exitAnimation: 'fade-out',
      transitionType: 'dissolve',
      transitionDuration: 0.5,
      textAnimation: 'slide-up',
      preset: 'professional',
    };

    const audioConfig = {
      voiceoverUrl,
      backgroundMusicUrl,
      voiceVolume: 1.0,
      musicVolume: 0.3,
    };
    
    const subtitleConfig = {
      enabled: true,
      position: 'bottom' as const,
      fontSize: 32,
      fontColor: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.75)',
      animation: 'wordByWord' as const,
    };

    // Step 7: Render Videos
    console.log('Step 7: Starting video renders...');
    const formats = consultationResult.exportAllFormats 
      ? ['16:9', '9:16', '1:1'] 
      : [consultationResult.primaryFormat || '16:9'];
    
    const renderResults: Record<string, any> = {};
    
    for (const format of formats) {
      try {
        const [width, height] = format === '16:9' ? [1920, 1080] : 
                                 format === '9:16' ? [1080, 1920] : [1080, 1080];
        
        console.log(`Rendering ${format} format...`);
        
        const renderResponse = await supabase.functions.invoke('render-with-remotion', {
          body: {
            composition_name: 'ExplainerVideo',
            input_props: {
              scenes: enhancedScenes,
              voiceoverUrl,
              backgroundMusicUrl,
              backgroundMusicVolume: 0.3,
              soundEffects,
              subtitles,
              subtitleConfig,
              style: briefing.style,
              primaryColor: briefing.extractedStyleGuide?.colorPalette?.primary || '#F5C76A',
              secondaryColor: briefing.extractedStyleGuide?.colorPalette?.secondary || '#8B5CF6',
              showSceneTitles: true,
              showProgressBar: true,
            },
            width,
            height,
            fps: 30,
          }
        });

        if (renderResponse.data?.renderId) {
          renderResults[format] = {
            renderId: renderResponse.data.renderId,
            status: 'rendering',
          };
        }
      } catch (e) {
        console.error(`Render failed for ${format}:`, e);
        renderResults[format] = { status: 'failed', error: String(e) };
      }
    }

    // Return complete project data
    const projectData = {
      id: crypto.randomUUID(),
      userId,
      name: `Erklärvideo - ${new Date().toLocaleDateString('de-DE')}`,
      briefing,
      script,
      assets,
      voiceoverUrl,
      backgroundMusicUrl,
      animationConfig,
      status: 'rendering',
      isAutoGenerated: true,
      renderResults,
      createdAt: new Date().toISOString(),
    };

    console.log('Auto-generation complete, renders started');

    return new Response(JSON.stringify({
      success: true,
      project: projectData,
      message: 'Video wird gerendert. Dies dauert ca. 5-10 Minuten.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Auto-generate explainer error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getVoiceId(audioPrefs: any): string {
  const lang = audioPrefs?.language || 'de';
  const gender = audioPrefs?.voiceGender || 'female';
  
  const voiceMap: Record<string, Record<string, string>> = {
    de: { female: 'EXAVITQu4vr4xnSDxMaL', male: 'JBFqnCBsd6RMkjVDRZzb' },
    en: { female: 'Xb7hH8MSUJpSbSDYk0k2', male: 'TX3LPaxmHKxFdv7VOQHJ' },
    fr: { female: 'FGY2WhTYpPnrIDTdsKH5', male: 'IKne3meq5aSn9XLyUdCD' },
    es: { female: 'XB0fDUnXU5powFXDhCwa', male: 'N2lVS1w4EtoT3dr4eOWO' },
    it: { female: 'XrExE9yKIg1WjnnlVkGX', male: 'nPczCjzI2devNBz1zQrb' },
  };
  
  return voiceMap[lang]?.[gender] || voiceMap.de.female;
}

function getVoiceName(audioPrefs: any): string {
  const lang = audioPrefs?.language || 'de';
  const gender = audioPrefs?.voiceGender || 'female';
  
  const nameMap: Record<string, Record<string, string>> = {
    de: { female: 'Sarah', male: 'George' },
    en: { female: 'Alice', male: 'Liam' },
    fr: { female: 'Laura', male: 'Charlie' },
    es: { female: 'Charlotte', male: 'Callum' },
    it: { female: 'Matilda', male: 'Brian' },
  };
  
  return nameMap[lang]?.[gender] || nameMap.de.female;
}
