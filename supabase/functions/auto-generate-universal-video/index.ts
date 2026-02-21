import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

// AWS Lambda configuration
const AWS_REGION = 'eu-central-1';
const LAMBDA_FUNCTION_NAME = 'remotion-render-4-0-377-mem3008mb-disk10240mb-600sec';
const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';

// ASCII-safe JSON encoding for Umlaute
function toAsciiSafeJson(jsonString: string): string {
  return jsonString.replace(/[\u0080-\uffff]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
    return String.fromCharCode(92) + 'u' + hex;
  });
}

// Generate Remotion-compatible render ID (10 chars, lowercase alphanumeric)
function generateRemotionCompatibleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Declare EdgeRuntime for Supabase Edge Functions background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Shutdown handler for logging
addEventListener('beforeunload', (ev: any) => {
  console.log('[auto-generate-universal-video] Function shutdown:', ev.detail?.reason || 'unknown');
});

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
    
    // ✅ CRITICAL: Use EdgeRuntime.waitUntil() to keep the function alive
    // until the entire pipeline completes (including all scenes + rendering)
    EdgeRuntime.waitUntil(
      runGenerationPipeline(supabase, progressId, actualBriefing, userId)
        .catch((err) => {
          console.error('[auto-generate-universal-video] Pipeline error in waitUntil:', err);
        })
    );

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

    // Step 6: Render Video DIRECTLY via AWS Lambda (82% - 100%)
    await updateProgress(supabase, progressId, 'rendering', 85, '🎬 Video wird gerendert...');
    await delay(2000);

    console.log('[auto-generate-universal-video] Starting DIRECT Lambda invocation (no intermediate hop)...');

    // ✅ Initialize AWS client
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const REMOTION_SERVE_URL = Deno.env.get('REMOTION_SERVE_URL');
    if (!REMOTION_SERVE_URL) {
      throw new Error('REMOTION_SERVE_URL not configured');
    }

    // Calculate dimensions
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
    const totalDuration = script.scenes.reduce((acc: number, scene: any) => {
      return acc + (scene.durationSeconds || scene.duration || 5);
    }, 0);
    const durationInFrames = Math.max(30, Math.min(36000, Math.ceil(totalDuration * fps)));

    // Transform scenes to Remotion format
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
        title: scene.title || '',
        subtitle: scene.subtitle || '',
        spokenText: scene.voiceover || '',
        voiceover: scene.voiceover || '',
        visualDescription: scene.visualDescription || '',
        duration: duration,
        durationSeconds: duration,
        startTime,
        endTime: startTime + duration,
        background: {
          type: scene.imageUrl ? 'image' : 'gradient',
          imageUrl: scene.imageUrl,
          gradientColors: briefing.brandColors || ['#3b82f6', '#1e40af'],
        },
        animation: scene.animation || getDefaultAnimation(sceneType),
        kenBurnsDirection: scene.kenBurnsDirection || 'in',
        textOverlay: {
          enabled: true,
          text: scene.title || '',
          animation: scene.textAnimation || getDefaultTextAnimation(sceneType),
          position: scene.textPosition || 'center',
        },
        textAnimation: scene.textAnimation || getDefaultTextAnimation(sceneType),
        textPosition: scene.textPosition || 'center',
        soundEffect: scene.soundEffect || getDefaultSoundEffect(sceneType),
        soundEffectType: scene.soundEffect || getDefaultSoundEffect(sceneType),
        showCharacter: scene.showCharacter ?? shouldShowCharacter(sceneType),
        characterPosition: scene.characterPosition || getDefaultCharacterPosition(sceneType),
        characterGesture: scene.characterGesture || getDefaultCharacterGesture(sceneType),
        statsOverlay: scene.statsOverlay || null,
        beatAligned: scene.beatAligned ?? (sceneType === 'cta'),
        transition: { type: scene.transitionIn || 'fade', duration: 0.5, direction: 'right' },
        transitionIn: scene.transitionIn || 'fade',
        transitionOut: scene.transitionOut || 'fade',
      };
    });

    // Build inputProps
    const inputProps = {
      category: briefing.category || 'marketing',
      storytellingStructure: briefing.storytellingStructure || 'problem-solution',
      title: script.title || briefing.productName || 'Video',
      subtitle: script.subtitle || briefing.tagline || '',
      scenes: remotionScenes,
      primaryColor: briefing.brandColors?.[0] || '#3b82f6',
      secondaryColor: briefing.brandColors?.[1] || '#1e40af',
      fontFamily: briefing.fontFamily || 'Inter',
      visualStyle: briefing.visualStyle || 'modern-3d',
      voiceoverUrl: voiceoverUrl || null,
      backgroundMusicUrl: musicUrl || null,
      voiceoverVolume: 1,
      musicVolume: 0.3,
      masterVolume: 1,
      useCharacter: briefing.hasCharacter !== false,
      characterType: briefing.characterType || 'lottie',
      characterName: briefing.characterName || 'Assistant',
      phonemeTimestamps: phonemeTimestamps || null,
      enableLipSync: !!phonemeTimestamps,
      showSubtitles: (briefing.showSubtitles !== false) || !!subtitles,
      subtitles: subtitles || [],
      subtitleStyle: { position: briefing.subtitlePosition || 'bottom', animation: 'highlight', outlineStyle: 'glow', fontSize: 32, fontWeight: 'bold' },
      subtitlePosition: briefing.subtitlePosition || 'bottom',
      subtitleColor: '#ffffff',
      subtitleBackgroundColor: 'rgba(0,0,0,0.7)',
      enableSoundEffects: true,
      soundLibraryEnabled: true,
      beatSyncEnabled: !!beatSyncData,
      beatSyncData: beatSyncData || null,
      showProgressBar: briefing.showProgressBar !== false,
      progressBarColor: briefing.brandColors?.[0] || '#3b82f6',
      showWatermark: briefing.showWatermark === true,
      watermarkText: briefing.watermarkText || '',
      watermarkPosition: 'bottom-right',
      defaultAnimation: 'fadeIn',
      enableKenBurns: true,
      enableParallax: true,
      aspectRatio: briefing.aspectRatio || '16:9',
      targetWidth: dimensions.width,
      targetHeight: dimensions.height,
      fps,
      durationInFrames,
      template: 'UniversalCreatorVideo',
    };

    // ✅ Credit check & deduction
    const calculateCredits = (durationSeconds: number): number => {
      if (durationSeconds < 30) return 10;
      if (durationSeconds <= 60) return 20;
      if (durationSeconds <= 180) return 50;
      if (durationSeconds <= 300) return 100;
      return 200;
    };
    const credits_required = calculateCredits(totalDuration);
    console.log(`💰 Credits required: ${credits_required} for ${totalDuration}s video`);

    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (!wallet || wallet.balance < credits_required) {
      throw new Error(`Nicht genügend Credits. Benötigt: ${credits_required}, Verfügbar: ${wallet?.balance || 0}`);
    }

    await supabase.rpc('deduct_credits', { p_user_id: userId, p_amount: credits_required });
    console.log(`💰 Deducted ${credits_required} credits`);

    // ✅ Create render record with Remotion-compatible ID (10 chars, a-z0-9)
    const pendingRenderId = generateRemotionCompatibleId();
    const webhookUrl = `${supabaseUrl}/functions/v1/remotion-webhook`;

    await supabase.from('video_renders').insert({
      render_id: pendingRenderId,
      bucket_name: DEFAULT_BUCKET_NAME,
      format_config: { format: 'mp4', aspect_ratio: briefing.aspectRatio || '16:9', width: dimensions.width, height: dimensions.height },
      content_config: { category: briefing.category, scenes: remotionScenes.length, hasVoiceover: !!voiceoverUrl, hasMusic: !!musicUrl, credits_used: credits_required },
      subtitle_config: {},
      status: 'rendering',
      started_at: new Date().toISOString(),
      user_id: userId,
      source: 'universal-creator',
    });

    // ✅ Write renderId to progress BEFORE Lambda start so client can begin S3 polling
    await updateProgress(supabase, progressId, 'rendering', 88, '🚀 Lambda wird gestartet...', {
      renderId: pendingRenderId,
    });

    // ✅ Build Lambda payload WITHOUT renderId (it's a return value, not input!)
    // outName as simple string like Director's Cut uses
    const lambdaPayload = {
      type: 'start',
      serveUrl: REMOTION_SERVE_URL,
      composition: 'UniversalCreatorVideo',
      inputProps: inputProps,
      codec: 'h264',
      imageFormat: 'jpeg',
      maxRetries: 1,
      framesPerLambda: 150,
      privacy: 'public',
      overwrite: true,
      outName: `universal-video-${pendingRenderId}.mp4`,
      // Explicit metadata to bypass calculateMetadata crashes in Lambda
      durationInFrames: durationInFrames,
      fps: fps,
      width: dimensions.width,
      height: dimensions.height,
      webhook: {
        url: webhookUrl,
        secret: null,
        customData: { pending_render_id: pendingRenderId, user_id: userId, credits_used: credits_required, source: 'universal-creator' },
      },
    };

    // ✅ Lambda DIREKT aufrufen im Event-Modus (async, sofortige Antwort)
    // Kein Umweg ueber invoke-remotion-render Edge Function mehr!
    // Die Supabase API Gateway hat ein hartes ~120s Timeout fuer Edge-zu-Edge Aufrufe,
    // das den bisherigen Ansatz nach 120s gekillt hat.
    console.log(`🚀 Invoking Lambda DIRECTLY in Event mode (async, returns immediately)...`);
    await updateProgress(supabase, progressId, 'rendering', 88, '🎬 Starte Video-Rendering...');

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      region: AWS_REGION,
    });

    const lambdaUrl = `https://lambda.${AWS_REGION}.amazonaws.com/2015-03-31/functions/${LAMBDA_FUNCTION_NAME}/invocations`;
    const asciiSafePayload = toAsciiSafeJson(JSON.stringify(lambdaPayload));

    const lambdaResponse = await aws.fetch(lambdaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Invocation-Type': 'Event',   // Sofortige 202-Antwort, Lambda laeuft async weiter
      },
      body: asciiSafePayload,
    });

    if (lambdaResponse.status !== 202) {
      const errorText = await lambdaResponse.text();
      console.error('❌ Lambda Event invocation failed:', lambdaResponse.status, errorText);
      throw new Error(`Lambda-Start fehlgeschlagen: HTTP ${lambdaResponse.status}`);
    }

    console.log('✅ Lambda Event invocation accepted (202). Webhook + S3-Polling will handle completion.');

    // Update DB status to rendering
    await supabase.from('video_renders').update({
      status: 'rendering',
    }).eq('render_id', pendingRenderId);

    await updateProgress(supabase, progressId, 'rendering', 90, '🎬 Video wird gerendert...');

    console.log(`[auto-generate-universal-video] Pipeline completed for ${progressId}.`);

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

// ====== HELPER FUNCTIONS FOR SCENE DEFAULTS ======

function getDefaultAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'popIn', 'intro': 'flyIn', 'problem': 'kenBurns',
    'solution': 'morphIn', 'feature': 'parallax', 'benefit': 'slideUp',
    'proof': 'fadeIn', 'testimonial': 'fadeIn', 'cta': 'bounce',
  };
  return map[sceneType] || 'fadeIn';
}

function getDefaultTextAnimation(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'glowPulse', 'intro': 'bounceIn', 'problem': 'typewriter',
    'solution': 'splitReveal', 'feature': 'bounceIn', 'benefit': 'highlight',
    'proof': 'highlight', 'testimonial': 'fadeWords', 'cta': 'waveIn',
  };
  return map[sceneType] || 'fadeWords';
}

function getDefaultSoundEffect(sceneType: string): string {
  const map: Record<string, string> = {
    'hook': 'whoosh', 'intro': 'whoosh', 'problem': 'alert',
    'solution': 'success', 'feature': 'pop', 'benefit': 'pop',
    'proof': 'success', 'testimonial': 'none', 'cta': 'success',
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
    'hook': 'pointing', 'intro': 'waving', 'problem': 'thinking',
    'solution': 'celebrating', 'feature': 'pointing', 'benefit': 'celebrating',
    'proof': 'idle', 'testimonial': 'idle', 'cta': 'pointing',
  };
  return map[sceneType] || 'idle';
}
