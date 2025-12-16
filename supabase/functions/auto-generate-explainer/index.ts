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

// ✅ Declare EdgeRuntime for Deno
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
    const { consultationResult, userId } = await req.json() as AutoGenerateRequest;
    
    console.log('🚀 Starting auto-generation for user:', userId);

    // ═══════════════════════════════════════════════════════════════
    // ✅ STEP 1: Create progress record IMMEDIATELY
    // ═══════════════════════════════════════════════════════════════
    const progressId = crypto.randomUUID();
    const { error: progressInsertError } = await supabase
      .from('explainer_generation_progress')
      .insert({
        id: progressId,
        user_id: userId,
        current_step: 'pending',
        step_index: 0,
        progress: 0,
        message: '🚀 Initialisiere KI-Generierung...',
      });
    
    if (progressInsertError) {
      console.error('Failed to create progress record:', progressInsertError);
      throw new Error('Could not initialize progress tracking');
    }

    console.log('✅ Progress record created:', progressId);

    // ═══════════════════════════════════════════════════════════════
    // ✅ STEP 2: Return progressId IMMEDIATELY (< 1 second response)
    // ═══════════════════════════════════════════════════════════════
    const immediateResponse = new Response(
      JSON.stringify({ 
        ok: true,
        success: true, 
        progressId,
        message: 'Generation gestartet - Progress-Updates folgen in Echtzeit' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    // ═══════════════════════════════════════════════════════════════
    // ✅ STEP 3: Run main generation pipeline in BACKGROUND
    // ═══════════════════════════════════════════════════════════════
    EdgeRuntime.waitUntil(
      runGenerationPipeline(supabase, progressId, userId, consultationResult)
    );

    console.log('✅ Background task started, returning immediate response');
    return immediateResponse;

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

// ═══════════════════════════════════════════════════════════════════════════
// ✅ MAIN GENERATION PIPELINE - Runs in background via EdgeRuntime.waitUntil()
// ═══════════════════════════════════════════════════════════════════════════
async function runGenerationPipeline(
  supabase: any, 
  progressId: string, 
  userId: string, 
  consultationResult: any
) {
  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎬 BACKGROUND PIPELINE STARTED');
    console.log('═══════════════════════════════════════════════════════════');

    // ✅ Helper function to update progress with LONG delays for visibility
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
        .from('explainer_generation_progress')
        .update(updateData)
        .eq('id', progressId);
      
      console.log(`📊 Progress: [${step}] ${stepIndex} - ${progress}% - ${message}`);
      
      // ✅ BASE delay of 2 seconds for UI to render
      await new Promise(r => setTimeout(r, 2000));
    };

    // ✅ AGGRESSIVE CLEANUP FUNCTION: Remove ALL forbidden German filler phrases
    const cleanupVoiceover = (text: string): string => {
      if (!text) return '';
      
      let cleaned = text;
      
      // ✅ ULTRA-AGGRESSIVE Patterns - alle Füllphrasen entfernen inkl. Doppelpunkte
      const forbiddenPatterns = [
        // ✅ KRITISCH: "Also ich habe:" mit Doppelpunkt und allen Varianten
        /Also ich habe:?\s*[^.!?\n]*/gi,
        /Also ich habe[^.!?:,\n]*/gi,
        /Also,?\s*ich habe:?\s*[^.!?\n]*/gi,
        /Ich habe:?\s*was[^.!?\n]*/gi,
        /Ich habe was[^.!?:,\n]*/gi,
        /Also\.\.\.:?\s*[^.!?\n]*/gi,
        /^Also[,:\s]+/gim,
        /Also,?\s+ich/gi,
        
        // Generische Ich-Sätze am Anfang
        /^Ich\s+(?!bin|biete|stelle|präsentiere|zeige)[^.!?\n]*/gim,
        
        // Alle Füllfloskeln mit optionalem Doppelpunkt
        /Hier kommt die Klarheit:?\s*[^.!?\n]*/gi,
        /Was mache ich jetzt\??\s*/gi,
        /Und hier kommt:?\s*/gi,
        /Na gut[,:?\s]*/gi,
        /Ganz ehrlich[,:?\s]*/gi,
        /Jetzt aber mal:?\s*/gi,
        /Aber das Beste:?\s*/gi,
        /Wie gesagt[,:?\s]*/gi,
        /Sozusagen[,:?\s]*/gi,
        /Quasi[,:?\s]*/gi,
        /Irgendwie[,:?\s]*/gi,
        /Naja[,:?\s]*/gi,
        /Eigentlich[,:?\s]*/gi,
        /Grundsätzlich[,:?\s]*/gi,
        
        // Fragen an sich selbst
        /Was soll ich sagen\??\s*/gi,
        /Was bedeutet das\??\s*/gi,
        /Kennst du das\??\s*/gi,
        
        // Leere Phrasen
        /Das ist so[,:?\s]*/gi,
        /Es ist halt so[,:?\s]*/gi,
        /Das Ding ist[,:?\s]*/gi,
      ];
      
      for (const pattern of forbiddenPatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
      
      // ✅ REKURSIVE PRÜFUNG: Falls "Also ich habe" immer noch vorkommt
      let iterations = 0;
      while (cleaned.toLowerCase().includes('also ich habe') && iterations < 5) {
        cleaned = cleaned.replace(/also ich habe:?\s*[^.!?\n]*/gi, '');
        iterations++;
      }
      
      // Cleanup: mehrfache Leerzeichen, Satzzeichen
      cleaned = cleaned
        .replace(/\s+/g, ' ')
        .replace(/\s+([.!?])/g, '$1')
        .replace(/([.!?])\s*([.!?])/g, '$1')
        .replace(/^\s+|\s+$/gm, '')
        .replace(/^[,:?\s]+/gm, '')  // Doppelpunkte/Kommas am Satzanfang entfernen
        .trim();
      
      // Groß-/Kleinschreibung nach Satzzeichen korrigieren
      cleaned = cleaned.replace(/([.!?]\s*)([a-zäöüß])/g, (_, p1, p2) => p1 + p2.toUpperCase());
      
      // Falls Satz mit Kleinbuchstabe beginnt, korrigieren
      if (cleaned.length > 0 && /^[a-zäöüß]/.test(cleaned)) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      
      return cleaned;
    };
    
    // ✅ Generate professional SVG Fallback for failed images
    const generateSVGPlaceholder = (sceneType: string, title: string): string => {
      const colors: Record<string, string> = {
        hook: '#F59E0B', problem: '#EF4444', solution: '#10B981',
        feature: '#3B82F6', proof: '#8B5CF6', cta: '#F5C76A',
      };
      const icons: Record<string, string> = {
        hook: '💡', problem: '❓', solution: '✅',
        feature: '⭐', proof: '📈', cta: '🚀',
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
    };

    const extractProductName = (description: string): string => {
      const words = description.split(/[\s,.:;!?]+/).filter(w => w.length > 2);
      if (words.length <= 3) return words.join(' ');
      return words.slice(0, 3).join(' ');
    };
    
    const productName = extractProductName(consultationResult.productSummary || consultationResult.productDetails || 'Produkt');

    const briefing = {
      productDescription: consultationResult.productSummary || 'Produkt',
      productName,
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
        appearance: consultationResult.characterPreferences.appearance || '',
        // ✅ PHASE 4: Character Appearance Config
        skinTone: consultationResult.characterPreferences?.skinTone,
        clothing: consultationResult.characterPreferences?.clothing,
      } : { hasCharacter: false },
      productDetails: consultationResult.productDetails,
      audienceDetails: consultationResult.audienceDetails,
      audioPreferences: consultationResult.audioPreferences,
      customStyleDescription: consultationResult.customStyleDescription,
      extractedStyleGuide: consultationResult.extractedStyleGuide,
      // ✅ PHASE 1: NEW 15-Phase Interview Consultation Data
      coreProblem: consultationResult.coreProblem || '',
      emotionalHook: consultationResult.emotionalHook || '',
      statsAndNumbers: consultationResult.statsAndNumbers || [],
      brandColors: consultationResult.brandColors || { primary: '#F5C76A', secondary: '#0f172a', accent: '#22d3ee' },
      ctaText: consultationResult.ctaText || 'Jetzt starten',
      ctaUrl: consultationResult.ctaUrl || '',
      introHookSentence: consultationResult.introHookSentence || '',
      referenceLinks: consultationResult.referenceLinks || [],
      preferredFont: consultationResult.preferredFont || 'poppins',
      // ✅ PHASE 1: Animation Quality from Interview
      animationQuality: consultationResult.animationQuality || 'standard',
      enableHailuoAnimation: consultationResult.enableHailuoAnimation || false,
    };
    
    console.log('📋 Briefing created with:', {
      style: briefing.style,
      tone: briefing.tone,
      duration: briefing.duration,
      hasCharacter: briefing.character?.hasCharacter,
      animationQuality: briefing.animationQuality,
      preferredFont: briefing.preferredFont,
      brandColors: briefing.brandColors,
    });

    // ═══════════════════════════════════════════════════════════════
    // 🎬 STEP 1: Generate Script (8-10 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 1: Generating script... ═══');
    await updateProgress('script', 0, 5, '📝 Analysiere Briefing und erstelle Drehbuch...');
    
    // ✅ LONG WAIT for user to see this step
    await new Promise(r => setTimeout(r, 5000));
    
    await updateProgress('script', 0, 8, '📝 Generiere 5-Akt Struktur für optimale Storytelling...');
    await new Promise(r => setTimeout(r, 3000));
    
    const scriptResponse = await supabase.functions.invoke('generate-explainer-script', {
      body: { briefing }
    });

    if (scriptResponse.error) {
      console.error('Script generation error:', scriptResponse.error);
      await updateProgress('script', 0, 0, `❌ Fehler: ${scriptResponse.error.message}`, undefined, { error: scriptResponse.error.message });
      return;
    }

    const scriptData = scriptResponse.data;
    if (!scriptData?.script) {
      console.error('No script in response:', scriptData);
      await updateProgress('script', 0, 0, '❌ Drehbuch-Generierung fehlgeschlagen', undefined, { error: 'No script returned' });
      return;
    }
    
    let script = scriptData.script;
    
    // Calculate scene timing
    let currentTime = 0;
    script.scenes = (script.scenes || []).map((scene: any, index: number) => {
      const durationSeconds = scene.duration || scene.durationSeconds || 5;
      const startTime = currentTime;
      const endTime = currentTime + durationSeconds;
      currentTime = endTime;
      
      const originalVoiceover = scene.voiceover || scene.spokenText || '';
      const cleanedVoiceover = cleanupVoiceover(originalVoiceover);
      
      // ✅ PHASE 5: Verbesserte Voiceover-Logging
      if (originalVoiceover !== cleanedVoiceover) {
        console.log(`🎤 Scene ${index + 1} Voiceover Cleanup:`);
        console.log(`   Original (${originalVoiceover.length} chars): "${originalVoiceover.substring(0, 80)}..."`);
        console.log(`   Cleaned (${cleanedVoiceover.length} chars): "${cleanedVoiceover.substring(0, 80)}..."`);
        console.log(`   Removed: ${originalVoiceover.length - cleanedVoiceover.length} characters`);
      }
      
      return {
        ...scene,
        id: scene.id || `scene${index + 1}`,
        type: scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][index] || 'hook',
        durationSeconds,
        startTime,
        endTime,
        spokenText: cleanedVoiceover,
        voiceover: cleanedVoiceover,
        visualDescription: scene.visualDescription || '',
        emotionalTone: scene.mood || scene.emotionalTone || 'neutral',
      };
    });
    
    console.log('✅ Script generated with', script.scenes?.length, 'scenes');
    
    await updateProgress('script', 0, 15, `✅ Drehbuch mit ${script.scenes?.length || 5} Szenen erstellt!`);
    
    // ✅ LONG WAIT: 8 seconds after script
    await new Promise(r => setTimeout(r, 8000));

    // ═══════════════════════════════════════════════════════════════
    // 🎨 STEP 1.5: Analyze Custom Style (if reference provided)
    // ═══════════════════════════════════════════════════════════════
    let extractedStyleGuide = consultationResult.extractedStyleGuide;
    
    // ✅ PHASE 2: Check for referenceLinks array AND single styleReferenceUrl
    const referenceUrls: string[] = [];
    if (consultationResult.styleReferenceUrl) {
      referenceUrls.push(consultationResult.styleReferenceUrl);
    }
    if (consultationResult.referenceLinks && Array.isArray(consultationResult.referenceLinks)) {
      referenceUrls.push(...consultationResult.referenceLinks.filter((url: string) => 
        url && url.startsWith('http')
      ));
    }
    
    // ✅ PHASE 2: Analyze all reference links if no style guide exists
    if (referenceUrls.length > 0 && !extractedStyleGuide) {
      console.log('═══ STEP 1.5: Analyzing custom style references... ═══');
      console.log(`📎 Found ${referenceUrls.length} reference link(s) to analyze`);
      await updateProgress('script', 0, 18, `🎨 Analysiere ${referenceUrls.length} Stil-Referenz(en) für konsistentes Design...`);
      
      try {
        const styleResponse = await supabase.functions.invoke('analyze-style-reference', {
          body: {
            imageUrls: referenceUrls.slice(0, 3), // Max 3 references to avoid timeout
            referenceUrls: referenceUrls.slice(0, 3),
            brandDescription: briefing.productDescription,
          }
        });
        
        if (styleResponse.data?.styleGuide) {
          extractedStyleGuide = styleResponse.data.styleGuide;
          console.log('✅ Style guide extracted from references:', {
            colorPalette: extractedStyleGuide.colorPalette,
            visualStyle: extractedStyleGuide.visualStyle,
            moodDescriptors: extractedStyleGuide.moodDescriptors?.slice(0, 3),
          });
        }
      } catch (e) {
        console.error('Style analysis failed:', e);
      }
      
      await new Promise(r => setTimeout(r, 4000));
    }

    // ═══════════════════════════════════════════════════════════════
    // 👤 STEP 2: Generate Character Sheet (6-8 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    let characterSheetUrl = null;
    if (briefing.character?.hasCharacter) {
      console.log('═══ STEP 2: Generating character sheet... ═══');
      await updateProgress('character-sheet', 1, 20, '👤 Erstelle Character Sheet für visuelle Konsistenz...');
      
      await new Promise(r => setTimeout(r, 4000));
      
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
          console.log('✅ Character sheet generated');
        }
      } catch (e) {
        console.error('Character sheet generation failed:', e);
      }
    }
    
    await updateProgress('character-sheet', 1, 25, '✅ Character Design abgeschlossen');
    
    // ✅ LONG WAIT: 6 seconds after character
    await new Promise(r => setTimeout(r, 6000));

    // ═══════════════════════════════════════════════════════════════
    // 🎨 STEP 3: Generate Scene Visuals (4 seconds per scene)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 3: Generating scene visuals... ═══');
    await updateProgress('visuals', 2, 28, '🎨 Starte Premium Visual-Generierung...');
    
    await new Promise(r => setTimeout(r, 4000));
    
    const FALLBACK_SCENES: Record<string, string> = {
      'hook': 'Simple glowing lightbulb icon, bright gold on deep blue, flat 2D vector, business infographic style, no text',
      'problem': 'Abstract frustrated figure with red question marks, simple geometric shapes, flat vector illustration, blue background',
      'solution': 'Green checkmark inside glowing circle, puzzle pieces connecting, flat 2D vector, professional business style',
      'feature': 'Three ascending bars with star icons, bronze silver gold gradient, flat 2D infographic, no numbers',
      'proof': 'Thumbs up icon with floating hearts and stars, flat vector illustration, blue and gold colors',
      'cta': 'Simple rocket launching upward, stars and speed lines, flat 2D illustration, gold and cyan colors',
    };
    
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
    
    for (let i = 0; i < (script.scenes || []).length; i++) {
      const scene = script.scenes[i];
      const sceneType = scene.type || ['hook', 'problem', 'solution', 'feature', 'cta'][i] || 'hook';
      const fallbackPrompt = FALLBACK_SCENES[sceneType] || FALLBACK_SCENES['hook'];
      
      const progressPercent = 30 + Math.round((i / totalScenes) * 30);
      await updateProgress('visuals', 2, progressPercent, `🎨 Generiere Visual ${i + 1}/${totalScenes}: ${scene.title || sceneType}...`);
      
      console.log(`🎨 Generating visual for scene ${i + 1}/${totalScenes}: ${scene.id}`);
      
      let imageUrl: string | null = null;
      let retries = 0;
      const maxRetries = 5;
      
      while (retries < maxRetries && !imageUrl) {
        try {
          const promptToUse = retries >= 2 ? fallbackPrompt : (scene.visualDescription || fallbackPrompt);
          
          const visualResponse = await supabase.functions.invoke('generate-premium-visual', {
            body: {
              type: 'scene',
              sceneId: scene.id,
              sceneDescription: promptToUse,
              style: retries >= 3 ? 'flat-design' : briefing.style,
              character: briefing.character,
              characterSheetUrl,
              styleGuide: extractedStyleGuide,
              // ✅ PHASE 2: Pass brand colors from 15-Phase Interview
              brandColors: briefing.brandColors,
            }
          });
          
          if (visualResponse.data?.imageUrl && visualResponse.data.imageUrl.length > 10) {
            imageUrl = visualResponse.data.imageUrl;
            console.log(`  ✅ Visual generated for scene ${scene.id}`);
          } else {
            retries++;
            if (retries < maxRetries) {
              await new Promise(r => setTimeout(r, 2000 * retries));
            }
          }
        } catch (visualError) {
          console.error(`  ❌ Visual error for scene ${scene.id}:`, visualError);
          retries++;
          if (retries < maxRetries) {
            await new Promise(r => setTimeout(r, 2000 * retries));
          }
        }
      }
      
      if (!imageUrl) {
        console.warn(`  ⚠️ Using SVG fallback for scene ${scene.id}`);
        imageUrl = generateSVGPlaceholder(sceneType, scene.title || sceneType);
      }
      
      assets.push({
        id: crypto.randomUUID(),
        sceneId: scene.id,
        type: 'background',
        imageUrl,
        prompt: scene.visualDescription || fallbackPrompt,
        style: briefing.style,
        isPremium: !imageUrl.startsWith('data:'),
      });
      
      await updateProgress('visuals', 2, progressPercent + 5, `✅ Visual ${i + 1}/${totalScenes} erstellt`, assets);
      
      // ✅ 4 seconds between each visual for visibility
      await new Promise(r => setTimeout(r, 4000));
    }
    
    console.log(`✅ Generated ${assets.length} scene visuals`);
    
    // ✅ 5 seconds after all visuals
    await new Promise(r => setTimeout(r, 5000));

    // Animation step moved to after voiceover for lip-sync support

    // ═══════════════════════════════════════════════════════════════
    // 🎤 STEP 4: Generate Voice-Over (8 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 4: Generating voice-over... ═══');
    await updateProgress('voiceover', 3, 62, '🎤 Generiere professionellen Voice-Over mit ElevenLabs...');
    
    await new Promise(r => setTimeout(r, 4000));
    
    let voiceoverUrl = null;
    let phonemeTimestamps: Array<{ character: string; start_time: number; end_time: number }> = [];
    
    // ✅ PHASE 1: Generate voiceover PER SCENE for better Hailuo lip-sync
    const sceneVoiceovers: Map<string, string> = new Map();
    
    const enableAnimation = consultationResult.animationQuality === 'animated' || 
                           consultationResult.enableHailuoAnimation === true;
    
    if (enableAnimation) {
      // ✅ PHASE 1: Generate individual voiceovers per scene for Hailuo
      console.log('🎤 Generating scene-specific voiceovers for Hailuo lip-sync...');
      
      for (let i = 0; i < (script.scenes || []).length; i++) {
        const scene = script.scenes[i];
        const sceneText = scene.spokenText || scene.voiceover || '';
        
        if (sceneText.trim().length > 5) {
          try {
            const sceneVoiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
              body: {
                scriptText: sceneText,
                voice: briefing.voiceId || 'aria',
                speed: 1.0,
                withTimestamps: false, // No timestamps needed for scene-specific
              }
            });
            
            if (sceneVoiceResponse.data?.audioUrl) {
              sceneVoiceovers.set(scene.id, sceneVoiceResponse.data.audioUrl);
              console.log(`  ✅ Scene ${i + 1} voiceover: ${sceneVoiceResponse.data.audioUrl.substring(0, 50)}...`);
            }
          } catch (e) {
            console.error(`  ❌ Scene ${i + 1} voiceover failed:`, e);
          }
        }
        
        await updateProgress('voiceover', 3, 62 + Math.round((i / script.scenes.length) * 4), 
          `🎤 Voice-Over für Szene ${i + 1}/${script.scenes.length}...`);
      }
      
      console.log(`✅ Generated ${sceneVoiceovers.size} scene-specific voiceovers`);
    }
    
    // ✅ ALSO generate full voiceover for the final video (background audio)
    const fullScript = script.scenes?.map((s: any) => s.spokenText || s.voiceover || '').filter(Boolean).join(' ') || '';
    
    if (fullScript.trim().length > 10) {
      try {
        // ✅ LOFT-FILM: Call with timestamps for lip-sync
        const voiceResponse = await supabase.functions.invoke('generate-video-voiceover', {
          body: {
            scriptText: fullScript,
            voice: briefing.voiceId || 'aria',
            speed: 1.0,
            withTimestamps: true, // ✅ Enable ElevenLabs timestamps API
          }
        });

        if (voiceResponse.data?.audioUrl) {
          voiceoverUrl = voiceResponse.data.audioUrl;
          console.log('✅ Full voice-over generated:', voiceoverUrl);
          
          // ✅ LOFT-FILM: Extract alignment data for lip-sync
          if (voiceResponse.data?.alignment) {
            const alignment = voiceResponse.data.alignment;
            if (alignment.characters && alignment.character_start_times_seconds && alignment.character_end_times_seconds) {
              phonemeTimestamps = alignment.characters.map((char: string, i: number) => ({
                character: char,
                start_time: alignment.character_start_times_seconds[i],
                end_time: alignment.character_end_times_seconds[i],
              }));
              console.log(`✅ Extracted ${phonemeTimestamps.length} phoneme timestamps for lip-sync`);
            }
          }
        } else if (voiceResponse.data?.url) {
          voiceoverUrl = voiceResponse.data.url;
        }
      } catch (e) {
        console.error('❌ Voice-over generation failed:', e);
      }
    }
    
    await updateProgress('voiceover', 3, 68, voiceoverUrl ? `✅ Voice-Over generiert mit ${phonemeTimestamps.length} Lip-Sync Timestamps!` : '⚠️ Voice-Over übersprungen');
    
    // ✅ LONG WAIT: 8 seconds after voiceover
    await new Promise(r => setTimeout(r, 8000));

    // ═══════════════════════════════════════════════════════════════
    // 🎬 STEP 4.5: Animate Scenes with Hailuo 2.3 (NEW!)
    // ═══════════════════════════════════════════════════════════════
    if (enableAnimation) {
      console.log('═══ STEP 4.5: Animating scenes with Hailuo 2.3... ═══');
      await updateProgress('animation', 3, 70, '🎬 Animiere Szenen mit KI-Bewegung (Hailuo 2.3)...');
      
      await new Promise(r => setTimeout(r, 3000));
      
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const scene = script.scenes[i];
        const sceneType = scene?.type || 'hook';
        
        // Determine motion intensity based on scene type
        const motionTypeMap: Record<string, 'subtle' | 'moderate' | 'dynamic'> = {
          'hook': 'dynamic',
          'problem': 'moderate',
          'solution': 'dynamic',
          'feature': 'subtle',
          'proof': 'moderate',
          'cta': 'dynamic',
        };
        const motionType = motionTypeMap[sceneType] || 'moderate';
        
        const animProgress = 70 + Math.round((i / assets.length) * 8);
        await updateProgress('animation', 3, animProgress, 
          `🎬 Animiere Szene ${i + 1}/${assets.length}: ${scene?.title || sceneType}...`);
        
        console.log(`🎬 Animating scene ${i + 1}/${assets.length} with Hailuo 2.3...`);
        
        try {
          // ✅ PHASE 1: Use scene-specific voiceover for proper Hailuo lip-sync
          const sceneVoiceoverUrl = sceneVoiceovers.get(scene.id) || null;
          
          console.log(`  📎 Using ${sceneVoiceoverUrl ? 'scene-specific' : 'no'} audio for Hailuo lip-sync`);
          
          const animationResponse = await supabase.functions.invoke('animate-scene-hailuo', {
            body: {
              imageUrl: asset.imageUrl,
              audioUrl: sceneVoiceoverUrl, // ✅ PHASE 1: Use scene-specific audio, not full voiceover
              sceneId: asset.sceneId,
              duration: scene?.durationSeconds || 5,
              motionType,
            }
          });
          
          if (animationResponse.data?.videoUrl) {
            // Store animated video URL in asset
            (asset as any).animatedVideoUrl = animationResponse.data.videoUrl;
            console.log(`  ✅ Scene ${i + 1} animated successfully`);
          } else {
            console.warn(`  ⚠️ Animation failed for scene ${i + 1}, using static image`);
          }
        } catch (animError) {
          console.error(`  ❌ Animation error for scene ${i + 1}:`, animError);
          // Continue without animation - fallback to Ken Burns
        }
        
        // 4 seconds between each animation for visibility
        await new Promise(r => setTimeout(r, 4000));
      }
      
      const animatedCount = assets.filter((a: any) => a.animatedVideoUrl).length;
      console.log(`✅ Animated ${animatedCount}/${assets.length} scenes`);
      
      await updateProgress('animation', 3, 78, 
        `✅ ${animatedCount} Szenen mit KI-Animation erstellt!`);
      
      // 5 seconds after animation step
      await new Promise(r => setTimeout(r, 5000));
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎵 STEP 5: Select Background Music with JAMENDO (6 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 5: Selecting background music... ═══');
    await updateProgress('music', 4, 70, '🎵 Suche passende Hintergrundmusik über Jamendo...');
    
    await new Promise(r => setTimeout(r, 4000));
    
    const MUSIC_LIBRARY_FALLBACK: Record<string, string> = {
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
      // ✅ PRIMARY: Try Jamendo API first
      try {
        console.log('🎵 Trying Jamendo API for music style:', musicStyle);
        
        const jamendoMoodMap: Record<string, string> = {
          'upbeat': 'happy energetic',
          'calm': 'relaxing peaceful',
          'corporate': 'business professional',
          'inspirational': 'inspiring uplifting',
          'energetic': 'dynamic powerful',
          'emotional': 'emotional touching',
          'professional': 'corporate modern',
          'cinematic': 'cinematic epic',
        };
        
        const searchMood = jamendoMoodMap[musicStyle] || musicStyle;
        
        const musicResponse = await supabase.functions.invoke('search-stock-music', {
          body: { 
            query: searchMood,
            mood: musicStyle,
            genre: 'instrumental'
          }
        });
        
        console.log('🎵 Jamendo response:', JSON.stringify(musicResponse.data, null, 2));
        
        // ✅ FIXED: Correct response parsing - .url is the field name
        if (musicResponse.data?.results?.[0]?.url) {
          backgroundMusicUrl = musicResponse.data.results[0].url;
          console.log('✅ Jamendo music found:', backgroundMusicUrl);
        } else if (musicResponse.data?.results?.[0]?.preview_url) {
          backgroundMusicUrl = musicResponse.data.results[0].preview_url;
          console.log('✅ Jamendo music found (preview_url):', backgroundMusicUrl);
        }
      } catch (jamendoError) {
        console.warn('⚠️ Jamendo API failed:', jamendoError);
      }
      
      // ✅ FALLBACK: Use Pixabay library if Jamendo failed
      if (!backgroundMusicUrl) {
        backgroundMusicUrl = MUSIC_LIBRARY_FALLBACK[musicStyle] || MUSIC_LIBRARY_FALLBACK['upbeat'];
        console.log(`📻 Using Pixabay fallback: ${musicStyle} → ${backgroundMusicUrl}`);
      }
    }
    
    await updateProgress('music', 4, 75, backgroundMusicUrl ? '✅ Hintergrundmusik ausgewählt!' : '⏭️ Keine Musik gewählt');
    
    // ✅ 6 seconds after music
    await new Promise(r => setTimeout(r, 6000));

    // ═══════════════════════════════════════════════════════════════
    // 🔊 STEP 5.5: Auto-assign Sound Effects (4 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 5.5: Auto-assigning sound effects... ═══');
    await updateProgress('sound-effects', 4, 78, '🔊 Weise Sound-Effekte den Szenen zu...');
    
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
    console.log(`✅ Assigned ${soundEffects.length} sound effects`);
    
    // ✅ 4 seconds after sound effects
    await new Promise(r => setTimeout(r, 4000));

    // ═══════════════════════════════════════════════════════════════
    // 📝 STEP 5.6: Generate Subtitles (4 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 5.6: Generating subtitles... ═══');
    await updateProgress('subtitles', 4, 82, '📝 Generiere Untertitel aus Voice-Over...');
    
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
    console.log(`✅ Generated ${subtitles.length} subtitle segments`);
    
    await updateProgress('subtitles', 4, 85, `✅ ${subtitles.length} Untertitel generiert`);
    
    // ✅ 4 seconds after subtitles
    await new Promise(r => setTimeout(r, 4000));

    // ═══════════════════════════════════════════════════════════════
    // ⚙️ STEP 6: Prepare Render Configuration (4 seconds visible)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 6: Preparing render configuration... ═══');
    await updateProgress('render-prep', 5, 88, '⚙️ Bereite Video-Rendering vor...');
    
    // ✅ LOFT-FILM: Scene types mit allen Animationen korrekt zuweisen
    const SCENE_TYPE_ORDER = ['hook', 'problem', 'solution', 'feature', 'cta'] as const;
    
    const enhancedScenes = (script.scenes || []).map((scene: any, index: number) => {
      const asset = assets.find((a: any) => a.sceneId === scene.id);
      
      // ✅ Scene-Type sicherstellen (fallback auf 5-Akt-Struktur)
      const sceneType = scene.type || SCENE_TYPE_ORDER[index] || 'hook';
      
      // ✅ LOFT-FILM: Ken Burns als Hauptanimation
      const animation = 'kenBurns';
      const kenBurnsDirections = ['in', 'out', 'left', 'right', 'up', 'down'] as const;
      const kenBurnsDirection = kenBurnsDirections[index % kenBurnsDirections.length];
      
      // ✅ LOFT-FILM: Text-Animation basierend auf Szenen-Typ
      const textAnimationMap: Record<string, string> = {
        hook: 'glowPulse',
        problem: 'fadeWords',
        solution: 'highlight',
        feature: 'splitReveal',
        cta: 'highlight',
      };
      const textAnimation = textAnimationMap[sceneType] || 'fadeWords';
      
      // ✅ LOFT-FILM: Character Action basierend auf Szenen-Typ
      const characterActionMap: Record<string, string> = {
        problem: 'thinking',
        solution: 'celebrating',
        cta: 'pointing',
      };
      const characterAction = characterActionMap[sceneType] || 'idle';
      
      // ✅ LOFT-FILM: Character nur bei Problem/Solution/CTA anzeigen
      const showCharacter = ['problem', 'solution', 'cta'].includes(sceneType);
      const characterPosition = sceneType === 'problem' ? 'left' : 'right';
      
      // 🎬 NEW: Hailuo 2.3 animation support
      const animatedVideoUrl = (asset as any)?.animatedVideoUrl || null;
      const useAnimationVideo = !!animatedVideoUrl;
      
      return {
        ...scene,
        type: sceneType,  // ✅ Sicherstellen dass type gesetzt ist
        imageUrl: asset?.imageUrl,
        animatedVideoUrl,  // 🎬 NEW: Hailuo animated video
        useAnimation: useAnimationVideo,  // 🎬 NEW: Enable video playback
        animation,
        kenBurnsDirection,
        textAnimation,
        parallaxLayers: 3,
        // ✅ LOFT-FILM Character Props
        showCharacter,
        characterAction,
        characterPosition,
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

    const primaryColor = extractedStyleGuide?.colorPalette?.primary || '#F5C76A';
    const secondaryColor = extractedStyleGuide?.colorPalette?.secondary || '#8B5CF6';
    
    // ✅ 4 seconds after config prep
    await new Promise(r => setTimeout(r, 4000));

    // ═══════════════════════════════════════════════════════════════
    // 🎬 STEP 7: Render Videos (6 seconds per format)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══ STEP 7: Starting video renders... ═══');
    await updateProgress('render', 6, 90, '🎬 Starte Video-Rendering mit Remotion Lambda...');
    
    const formats = consultationResult.exportAllFormats 
      ? ['16:9', '9:16', '1:1'] 
      : [consultationResult.primaryFormat || '16:9'];
    
    const renderResults: Record<string, any> = {};
    
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      
      await updateProgress('render', 6 + i, 90 + (i * 3), `🎬 Rendere ${format} Format (${i + 1}/${formats.length})...`);
      
      // ✅ 6 seconds visibility per format
      await new Promise(r => setTimeout(r, 6000));
      
      try {
        const [width, height] = format === '16:9' ? [1920, 1080] : 
                                 format === '9:16' ? [1080, 1920] : [1080, 1080];
        
        console.log(`Rendering ${format} format (${width}x${height})...`);
        
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
              // ✅ LOFT-FILM: Enable Rive character with lip-sync
              useRiveCharacter: phonemeTimestamps.length > 0,
              phonemeTimestamps: phonemeTimestamps.length > 0 ? phonemeTimestamps : undefined,
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
          console.log(`✅ Render started for ${format}: ${renderResponse.data.renderId}`);
        }
      } catch (e) {
        console.error(`❌ Render failed for ${format}:`, e);
        renderResults[format] = { status: 'failed', error: String(e) };
      }
      
      // ✅ 4 seconds between formats
      await new Promise(r => setTimeout(r, 4000));
    }

    // ═══════════════════════════════════════════════════════════════
    // ✅ COMPLETION: Save project data
    // ═══════════════════════════════════════════════════════════════
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

    await updateProgress('completed', 8, 100, '✅ Erklärvideo erfolgreich erstellt! Video wird gerendert...', assets, projectData);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ BACKGROUND PIPELINE COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Background pipeline error:', error);
    
    // Update progress with error
    await supabase
      .from('explainer_generation_progress')
      .update({
        current_step: 'error',
        progress: 0,
        message: `❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', progressId);
  }
}

// Helper functions
function getVoiceId(audioPrefs: any): string {
  const lang = audioPrefs?.language || 'de';
  const gender = audioPrefs?.voiceGender || 'male';
  
  const voiceMap: Record<string, Record<string, string>> = {
    de: { female: 'EXAVITQu4vr4xnSDxMaL', male: 'JBFqnCBsd6RMkjVDRZzb' },
    en: { female: 'Xb7hH8MSUJpSbSDYk0k2', male: 'TX3LPaxmHKxFdv7VOQHJ' },
    fr: { female: 'FGY2WhTYpPnrIDTdsKH5', male: 'IKne3meq5aSn9XLyUdCD' },
    es: { female: 'XB0fDUnXU5powFXDhCwa', male: 'N2lVS1w4EtoT3dr4eOWO' },
    it: { female: 'XrExE9yKIg1WjnnlVkGX', male: 'nPczCjzI2devNBz1zQrb' },
  };
  
  return voiceMap[lang]?.[gender] || voiceMap.de.male;
}

function getVoiceName(audioPrefs: any): string {
  const lang = audioPrefs?.language || 'de';
  const gender = audioPrefs?.voiceGender || 'male';
  
  const nameMap: Record<string, Record<string, string>> = {
    de: { female: 'Sarah', male: 'George' },
    en: { female: 'Alice', male: 'Liam' },
    fr: { female: 'Laura', male: 'Charlie' },
    es: { female: 'Charlotte', male: 'Callum' },
    it: { female: 'Matilda', male: 'Brian' },
  };
  
  return nameMap[lang]?.[gender] || nameMap.de.male;
}
