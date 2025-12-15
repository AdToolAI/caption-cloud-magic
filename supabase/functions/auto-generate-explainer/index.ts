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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { consultationResult, userId } = await req.json() as AutoGenerateRequest;
    
    console.log('Starting auto-generation for user:', userId);
    console.log('Consultation result:', JSON.stringify(consultationResult, null, 2));

    // Create progress record for realtime updates
    const progressId = crypto.randomUUID();
    const { error: progressInsertError } = await supabase
      .from('explainer_generation_progress')
      .insert({
        id: progressId,
        user_id: userId,
        current_step: 'pending',
        step_index: 0,
        progress: 0,
        message: 'Initialisiere KI-Generierung...',
      });
    
    if (progressInsertError) {
      console.error('Failed to create progress record:', progressInsertError);
    }

    // Helper function to update progress
    const updateProgress = async (step: string, stepIndex: number, progress: number, message: string, assets?: any[], projectData?: any) => {
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
        .from('explainer_generation_progress')
        .update(updateData)
        .eq('id', progressId);
      
    // ✅ LONGER delay for UI to update (prevents 0→100 jump) - 1.5 seconds
      await new Promise(r => setTimeout(r, 1500));
      console.log(`📊 Progress: ${step} (${stepIndex}) - ${progress}% - ${message}`);
    };
    
    // ✅ Generate SVG Fallback for failed images
    const generateSVGPlaceholder = (sceneType: string, title: string): string => {
      const colors: Record<string, string> = {
        hook: '#F59E0B',
        problem: '#EF4444',
        solution: '#10B981',
        feature: '#3B82F6',
        proof: '#8B5CF6',
        cta: '#F5C76A',
      };
      
      const icons: Record<string, string> = {
        hook: '💡',
        problem: '❓',
        solution: '✅',
        feature: '⭐',
        proof: '📈',
        cta: '🚀',
      };
      
      const color = colors[sceneType] || '#F5C76A';
      const icon = icons[sceneType] || '💡';
      const bgColor = '#0f172a';
      const safeTitle = (title || sceneType).replace(/[<>"'&]/g, '').substring(0, 30);
      
      const svg = `<svg width="1920" height="1080" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="${bgColor}" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${bgColor}"/>
            <stop offset="100%" stop-color="#1e293b"/>
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#bg)"/>
        <ellipse cx="960" cy="540" rx="400" ry="300" fill="url(#glow)"/>
        <circle cx="960" cy="480" r="120" fill="${color}" opacity="0.2"/>
        <circle cx="960" cy="480" r="80" fill="${color}" opacity="0.4"/>
        <circle cx="960" cy="480" r="50" fill="${color}"/>
        <text x="960" y="500" text-anchor="middle" font-size="60" fill="white">${icon}</text>
        <text x="960" y="700" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" fill="white" font-weight="bold">${safeTitle}</text>
        <text x="960" y="760" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="${color}" text-transform="uppercase">${sceneType.toUpperCase()}</text>
      </svg>`;
      
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    };

    // ✅ Extract product name from description
    const extractProductName = (description: string): string => {
      // Try to extract a short product name from the description
      const words = description.split(/[\s,.:;!?]+/).filter(w => w.length > 2);
      if (words.length <= 3) return words.join(' ');
      // Take first 2-3 meaningful words as product name
      return words.slice(0, 3).join(' ');
    };
    
    const productName = extractProductName(consultationResult.productSummary || consultationResult.productDetails || 'Produkt');

    // Build briefing from consultation result
    const briefing = {
      productDescription: consultationResult.productSummary || 'Produkt',
      productName, // ✅ Explicitly add product name
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
    console.log('Briefing for script generation:', JSON.stringify(briefing, null, 2));
    await updateProgress('script', 0, 10, 'Generiere Drehbuch mit 5-Akt Struktur...');
    
    const scriptResponse = await supabase.functions.invoke('generate-explainer-script', {
      body: { briefing }  // ✅ Als verschachteltes Objekt senden
    });

    if (scriptResponse.error) {
      console.error('Script generation error details:', scriptResponse.error);
      throw new Error(`Script generation failed: ${scriptResponse.error.message || JSON.stringify(scriptResponse.error)}`);
    }

    const scriptData = scriptResponse.data;
    if (!scriptData?.script) {
      console.error('No script in response:', scriptData);
      throw new Error(`Script generation returned empty response: ${JSON.stringify(scriptData)}`);
    }
    
    let script = scriptData.script;
    
    // ✅ Calculate scene timing (startTime, endTime, durationSeconds)
    let currentTime = 0;
    script.scenes = (script.scenes || []).map((scene: any, index: number) => {
      const durationSeconds = scene.duration || scene.durationSeconds || 5;
      const startTime = currentTime;
      const endTime = currentTime + durationSeconds;
      currentTime = endTime;
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        type: scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][index] || 'hook',
        durationSeconds,
        startTime,
        endTime,
        spokenText: scene.voiceover || scene.spokenText || '',
        visualDescription: scene.visualDescription || '',
        emotionalTone: scene.mood || scene.emotionalTone || 'neutral',
      };
    });
    
    console.log('Script generated with', script.scenes?.length, 'scenes');
    console.log('Scene timing calculated:', script.scenes.map((s: any) => ({ id: s.id, start: s.startTime, end: s.endTime, duration: s.durationSeconds })));
    await updateProgress('script', 0, 15, `Drehbuch mit ${script.scenes?.length || 5} Szenen erstellt`);
    
    // ✅ Explicit wait for user visibility
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Analyze Custom Style (if reference provided)
    let extractedStyleGuide = consultationResult.extractedStyleGuide;
    if (consultationResult.styleReferenceUrl && !extractedStyleGuide) {
      console.log('Step 1.5: Analyzing custom style reference...');
      await updateProgress('script', 0, 18, 'Analysiere Stil-Referenz...');
      
      try {
        const styleResponse = await supabase.functions.invoke('analyze-style-reference', {
          body: {
            imageUrls: [consultationResult.styleReferenceUrl],
            brandDescription: briefing.productDescription,
          }
        });
        
        if (styleResponse.data?.styleGuide) {
          extractedStyleGuide = styleResponse.data.styleGuide;
          console.log('Style guide extracted:', extractedStyleGuide);
        }
      } catch (e) {
        console.error('Style analysis failed, continuing with default:', e);
      }
    }

    // Step 2: Generate Character Sheet (if character is requested)
    let characterSheetUrl = null;
    if (briefing.character?.hasCharacter) {
      console.log('Step 2: Generating character sheet...');
      await updateProgress('character-sheet', 1, 20, 'Erstelle Character Sheet für Konsistenz...');
      
      try {
        const characterResponse = await supabase.functions.invoke('generate-premium-visual', {
          body: {
            type: 'character-sheet',
            style: briefing.style,
            character: briefing.character,
            styleGuide: extractedStyleGuide,
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
    await updateProgress('character-sheet', 1, 25, 'Character Sheet bereit');
    
    // ✅ Explicit wait for user visibility
    await new Promise(r => setTimeout(r, 2000));

    // Fallback images for each scene type - professional business illustrations
    const FALLBACK_SCENES: Record<string, string> = {
      'hook': 'Simple glowing lightbulb icon with radiating rays, bright gold on deep blue background, minimal flat 2D vector design, professional business illustration',
      'problem': 'Abstract frustrated business silhouette figure with red question marks floating around, simple geometric shapes, flat 2D vector, blue and red accent colors',
      'solution': 'Green checkmark inside glowing circle, puzzle pieces clicking together, flat 2D vector illustration, professional business aesthetic, gold and green accents',
      'feature': 'Three ascending podium blocks with star icons (1 star, 2 stars, 3 stars), bronze silver gold gradient, flat 2D business infographic style, no text no numbers',
      'proof': 'Abstract thumbs up icon with floating hearts and stars, social proof visualization, flat 2D vector, professional blue and gold colors',
      'cta': 'Simple rocket launching upward from platform, stars and speed lines, energetic flat 2D illustration, gold and cyan accent colors, call-to-action visual',
    };

    // Step 3: Generate Visuals for all scenes
    console.log('Step 3: Generating scene visuals...');
    await updateProgress('visuals', 2, 30, 'Generiere Premium-Visuals für Szenen...');
    
    const assets: Array<{
      id: string;
      sceneId: string;
      type: string;
      imageUrl: string;
      prompt: string;
      style: string;
      isPremium: boolean;
    }> = [];
    
    const totalScenes = script.scenes?.length || 5;
    
    // ✅ Sequential visual generation with retry logic
    for (let i = 0; i < (script.scenes || []).length; i++) {
      const scene = script.scenes[i];
      const sceneType = scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][i] || 'hook';
      const fallbackPrompt = FALLBACK_SCENES[sceneType] || FALLBACK_SCENES['hook'];
      
      const progressPercent = 30 + Math.round((i / totalScenes) * 25);
      await updateProgress('visuals', 2, progressPercent, `Generiere Visual ${i + 1}/${totalScenes}: ${scene.title || sceneType}...`);
      
      console.log(`🎨 Generating visual for scene ${i + 1}/${totalScenes}: ${scene.id}, type: ${sceneType}`);
      
      let imageUrl: string | null = null;
      let retries = 0;
      const maxRetries = 3;
      
      // ✅ Retry loop with exponential backoff
      while (retries < maxRetries && !imageUrl) {
        try {
          console.log(`  Attempt ${retries + 1}/${maxRetries} for scene ${scene.id}...`);
          
          const visualResponse = await supabase.functions.invoke('generate-premium-visual', {
            body: {
              type: 'scene',
              sceneId: scene.id,
              sceneDescription: scene.visualDescription || fallbackPrompt,
              style: briefing.style,
              character: briefing.character,
              characterSheetUrl,
              styleGuide: extractedStyleGuide,
              customStyleDescription: briefing.customStyleDescription,
              customStylePrompt: extractedStyleGuide?.customStylePrompt,
            }
          });
          
          if (visualResponse.data?.imageUrl && visualResponse.data.imageUrl.length > 10) {
            imageUrl = visualResponse.data.imageUrl;
            console.log(`  ✅ Visual generated successfully for scene ${scene.id}`);
          } else {
            console.warn(`  ⚠️ Empty imageUrl returned for scene ${scene.id}, retrying...`);
            retries++;
            if (retries < maxRetries) {
              await new Promise(r => setTimeout(r, 2000 * retries)); // Exponential backoff
            }
          }
        } catch (visualError) {
          console.error(`  ❌ Visual generation error for scene ${scene.id}:`, visualError);
          retries++;
          if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 2000 * retries));
          }
        }
      }
      
      // ✅ If all retries failed, use SVG fallback
      if (!imageUrl) {
        console.warn(`  ⚠️ All retries failed for scene ${scene.id}, using SVG fallback`);
        imageUrl = generateSVGPlaceholder(sceneType, scene.title || sceneType);
      }
      
      assets.push({
        id: crypto.randomUUID(),
        sceneId: scene.id,
        type: 'background',
        imageUrl,
        prompt: scene.visualDescription || fallbackPrompt,
        style: briefing.style,
        isPremium: !imageUrl.startsWith('data:'), // SVG fallbacks are not premium
      });
      
      // Update progress with assets after each scene
      await updateProgress('visuals', 2, progressPercent + 5, `Visual ${i + 1}/${totalScenes} erstellt`, assets);
      
      // Small delay between scenes to prevent rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
    
    console.log(`✅ Generated ${assets.length} scene visuals (${assets.filter(a => !a.imageUrl.startsWith('data:')).length} premium, ${assets.filter(a => a.imageUrl.startsWith('data:')).length} fallbacks)`);

    // Step 4: Generate Voice-Over
    console.log('Step 4: Generating voice-over...');
    await updateProgress('voiceover', 3, 55, 'Generiere professionellen Voice-Over...');
    
    let voiceoverUrl = null;
    const fullScript = script.scenes?.map((s: any) => s.spokenText || s.voiceover || '').filter(Boolean).join(' ') || '';
    
    // ✅ Enhanced logging for voiceover debugging
    console.log('Voiceover fullScript length:', fullScript.length);
    console.log('Voiceover fullScript preview:', fullScript.substring(0, 200));
    
    if (fullScript.trim().length > 10) {
      try {
        console.log('Calling generate-video-voiceover with:', {
          scriptTextLength: fullScript.length,
          voice: briefing.voiceId || 'aria',
          speed: 1.0,
        });
        
        const voiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
          body: {
            scriptText: fullScript,  // ✅ Korrekter Parameter-Name
            voice: briefing.voiceId || 'aria',
            speed: 1.0,
          }
        });

        console.log('Voiceover response:', JSON.stringify(voiceResponse.data, null, 2));
        console.log('Voiceover error:', voiceResponse.error);

        if (voiceResponse.data?.audioUrl) {
          voiceoverUrl = voiceResponse.data.audioUrl;
          console.log('✅ Voice-over generated successfully:', voiceoverUrl);
        } else if (voiceResponse.data?.url) {
          // Fallback for different response structure
          voiceoverUrl = voiceResponse.data.url;
          console.log('✅ Voice-over generated (fallback url):', voiceoverUrl);
        } else {
          console.error('❌ Voiceover response missing audioUrl:', voiceResponse.data);
        }
      } catch (e) {
        console.error('❌ Voice-over generation failed:', e);
      }
    } else {
      console.warn('⚠️ Skipping voiceover - script too short or empty');
    }
    await updateProgress('voiceover', 3, 60, voiceoverUrl ? 'Voice-Over generiert' : 'Voice-Over übersprungen');

    // Step 5: Select Background Music - FIXED with tested music library
    console.log('Step 5: Selecting background music...');
    await updateProgress('music', 4, 62, 'Wähle passende Hintergrundmusik...');
    
    // ✅ FIXED: Use direct music library instead of AI recommendations
    const MUSIC_LIBRARY: Record<string, string> = {
      'upbeat': 'https://cdn.pixabay.com/audio/2023/10/16/audio_fdb4cfc6f4.mp3',
      'calm': 'https://cdn.pixabay.com/audio/2022/03/24/audio_d1718ab41b.mp3',
      'corporate': 'https://cdn.pixabay.com/audio/2023/05/10/audio_6f5e7c8e91.mp3',
      'inspirational': 'https://cdn.pixabay.com/audio/2022/10/25/audio_8afbd77e7a.mp3',
      'energetic': 'https://cdn.pixabay.com/audio/2024/01/18/audio_eb32adf7d1.mp3',
      'emotional': 'https://cdn.pixabay.com/audio/2022/05/27/audio_61ca4a4e51.mp3',
      'professional': 'https://cdn.pixabay.com/audio/2022/03/10/audio_f6cb4e0c08.mp3',
      'cinematic': 'https://cdn.pixabay.com/audio/2022/01/18/audio_6b5d58e2b2.mp3',
    };
    
    let backgroundMusicUrl: string | null = null;
    const musicStyle = consultationResult.audioPreferences?.musicStyle || 'upbeat';
    
    if (musicStyle !== 'none') {
      // ✅ Direct lookup - no API call, always works
      backgroundMusicUrl = MUSIC_LIBRARY[musicStyle] || MUSIC_LIBRARY['upbeat'];
      console.log(`✅ Background music selected: ${musicStyle} → ${backgroundMusicUrl}`);
    } else {
      console.log('⏭️ Music disabled by user preference');
    }

    // Step 5.5: Auto-assign Sound Effects based on scene types
    console.log('Step 5.5: Auto-assigning sound effects...');
    await updateProgress('music', 4, 65, 'Weise Sound-Effekte zu...');
    
    const soundEffects: Array<{ sceneId: string; soundUrl: string; volume: number; startTime: number }> = [];
    
    const sceneSoundMapping: Record<string, { category: string; sounds: string[] }> = {
      'hook': { category: 'impact', sounds: ['impact-reveal', 'whoosh-fast'] },
      'problem': { category: 'notification', sounds: ['error-buzz', 'impact-punch'] },
      'solution': { category: 'notification', sounds: ['success-chime', 'swoosh-magic'] },
      'feature': { category: 'ui', sounds: ['click-soft', 'whoosh-soft'] },
      'proof': { category: 'notification', sounds: ['success-chime', 'notification-ding'] },
      'cta': { category: 'impact', sounds: ['impact-boom', 'impact-reveal'] },
    };
    
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
      const soundId = mapping.sounds[0];
      const soundUrl = soundLibrary[soundId];
      
      if (soundUrl) {
        soundEffects.push({
          sceneId: scene.id,
          soundUrl,
          volume: 0.6,
          startTime: cumulativeTime + 0.3,
        });
      }
      cumulativeTime += scene.durationSeconds || 5;
    }
    console.log(`Assigned ${soundEffects.length} sound effects`);

    // Step 5.6: Generate Subtitles from Voice-Over Text
    console.log('Step 5.6: Generating subtitles...');
    await updateProgress('music', 4, 68, 'Generiere Untertitel...');
    
    const subtitles: Array<{ text: string; startTime: number; endTime: number }> = [];
    
    let subtitleTime = 0;
    for (const scene of script.scenes || []) {
      const spokenText = scene.spokenText || '';
      const sceneDuration = scene.durationSeconds || 5;
      
      if (spokenText) {
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
    await updateProgress('music', 4, 70, 'Audio-Konfiguration abgeschlossen');

    // Step 6: Prepare render configuration with enhanced animations
    console.log('Step 6: Preparing render configuration...');
    
    const enhancedScenes = (script.scenes || []).map((scene: any, index: number) => {
      const asset = assets.find((a: any) => a.sceneId === scene.id);
      
      const animation = index % 3 === 0 ? 'kenBurns' : index % 3 === 1 ? 'parallax' : 'zoomIn';
      const kenBurnsDirections = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
      const kenBurnsDirection = kenBurnsDirections[index % kenBurnsDirections.length];
      
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

    // Use extracted style guide colors if available
    const primaryColor = extractedStyleGuide?.colorPalette?.primary || '#F5C76A';
    const secondaryColor = extractedStyleGuide?.colorPalette?.secondary || '#8B5CF6';

    // Step 7: Render Videos
    console.log('Step 7: Starting video renders...');
    await updateProgress('render', 5, 75, 'Starte Video-Rendering...');
    
    const formats = consultationResult.exportAllFormats 
      ? ['16:9', '9:16', '1:1'] 
      : [consultationResult.primaryFormat || '16:9'];
    
    const renderResults: Record<string, any> = {};
    
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      try {
        const [width, height] = format === '16:9' ? [1920, 1080] : 
                                 format === '9:16' ? [1080, 1920] : [1080, 1080];
        
        const stepLabel = format === '16:9' ? 'render-16-9' : format === '9:16' ? 'render-9-16' : 'render-1-1';
        await updateProgress(stepLabel, 5 + i, 75 + (i * 8), `Rendere ${format} Format...`);
        
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
              primaryColor,
              secondaryColor,
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
      extractedStyleGuide,
      createdAt: new Date().toISOString(),
    };

    // Mark as completed with project data
    await updateProgress('completed', 8, 100, 'Erklärvideo erfolgreich erstellt!', assets, projectData);

    console.log('Auto-generation complete, renders started');

    return new Response(JSON.stringify({
      success: true,
      progressId,
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
