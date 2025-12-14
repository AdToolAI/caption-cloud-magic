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
    const assets = [];
    
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

    // Step 6: Prepare render configuration
    console.log('Step 6: Preparing render configuration...');
    
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
              briefing,
              script,
              assets,
              animationConfig,
              audioConfig,
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
