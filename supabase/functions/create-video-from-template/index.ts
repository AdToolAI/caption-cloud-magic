import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateVideoRequest {
  template_id: string;
  customizations: Record<string, string | number | boolean>;
  parent_video_id?: string;
  version_number?: number;
}

interface RenderingOptions {
  quality: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  framerate: 24 | 30 | 60;
}

// Clean script text by removing structural elements and meta-information
function cleanScriptText(script: string): string {
  if (!script) return '';
  
  console.log('[create-video] Original script:', script.substring(0, 200));
  
  const cleaned = script
    // Remove structural labels with optional time indicators
    .replace(/^(HOOK|HAUPTTEIL|CALL-TO-ACTION|CTA)[\s:]*(\([^)]*\))?[\s:]*$/gmi, '')
    // Remove standalone time indicators
    .replace(/^\([^)]*gesamt\)[\s:]*/gmi, '')
    // Remove visual/background descriptions in parentheses
    .replace(/\(Visuell:.*?\)/gi, '')
    .replace(/\(Hintergrund:.*?\)/gi, '')
    .replace(/\(Musik:.*?\)/gi, '')
    .replace(/\([^)]*?(Visuell|Hintergrund|Musik)[^)]*?\)/gi, '')
    // Remove descriptive lines (sentences that describe the video, not spoken content)
    .replace(/^.*?(Abfolge|Montage|zeigt|läuft|Im Hintergrund).*?$/gmi, '')
    // Remove multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Trim whitespace
    .trim();
  
  console.log('[create-video] Cleaned script:', cleaned.substring(0, 200));
  return cleaned;
}

// Clean invalid assets from timeline - removes ANY placeholder or empty src
function cleanInvalidAssets(config: any, customizations: any, template: any): any {
  // Recursive function to check for ANY placeholder pattern {{...}} or empty src
  function hasInvalidPlaceholder(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    
    // Check src fields for ANY placeholder or empty string
    if (obj.src && typeof obj.src === 'string') {
      const hasPlaceholder = /\{\{[^}]+\}\}/.test(obj.src); // Matches any {{FIELD}}
      const isEmpty = obj.src.trim() === '';
      
      if (hasPlaceholder || isEmpty) {
        return true;
      }
    }
    
    // Recursively check nested asset structures
    if (obj.asset) {
      if (hasInvalidPlaceholder(obj.asset)) return true;
    }
    
    // Check nested timeline (for compositions)
    if (obj.timeline?.tracks) {
      for (const track of obj.timeline.tracks) {
        if (track.clips) {
          for (const clip of track.clips) {
            if (hasInvalidPlaceholder(clip)) return true;
          }
        }
      }
    }
    
    return false;
  }
  
  let removedClipsCount = 0;
  
  // Clean tracks by removing clips with invalid assets (recursively)
  config.timeline.tracks = (config.timeline.tracks || [])
    .map((track: any) => {
      const validClips = (track.clips || []).filter((clip: any) => {
        if (!clip.asset) return true;
        
        const isInvalid = hasInvalidPlaceholder(clip);
        if (isInvalid) removedClipsCount++;
        
        return !isInvalid;
      });
      
      return {
        ...track,
        clips: validClips
      };
    })
    .filter((track: any) => track.clips && track.clips.length > 0);
  
  console.log(`Removed ${removedClipsCount} clips with invalid or placeholder assets`);
  
  return config;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { template_id, customizations, parent_video_id, version_number }: CreateVideoRequest = await req.json();

    if (!template_id || !customizations) {
      throw new Error('Missing required fields: template_id, customizations');
    }

    console.log('[create-video] Request:', {
      template_id,
      parent_video_id: parent_video_id || 'none',
      version_number: version_number || 1,
      customization_keys: Object.keys(customizations),
    });

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('video_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      throw new Error('Template not found');
    }

    // Load parent video customizations if editing existing video
    let effectiveCustomizations: Record<string, any> = { ...customizations };

    if (parent_video_id) {
      console.log('[create-video] Loading parent video customizations:', parent_video_id);
      const { data: parentVideo, error: parentError } = await supabase
        .from('video_creations')
        .select('customizations')
        .eq('id', parent_video_id)
        .single();

      if (parentError) {
        console.error('[create-video] Failed to load parent video:', parentError);
      } else if (parentVideo?.customizations) {
        // Merge: parent as base, new customizations override
        effectiveCustomizations = {
          ...parentVideo.customizations,
          ...customizations,
        };
        console.log('[create-video] Merged customizations:', {
          parent_fields: Object.keys(parentVideo.customizations),
          new_fields: Object.keys(customizations),
          effective_fields: Object.keys(effectiveCustomizations),
        });
      }
    }

    // Validate required fields using effective customizations
    const requiredFields = template.customizable_fields.filter((f: any) => f.required);
    for (const field of requiredFields) {
      if (!effectiveCustomizations[field.key]) {
        console.error('[create-video] Missing required field:', {
          field_key: field.key,
          field_label: field.label,
          available_fields: Object.keys(effectiveCustomizations),
        });
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'MISSING_REQUIRED_FIELD',
            message: `Fehlendes Pflichtfeld: ${field.label}`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse rendering options
    let renderingOptions: RenderingOptions = {
      quality: '1080p',
      format: 'mp4',
      aspectRatio: '16:9',
      framerate: 30
    };
    
    if (customizations._renderingOptions) {
      try {
        renderingOptions = JSON.parse(String(customizations._renderingOptions));
      } catch (e) {
        console.error('Failed to parse rendering options:', e);
      }
    }

    // Calculate credits based on rendering options and multi-video
    let creditsRequired = 50; // Base cost
    if (renderingOptions.quality === '4k') creditsRequired = 100;
    else if (renderingOptions.quality === '720p') creditsRequired = 30;
    
    if (renderingOptions.format === 'webm') creditsRequired += 10;
    if (renderingOptions.framerate === 60) creditsRequired += 20;

    // Add credits for multi-video fields
    template.customizable_fields.forEach((field: any) => {
      if (field.type === 'videos' && effectiveCustomizations[field.key]) {
        try {
          const videoUrls = JSON.parse(String(effectiveCustomizations[field.key]));
          const videoCount = Array.isArray(videoUrls) ? videoUrls.length : 0;
          if (videoCount > 1) {
            creditsRequired += (videoCount - 1) * 5; // +5 credits per additional video
          }
        } catch (e) {
          console.error('Failed to parse video URLs:', e);
        }
      }
    });

    // Check credits
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!wallet || wallet.balance < creditsRequired) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'INSUFFICIENT_CREDITS',
          message: `Nicht genügend Credits. ${creditsRequired} Credits benötigt für Video-Generierung.`
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create video_creation record
    const { data: creation, error: creationError } = await supabase
      .from('video_creations')
      .insert({
        user_id: user.id,
        template_id,
        parent_video_id: parent_video_id || null,
        version_number: version_number || 1,
        customizations: effectiveCustomizations,
        status: 'pending',
        credits_used: creditsRequired,
        quality: renderingOptions.quality,
        format: renderingOptions.format,
        aspect_ratio: renderingOptions.aspectRatio,
        framerate: renderingOptions.framerate
      })
      .select()
      .single();

    if (creationError) {
      throw new Error(`Failed to create video record: ${creationError.message}`);
    }

    // Replace placeholders in template config
    let configStr = JSON.stringify(template.template_config);
    
    // Only skip multi-media fields that actually contain arrays
    const multiMediaFields = new Set(
      template.customizable_fields
        .filter((f: any) => {
          if (f.type !== 'images' && f.type !== 'videos') return false;
          const value = effectiveCustomizations[f.key];
          // Only skip if it's actually an array with multiple items
          try {
            const parsed = JSON.parse(String(value));
            return Array.isArray(parsed) && parsed.length > 1;
          } catch {
            return false;
          }
        })
        .map((f: any) => f.key)
    );
    
    for (const [key, value] of Object.entries(effectiveCustomizations)) {
      // Skip fields that are arrays of media URLs
      if (multiMediaFields.has(key)) continue;
      
      const placeholder = `{{${key}}}`;
      // JSON-safe escaping: escape special characters like \n, ", \ etc.
      const escaped = JSON.stringify(String(value)).slice(1, -1);
      configStr = configStr.replaceAll(placeholder, escaped);
    }
    
    let shotstackConfig: any;
    try {
      shotstackConfig = JSON.parse(configStr);
      
      // DEBUG: Log original timeline structure from template (after placeholder replacement)
      console.log('[create-video] Original template timeline (after placeholder replacement):', 
        JSON.stringify(
          (shotstackConfig.timeline?.tracks || []).map((t: any, i: number) => ({
            index: i,
            firstClipType: t.clips?.[0]?.asset?.type || 'unknown',
            firstClipSrc: t.clips?.[0]?.asset?.src || null,
            clipCount: t.clips?.length || 0,
          })), 
          null, 
          2
        )
      );
    } catch (parseError) {
      console.error('Failed to parse Shotstack config after placeholder replacement:', {
        error: parseError,
        template_id,
        configStrPreview: configStr.slice(0, 500),
      });
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'TEMPLATE_PARSE_ERROR',
          message: 'Das Template konnte nicht verarbeitet werden. Bitte versuche es erneut.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process multi-image and multi-video fields - add clips to timeline
    // NEW: Use AI script analysis for intelligent timing if script is provided
    for (const field of template.customizable_fields) {
      if ((field.type === 'videos' || field.type === 'images') && effectiveCustomizations[field.key]) {
        try {
          const mediaUrls = JSON.parse(String(effectiveCustomizations[field.key]));
          if (Array.isArray(mediaUrls) && mediaUrls.length > 1) {
            const transitionStyle = effectiveCustomizations.transition_style || field.default || 'fade';
            const scriptText = (effectiveCustomizations.script_text || effectiveCustomizations.script) as string | undefined;
            const enableSubtitles = effectiveCustomizations.enable_subtitles === 'true' || effectiveCustomizations.enable_subtitles === 1 || !effectiveCustomizations.enable_subtitles;
            
            console.log('[create-video] Processing multi-media field:', {
              field_key: field.key,
              media_count: mediaUrls.length,
              has_script: !!scriptText,
              script_length: scriptText?.length || 0,
            });
            
            let segments = null;
            let voiceoverData = null;
            
            // If script exists, use AI to analyze and create intelligent segments
            if (scriptText && scriptText.length > 20) {
              console.log('[create-video] Script detected, analyzing for intelligent timing...');
              
              // Clean script text before processing
              const cleanedScript = cleanScriptText(scriptText);
              console.log('[create-video] Cleaned script', {
                originalLength: scriptText.length,
                cleanedLength: cleanedScript.length,
                preview: cleanedScript.slice(0, 100)
              });
              
              // Validate: Warn if script still contains visual descriptions
              if (cleanedScript.match(/\(Visuell:|Hintergrund:|Musik:/i)) {
                console.warn('[create-video] Script still contains visual descriptions after cleaning!', {
                  matches: cleanedScript.match(/\([^)]*\)/g)
                });
              }
              
              if (cleanedScript.length < 10) {
                console.warn('[create-video] Cleaned script is very short or empty!', {
                  original: scriptText.substring(0, 100),
                  cleaned: cleanedScript
                });
              }
              
              try {
                const analysisResponse = await fetch(
                  `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-script-for-video`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      scriptText: cleanedScript, // Use cleaned script
                      imageCount: mediaUrls.length,
                    }),
                  }
                );

                if (analysisResponse.ok) {
                  const analysisData = await analysisResponse.json();
                  segments = analysisData.segments;
                  console.log('[create-video] Script analysis complete', {
                    segmentCount: segments?.length,
                    totalDuration: analysisData.totalDuration,
                  });
                } else {
                  console.warn('[create-video] Script analysis failed, falling back to default timing');
                }
              } catch (analysisError) {
                console.error('[create-video] Script analysis error:', analysisError);
              }
              
              // Generate voiceover if voice_style is provided
              if (customizations.voice_style) {
                console.log('[create-video] Generating voiceover with voice:', customizations.voice_style);
                try {
                  const voiceoverResponse = await fetch(
                    `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-video-voiceover`,
                    {
                      method: 'POST',
                      headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        scriptText: cleanedScript, // Use cleaned script for voiceover
                        voice: customizations.voice_style || 'aria',
                        speed: customizations.voice_speed || 1.0,
                      }),
                    }
                  );

                  if (voiceoverResponse.ok) {
                    voiceoverData = await voiceoverResponse.json();
                    console.log('[create-video] Voiceover generated:', voiceoverData.audioUrl);
                  } else {
                    console.warn('[create-video] Voiceover generation failed, continuing without voiceover');
                  }
                } catch (voiceoverError) {
                  console.error('[create-video] Voiceover generation error:', voiceoverError);
                }
              }
            }
            
            // CRITICAL: Reset timeline completely for multi-media videos
            // This removes any template tracks (red placeholders, etc.)
            console.log('[create-video] Resetting timeline tracks for multi-media video');
            shotstackConfig.timeline.tracks = [];
            shotstackConfig.timeline.background = '#000000'; // Always black, never red/orange
            
            // Create main media track (Track 0)
            const mediaTrack = { clips: [] as any[] };
            
            // Create voiceover audio track (Track 1) if voiceover exists
            const voiceoverTrack = voiceoverData ? { clips: [] as any[] } : null;
            
            // Create text overlay track (Track 2 if voiceover, else Track 1) if subtitles enabled
            const textTrack = enableSubtitles ? { clips: [] as any[] } : null;
            
            // Add media clips seamlessly (no gaps in timeline)
            let currentMediaTime = 0;
            mediaUrls.forEach((url: string, index: number) => {
              const segment = segments?.[index];
              const duration = segment?.duration ?? 5;
              const isVideo = url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/);
              
              // Media clip
              const mediaClip = {
                asset: {
                  type: isVideo ? 'video' : 'image',
                  src: url
                },
                start: currentMediaTime,
                length: duration,
                fit: 'cover',
                scale: 1.05, // Slight zoom for Ken Burns effect
                // Remove transitions to avoid black screens during subtitle display
                transition: undefined
              };
              mediaTrack.clips.push(mediaClip);
              
              // Move timeline forward with slight overlap for smooth transitions
              currentMediaTime += duration - 0.1;
            });
            
            // Calculate actual timeline end (last clip's start + length) to account for overlaps
            const lastClip = mediaTrack.clips[mediaTrack.clips.length - 1];
            const totalMediaDuration = lastClip ? (lastClip.start + lastClip.length) : 0;
            console.log('[create-video] Timeline synchronization:', {
              mediaClipCount: mediaTrack.clips.length,
              firstClipStart: mediaTrack.clips[0]?.start,
              lastClipStart: lastClip?.start,
              lastClipEnd: lastClip ? (lastClip.start + lastClip.length) : 0,
              totalMediaDuration,
              voiceoverDuration: voiceoverData?.duration,
              clips: mediaTrack.clips.map(c => ({ start: c.start, length: c.length }))
            });
            
            // Create segment-based subtitles (1:1 binding to media clips)
            if (textTrack && segments && segments.length > 0 && mediaTrack.clips.length > 0) {
              console.log('[create-video] Creating segment-based subtitles (1:1 with media clips)');
              
              segments.forEach((segment: any, index: number) => {
                // Get subtitle text for this segment
                let subtitleText = segment.subtitle;
                if (!subtitleText || subtitleText.trim().length === 0) {
                  const firstSentence = segment.text?.split(/[.!?]/)[0] || '';
                  subtitleText = firstSentence.length <= 80
                    ? firstSentence
                    : firstSentence.slice(0, 77) + '...';
                }
                
                // Skip if no text
                if (!subtitleText || subtitleText.trim().length === 0) return;
                
                // Get corresponding media clip
                const mediaClip = mediaTrack.clips[index];
                if (!mediaClip) return;
                
                const clipStart = mediaClip.start;
                const clipLength = mediaClip.length;
                
                // Safe-Range: Keep subtitles well within visible image time
                const fadeMargin = 0.2; // 0.2s buffer at start and end (minimal since no transitions)
                
                const start = clipStart + fadeMargin;
                const availableLength = clipLength - (fadeMargin * 2);
                const maxLength = Math.max(1.5, availableLength);
                let length = Math.min(maxLength, 6); // Max 6s per subtitle
                
                // Ensure subtitle doesn't exceed total media duration
                const subtitleEnd = start + length;
                if (subtitleEnd > totalMediaDuration - 0.1) {
                  length = Math.max(0, (totalMediaDuration - 0.1) - start);
                }
                
                // Skip if duration is too short
                if (length <= 0.3) {
                  console.log(`[create-video] Skipping subtitle for segment ${index}: effective length too short (${length}s)`);
                  return;
                }
                
                console.log(`[create-video] Creating safe-range subtitle for segment ${index}:`, {
                  text: subtitleText.substring(0, 50),
                  clipStart,
                  clipLength,
                  subtitleStart: start,
                  subtitleLength: length,
                  subtitleEnd: start + length,
                  totalMediaDuration
                });
                
                console.log(`[create-video] Creating subtitle for segment ${index}:`, {
                  text: subtitleText.substring(0, 50),
                  clipStart,
                  clipLength,
                  subtitleStart: start,
                  subtitleLength: length,
                  subtitleEnd: start + length
                });
                
                const textClip = {
                  asset: {
                    type: 'html',
                    html: `
                      <div style="
                        display: flex;
                        align-items: flex-end;
                        justify-content: center;
                        width: 100%;
                        height: 100%;
                        font-family: Arial, sans-serif;
                        z-index: 9999;
                      ">
                        <div style="
                          background: rgba(0,0,0,0.75);
                          color: white;
                          padding: 18px 32px;
                          font-size: 42px;
                          font-weight: 600;
                          text-align: center;
                          border-radius: 10px;
                          max-width: 80%;
                          line-height: 1.3;
                          text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
                          margin-bottom: 6%;
                        ">${subtitleText}</div>
                      </div>
                    `,
                    width: 1920,
                    height: 1080
                  },
                  start,
                  length,
                  position: 'center'
                };
                
                textTrack.clips.push(textClip);
              });
              
              console.log('[create-video] Segment-based subtitles created:', {
                totalSubtitles: textTrack.clips.length,
                subtitles: textTrack.clips.map(c => ({
                  start: c.start,
                  end: c.start + c.length,
                  length: c.length
                }))
              });
            }
            
            
            // FINAL TRACK CONSTRUCTION: Build timeline from scratch (bottom to top)
            console.log('[create-video] Building final timeline tracks');
            
            // Ensure we start with clean slate (already reset above, but double-check)
            shotstackConfig.timeline.tracks = [];
            
            // Track 0: Media (images/videos) - bottom layer
            shotstackConfig.timeline.tracks.push(mediaTrack);
            console.log('[create-video] Track 0 (Media):', {
              clipCount: mediaTrack.clips.length,
              totalDuration: totalMediaDuration,
              clips: mediaTrack.clips.map(c => ({ start: c.start, length: c.length, type: c.asset.type }))
            });
            
            // Track 1: Voiceover (audio) - middle layer
            if (voiceoverTrack && voiceoverData) {
              // CRITICAL: Clamp voiceover to media duration (no audio beyond media)
              const clampedVoiceoverLength = Math.min(voiceoverData.duration, totalMediaDuration);
              voiceoverTrack.clips.push({
                asset: {
                  type: 'audio',
                  src: voiceoverData.audioUrl,
                  volume: 1.0
                },
                start: 0,
                length: clampedVoiceoverLength
              });
              shotstackConfig.timeline.tracks.push(voiceoverTrack);
              console.log('[create-video] Track 1 (Voiceover):', {
                originalDuration: voiceoverData.duration,
                clampedDuration: clampedVoiceoverLength,
                mediaDuration: totalMediaDuration
              });
            }
            
            // Track 2: Text overlay (subtitles) - top layer
            if (textTrack && textTrack.clips.length > 0) {
              shotstackConfig.timeline.tracks.push(textTrack);
              console.log('[create-video] Track 2 (Subtitles):', {
                blockCount: textTrack.clips.length,
                blocks: textTrack.clips.map(c => ({ start: c.start, length: c.length })),
                mediaEndTime: totalMediaDuration
              });
            }
            
            // Final verification
            console.log('[create-video] Final timeline structure (bottom to top):', 
              shotstackConfig.timeline.tracks.map((t: any, i: number) => ({
                trackIndex: i,
                type: t.clips?.[0]?.asset?.type || 'unknown',
                clipCount: t.clips?.length || 0
              }))
            );
            
            // Log placement verification - media vs subtitles
            console.log('[create-video] Final subtitle placements vs media:', {
              mediaClips: mediaTrack.clips.map(c => ({
                start: c.start,
                end: c.start + c.length
              })),
              subtitles: textTrack?.clips.map(c => ({
                start: c.start,
                end: c.start + c.length
              })) || []
            });
            
            // Verify subtitle blocks are within timeline
            if (textTrack && textTrack.clips.length > 0) {
              console.log('[create-video] Subtitle blocks verification:', {
                blocks: textTrack.clips.map(c => ({
                  start: c.start,
                  end: c.start + c.length,
                  length: c.length,
                  withinTimeline: (c.start + c.length) <= totalMediaDuration
                })),
                timelineEnd: totalMediaDuration
              });
            }
          }
        } catch (e) {
          console.error(`Failed to process multi-${field.type} field:`, e);
        }
      }
    }

    // Clean invalid assets from timeline (for optional media fields not provided)
    shotstackConfig = cleanInvalidAssets(shotstackConfig, customizations, template);

    // Normalize output configuration to avoid Shotstack validation errors
    if (shotstackConfig.output) {
      const output = shotstackConfig.output;

      // If both size and resolution are set, Shotstack complains.
      // Prefer explicit size and drop resolution.
      if (output.size && output.resolution) {
        console.log('[Shotstack Output] Found both size and resolution, removing resolution to avoid conflict', {
          size: output.size,
          resolution: output.resolution,
          aspectRatio: output.aspectRatio,
        });
        delete output.resolution;
      }

      // Optional: ensure format/aspectRatio from renderingOptions override template defaults
      if (renderingOptions.format) {
        output.format = renderingOptions.format;
      }
      if (renderingOptions.aspectRatio) {
        output.aspectRatio = renderingOptions.aspectRatio;
      }

      // Optional: map quality → resolution when no custom size is defined
      if (!output.size && renderingOptions.quality) {
        if (renderingOptions.quality === '720p') output.resolution = 'sd';
        if (renderingOptions.quality === '1080p') output.resolution = 'hd';
        if (renderingOptions.quality === '4k') output.resolution = 'ultra-hd';
      }
    }
    
    // Validate that we still have content to render
    if (!shotstackConfig.timeline.tracks || 
        shotstackConfig.timeline.tracks.length === 0 ||
        !shotstackConfig.timeline.tracks.some((t: any) => t.clips?.length > 0)) {
      console.error('No valid clips remaining after cleaning timeline');
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'NO_VALID_CONTENT',
          message: 'Keine gültigen Medien für Video-Erstellung vorhanden. Bitte lade mindestens ein Bild oder Video hoch.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log final timeline preview before sending to Shotstack
    console.log('Final Shotstack timeline preview (first 3 tracks):', 
      JSON.stringify(shotstackConfig.timeline?.tracks?.slice(0, 3).map((t: any) => 
        (t.clips || []).map((c: any) => ({ type: c.asset?.type, src: c.asset?.src }))
      ), null, 2)
    );

    // Call Shotstack API
    const shotstackApiKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackApiKey) {
      throw new Error('SHOTSTACK_API_KEY not configured');
    }

    const shotstackResponse = await fetch('https://api.shotstack.io/v1/render', {
      method: 'POST',
      headers: {
        'x-api-key': shotstackApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(shotstackConfig)
    });

    if (!shotstackResponse.ok) {
      const errorText = await shotstackResponse.text();
      console.error('Shotstack API error:', errorText);
      
      await supabase
        .from('video_creations')
        .update({
          status: 'failed',
          error_message: `Shotstack API Fehler: ${errorText.substring(0, 200)}`
        })
        .eq('id', creation.id);

      throw new Error('Fehler bei Video-Render');
    }

    const shotstackData = await shotstackResponse.json();
    console.log('Shotstack render started:', shotstackData);

    // Update video_creation with render_id and status
    await supabase
      .from('video_creations')
      .update({
        render_id: shotstackData.response.id,
        status: 'rendering'
      })
      .eq('id', creation.id);

    // Deduct credits
    await supabase
      .from('wallets')
      .update({
        balance: wallet.balance - 50,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    console.log(`[Video Render] User ${user.id} | Template: ${template.name} | Render ID: ${shotstackData.response.id}`);

    return new Response(
      JSON.stringify({
        ok: true,
        creation_id: creation.id,
        render_id: shotstackData.response.id,
        status: 'rendering'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Create video error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
